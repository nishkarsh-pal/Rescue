/**
 * Ingests disaster records from a ReliefWeb-style JSON payload, creates/updates
 * Emergency_Incident__c records (Detect), and immediately hands each new incident
 * to the RESCUE agent pipeline for Understand → Prioritize → Simulate → Recommend.
 */
public with sharing class ReliefWebIncidentImportService {

    public class ImportResult {
        @AuraEnabled public Integer incidentsCreated = 0;
        @AuraEnabled public Integer incidentsUpdated = 0;
        @AuraEnabled public List<Id> processedIncidentIds = new List<Id>();
    }

    public static ImportResult importPayload(String jsonBody) {
        ImportResult result = new ImportResult();
        if (String.isBlank(jsonBody)) {
            return result;
        }

        Map<String, Object> root = (Map<String, Object>) JSON.deserializeUntyped(jsonBody);
        List<Object> records = (List<Object>) root.get('data');
        if (records == null) {
            return result;
        }

        Map<String, Emergency_Incident__c> byExternalId = new Map<String, Emergency_Incident__c>();
        for (Object recordObj : records) {
            Emergency_Incident__c incident = parseIncident((Map<String, Object>) recordObj);
            if (incident != null) {
                byExternalId.put(incident.External_Id__c, incident);
            }
        }
        if (byExternalId.isEmpty()) {
            return result;
        }

        Map<String, Emergency_Incident__c> existing = new Map<String, Emergency_Incident__c>();
        for (Emergency_Incident__c existingIncident : [
            SELECT Id, External_Id__c
            FROM Emergency_Incident__c
            WHERE External_Id__c IN :byExternalId.keySet()
        ]) {
            existing.put(existingIncident.External_Id__c, existingIncident);
        }

        List<Emergency_Incident__c> toUpsert = new List<Emergency_Incident__c>();
        Set<String> newExternalIds = new Set<String>();
        for (Emergency_Incident__c incident : byExternalId.values()) {
            if (existing.containsKey(incident.External_Id__c)) {
                incident.Id = existing.get(incident.External_Id__c).Id;
                result.incidentsUpdated++;
            } else {
                newExternalIds.add(incident.External_Id__c);
                result.incidentsCreated++;
            }
            toUpsert.add(incident);
        }

        upsert toUpsert External_Id__c;

        // Detect → Understand → Prioritize → Simulate → Recommend for every newly detected incident.
        for (Emergency_Incident__c incident : toUpsert) {
            if (newExternalIds.contains(incident.External_Id__c)) {
                processIncidentForAgent(incident.Id);
                result.processedIncidentIds.add(incident.Id);
            }
        }

        return result;
    }

    /**
     * Sends an existing (already detected) incident to the RESCUE agent pipeline:
     * ensures baseline needs + inventory exist, then runs Prioritize → Simulate → Recommend.
     * The plan stops at "Pending Approval" and awaits Human Approve before Allocate/Execute.
     */
    public static Id processIncidentForAgent(Id incidentId) {
        Emergency_Incident__c incident = [
            SELECT Id, Severity__c, Status__c
            FROM Emergency_Incident__c
            WHERE Id = :incidentId
            LIMIT 1
        ];

        update new Emergency_Incident__c(Id = incidentId, Status__c = 'Understanding');

        if ([SELECT COUNT() FROM Resource_Request__c WHERE Incident__c = :incidentId] == 0) {
            createDefaultResourceRequests(incidentId, incident.Severity__c);
        }

        RescueCommandCenterController.ensureDemoInventory();

        update new Emergency_Incident__c(Id = incidentId, Status__c = 'Prioritized');

        return RescueOptimizationService.generatePlan(incidentId);
    }

    private static void createDefaultResourceRequests(Id incidentId, String severity) {
        Decimal multiplier = severity == 'Critical' ? 1.5 : severity == 'Low' ? 0.5 : 1;
        insert new List<Resource_Request__c>{
            new Resource_Request__c(Incident__c = incidentId, Resource_Type__c = 'Water', Quantity__c = (20000 * multiplier).setScale(0), Priority__c = 'Critical', Required_By__c = System.now().addHours(6), Status__c = 'Open'),
            new Resource_Request__c(Incident__c = incidentId, Resource_Type__c = 'Food', Quantity__c = (15000 * multiplier).setScale(0), Priority__c = 'High', Required_By__c = System.now().addHours(8), Status__c = 'Open'),
            new Resource_Request__c(Incident__c = incidentId, Resource_Type__c = 'Medicine', Quantity__c = (2000 * multiplier).setScale(0), Priority__c = 'Critical', Required_By__c = System.now().addHours(6), Status__c = 'Open')
        };
    }

    private static Emergency_Incident__c parseIncident(Map<String, Object> recordObj) {
        if (recordObj == null) {
            return null;
        }
        Map<String, Object> fields = (Map<String, Object>) recordObj.get('fields');
        if (fields == null) {
            return null;
        }

        String externalId = String.valueOf(fields.get('id'));
        String name = (String) fields.get('name');
        String description = (String) fields.get('description');
        String reliefStatus = (String) fields.get('status');
        String glide = (String) fields.get('glide');

        String disasterType;
        List<Object> types = (List<Object>) fields.get('type');
        if (types != null && !types.isEmpty()) {
            Map<String, Object> primaryType = (Map<String, Object>) types[0];
            disasterType = (String) primaryType.get('name');
        }

        String countryName;
        Decimal lat;
        Decimal lon;
        List<Object> countries = (List<Object>) fields.get('country');
        if (countries != null && !countries.isEmpty()) {
            Map<String, Object> primaryCountry = (Map<String, Object>) countries[0];
            countryName = (String) primaryCountry.get('name');
            Map<String, Object> location = (Map<String, Object>) primaryCountry.get('location');
            if (location != null) {
                lon = location.get('lon') == null ? null : Decimal.valueOf(String.valueOf(location.get('lon')));
                lat = location.get('lat') == null ? null : Decimal.valueOf(String.valueOf(location.get('lat')));
            }
        }

        DateTime detectedDate;
        Map<String, Object> dateInfo = (Map<String, Object>) fields.get('date');
        if (dateInfo != null && dateInfo.get('created') != null) {
            detectedDate = (DateTime) JSON.deserialize('"' + dateInfo.get('created') + '"', DateTime.class);
        }

        String mapUrl;
        Map<String, Object> maps = (Map<String, Object>) fields.get('maps');
        if (maps != null) {
            Map<String, Object> png = (Map<String, Object>) maps.get('png');
            if (png != null) {
                mapUrl = (String) png.get('url');
            }
        }

        return new Emergency_Incident__c(
            External_Id__c = externalId,
            Name = String.isBlank(name) ? 'Untitled Disaster ' + externalId : name.left(80),
            Source__c = 'ReliefWeb',
            Disaster_Type__c = disasterType,
            Country__c = countryName,
            Location__c = countryName,
            Latitude__c = lat,
            Longitude__c = lon,
            Severity__c = mapSeverity(reliefStatus),
            Situation_Summary__c = description,
            Profile_Overview__c = description,
            Map_Image_URL__c = mapUrl,
            Detected_Date__c = detectedDate,
            Status__c = 'Detected',
            Start_Date__c = detectedDate == null ? System.now() : detectedDate,
            Population_Affected__c = null
        );
    }

    private static String mapSeverity(String reliefStatus) {
        if (reliefStatus == 'alert') {
            return 'Critical';
        }
        if (reliefStatus == 'current') {
            return 'High';
        }
        if (reliefStatus == 'past') {
            return 'Medium';
        }
        return 'High';
    }
}
