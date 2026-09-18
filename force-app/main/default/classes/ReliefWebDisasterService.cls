/**
 * DM-001: Automated Emergency Incident creation/enrichment from ReliefWeb.
 * Calls the ReliefWeb Disasters list endpoint, then the per-disaster detail
 * endpoint (href), merges both into Emergency_Incident__c fields, and upserts
 * by External_Id__c so no duplicates are created. No Named Credential is
 * configured in this org, so callouts go directly to api.reliefweb.int
 * (see remoteSiteSettings/ReliefWeb_API.remoteSite-meta.xml).
 */
public with sharing class ReliefWebDisasterService {

    private static final String BASE_ENDPOINT = 'https://api.reliefweb.int/v2/disasters';
    private static final Integer TIMEOUT_MS = 30000;

    private static final Map<String, String> SEVERITY_BY_DISASTER_TYPE = new Map<String, String>{
        'Earthquake' => 'Critical',
        'Tsunami' => 'Critical',
        'Flood' => 'High',
        'Epidemic' => 'High',
        'Cyclone' => 'High',
        'Hurricane' => 'High',
        'Wildfire' => 'High',
        'Severe Local Storm' => 'Medium',
        'Storm' => 'Medium',
        'Landslide' => 'Medium',
        'Drought' => 'Medium'
    };

    public class SyncResult {
        public Integer incidentsCreated = 0;
        public Integer incidentsUpdated = 0;
        public List<String> errors = new List<String>();
    }

    /** Retrieves the latest disasters, enriches each via the detail endpoint, and upserts them. */
    public static SyncResult syncLatestDisasters() {
        SyncResult result = new SyncResult();

        List<Object> disasters = fetchDisasterList();
        if (disasters.isEmpty()) {
            return result;
        }

        Map<String, Emergency_Incident__c> incidentsByExternalId = new Map<String, Emergency_Incident__c>();
        for (Object item : disasters) {
            Map<String, Object> disasterSummary = (Map<String, Object>) item;
            String externalId = String.valueOf(disasterSummary.get('id'));
            if (String.isBlank(externalId)) {
                continue;
            }
            try {
                Map<String, Object> detailFields = fetchDisasterDetail(disasterSummary);
                Map<String, Object> listFields = (Map<String, Object>) disasterSummary.get('fields');
                incidentsByExternalId.put(externalId, buildIncident(externalId, listFields, detailFields));
            } catch (Exception e) {
                result.errors.add(externalId + ': ' + e.getMessage());
            }
        }

        if (!incidentsByExternalId.isEmpty()) {
            upsertIncidents(incidentsByExternalId, result);
        }
        return result;
    }

    private static List<Object> fetchDisasterList() {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(BASE_ENDPOINT + '?appname=cginfinity-rescue-sp34k&limit=50&sort[]=date.created:desc');
        req.setMethod('GET');
        req.setTimeout(TIMEOUT_MS);

        HttpResponse res = new Http().send(req);
        if (res.getStatusCode() != 200) {
            System.debug(LoggingLevel.WARN, 'ReliefWeb disaster list call failed: ' + res.getStatusCode() + ' ' + res.getBody());
            return new List<Object>();
        }

        Map<String, Object> root = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        List<Object> data = (List<Object>) root.get('data');
        return data == null ? new List<Object>() : data;
    }

    /** Calls GET href (falling back to GET {base}/{id}) and returns the detail record's "fields" map. */
    private static Map<String, Object> fetchDisasterDetail(Map<String, Object> disasterSummary) {
        String href = (String) disasterSummary.get('href');
        String endpoint = String.isNotBlank(href) ? href : BASE_ENDPOINT + '/' + disasterSummary.get('id');
        endpoint += (endpoint.contains('?') ? '&' : '?') + 'appname=cginfinity-rescue-sp34k';

        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('GET');
        req.setTimeout(TIMEOUT_MS);

        HttpResponse res = new Http().send(req);
        if (res.getStatusCode() != 200) {
            System.debug(LoggingLevel.WARN, 'ReliefWeb disaster detail call failed: ' + res.getStatusCode() + ' ' + res.getBody());
            return null;
        }

        Map<String, Object> root = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        List<Object> data = (List<Object>) root.get('data');
        if (data == null || data.isEmpty()) {
            return null;
        }
        Map<String, Object> firstRecord = (Map<String, Object>) data[0];
        return (Map<String, Object>) firstRecord.get('fields');
    }

    /** Merges list + detail fields into an Emergency_Incident__c; detail values win, list is fallback. */
    private static Emergency_Incident__c buildIncident(String externalId, Map<String, Object> listFields, Map<String, Object> detailFields) {
        listFields = listFields == null ? new Map<String, Object>() : listFields;
        detailFields = detailFields == null ? new Map<String, Object>() : detailFields;

        String name = (String) coalesce(detailFields.get('name'), listFields.get('name'));
        String description = (String) coalesce(detailFields.get('description'), listFields.get('description'));
        String overview = (String) getNested(detailFields, new List<String>{ 'profile', 'overview' });
        String reliefWebStatus = (String) listFields.get('status');

        String disasterType = extractPrimaryTypeName(detailFields);
        if (String.isBlank(disasterType)) {
            disasterType = extractPrimaryTypeName(listFields);
        }

        String countryName;
        Decimal lat;
        Decimal lon;
        Map<String, Object> primaryCountry = (Map<String, Object>) detailFields.get('primary_country');
        if (primaryCountry != null) {
            countryName = (String) primaryCountry.get('name');
            Map<String, Object> location = (Map<String, Object>) primaryCountry.get('location');
            if (location != null) {
                lat = toDecimal(location.get('lat'));
                lon = toDecimal(location.get('lon'));
            }
        }
        if (String.isBlank(countryName) || lat == null || lon == null) {
            Map<String, Object> firstCountry = extractFirstCountry(listFields);
            if (firstCountry != null) {
                if (String.isBlank(countryName)) {
                    countryName = (String) firstCountry.get('name');
                }
                Map<String, Object> location = (Map<String, Object>) firstCountry.get('location');
                if (location != null) {
                    if (lat == null) { lat = toDecimal(location.get('lat')); }
                    if (lon == null) { lon = toDecimal(location.get('lon')); }
                }
            }
        }

        String mapUrl = extractMapUrl(detailFields);
        if (String.isBlank(mapUrl)) {
            mapUrl = extractMapUrl(listFields);
        }

        DateTime createdDate = parseDate((String) getNested(detailFields, new List<String>{ 'date', 'created' }));
        if (createdDate == null) {
            createdDate = parseDate((String) getNested(listFields, new List<String>{ 'date', 'created' }));
        }
        DateTime eventDate = parseDate((String) getNested(detailFields, new List<String>{ 'date', 'event' }));

        return new Emergency_Incident__c(
            External_Id__c = externalId,
            Name = String.isBlank(name) ? 'Untitled Disaster ' + externalId : name.left(80),
            Source__c = 'ReliefWeb',
            Disaster_Type__c = disasterType,
            Country__c = countryName,
            Location__c = countryName,
            Latitude__c = lat,
            Longitude__c = lon,
            Situation_Summary__c = description,
            Profile_Overview__c = String.isNotBlank(overview) ? overview : description,
            Map_Image_URL__c = mapUrl,
            Severity__c = mapSeverity(disasterType),
            Detected_Date__c = createdDate,
            Start_Date__c = eventDate != null ? eventDate : createdDate,
            ReliefWeb_Status__c = reliefWebStatus
        );
    }

    /** Creates new incidents (Status__c = 'Detected') or updates existing ones by External_Id__c, without resetting in-flight pipeline status. */
    private static void upsertIncidents(Map<String, Emergency_Incident__c> incidentsByExternalId, SyncResult result) {
        Map<String, Emergency_Incident__c> existingByExternalId = new Map<String, Emergency_Incident__c>();
        for (Emergency_Incident__c existing : [
            SELECT Id, External_Id__c
            FROM Emergency_Incident__c
            WHERE External_Id__c IN :incidentsByExternalId.keySet()
        ]) {
            existingByExternalId.put(existing.External_Id__c, existing);
        }

        List<Emergency_Incident__c> toUpsert = new List<Emergency_Incident__c>();
        for (Emergency_Incident__c incident : incidentsByExternalId.values()) {
            if (existingByExternalId.containsKey(incident.External_Id__c)) {
                incident.Id = existingByExternalId.get(incident.External_Id__c).Id;
                result.incidentsUpdated++;
            } else {
                incident.Status__c = 'Detected';
                result.incidentsCreated++;
            }
            toUpsert.add(incident);
        }

        upsert toUpsert External_Id__c;
        System.debug(LoggingLevel.INFO, 'ReliefWeb disaster upsert: ' + result.incidentsCreated + ' created, ' + result.incidentsUpdated + ' updated.');
    }

    private static String extractPrimaryTypeName(Map<String, Object> fields) {
        Object primaryType = fields.get('primary_type');
        if (primaryType instanceof Map<String, Object>) {
            return (String) ((Map<String, Object>) primaryType).get('name');
        }
        List<Object> types = (List<Object>) fields.get('type');
        if (types == null || types.isEmpty()) {
            return null;
        }
        for (Object typeObj : types) {
            Map<String, Object> typeMap = (Map<String, Object>) typeObj;
            if (isPrimary(typeMap)) {
                return (String) typeMap.get('name');
            }
        }
        return (String) ((Map<String, Object>) types[0]).get('name');
    }

    private static Map<String, Object> extractFirstCountry(Map<String, Object> fields) {
        List<Object> countries = (List<Object>) fields.get('country');
        if (countries == null || countries.isEmpty()) {
            return null;
        }
        for (Object countryObj : countries) {
            Map<String, Object> countryMap = (Map<String, Object>) countryObj;
            if (isPrimary(countryMap)) {
                return countryMap;
            }
        }
        return (Map<String, Object>) countries[0];
    }

    private static Boolean isPrimary(Map<String, Object> entry) {
        Object flag = entry.get('primary');
        return flag instanceof Boolean && (Boolean) flag;
    }

    private static String extractMapUrl(Map<String, Object> fields) {
        Map<String, Object> maps = (Map<String, Object>) fields.get('maps');
        if (maps == null) {
            return null;
        }
        Map<String, Object> png = (Map<String, Object>) maps.get('png');
        return png == null ? null : (String) png.get('url');
    }

    private static String mapSeverity(String disasterType) {
        if (String.isNotBlank(disasterType) && SEVERITY_BY_DISASTER_TYPE.containsKey(disasterType)) {
            return SEVERITY_BY_DISASTER_TYPE.get(disasterType);
        }
        return 'Low';
    }

    private static Object getNested(Map<String, Object> fields, List<String> path) {
        Object current = fields;
        for (String key : path) {
            if (!(current instanceof Map<String, Object>)) {
                return null;
            }
            current = ((Map<String, Object>) current).get(key);
        }
        return current;
    }

    private static Decimal toDecimal(Object value) {
        return value == null ? null : Decimal.valueOf(String.valueOf(value));
    }

    private static DateTime parseDate(String isoDate) {
        if (String.isBlank(isoDate)) {
            return null;
        }
        return (DateTime) JSON.deserialize('"' + isoDate + '"', DateTime.class);
    }

    private static Object coalesce(Object primary, Object fallback) {
        return primary != null ? primary : fallback;
    }
}
