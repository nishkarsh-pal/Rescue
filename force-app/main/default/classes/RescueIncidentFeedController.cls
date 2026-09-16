/**
 * Backend for the rescueIncidentFeed LWC — incident map/list screen showing
 * disasters ingested from ReliefWeb and their progress through the RESCUE pipeline.
 */
public with sharing class RescueIncidentFeedController {

    public class IncidentSummary {
        @AuraEnabled public Emergency_Incident__c incident;
        @AuraEnabled public Response_Plan__c latestPlan;
        @AuraEnabled public Integer openRequestCount;
    }

    @AuraEnabled(cacheable=true)
    public static List<IncidentSummary> getIncidents() {
        List<Emergency_Incident__c> incidents = [
            SELECT Id, Name, Severity__c, Status__c, Location__c, Country__c, Disaster_Type__c,
                   Source__c, External_Id__c, Latitude__c, Longitude__c, Population_Affected__c,
                   Situation_Summary__c, Profile_Overview__c, Detected_Date__c, Start_Date__c
            FROM Emergency_Incident__c
            ORDER BY Detected_Date__c DESC NULLS LAST, CreatedDate DESC
            LIMIT 50
        ];

        Set<Id> incidentIds = new Map<Id, Emergency_Incident__c>(incidents).keySet();

        Map<Id, Response_Plan__c> latestPlanByIncident = new Map<Id, Response_Plan__c>();
        for (Response_Plan__c plan : [
            SELECT Id, Incident__c, Plan_Version__c, Estimated_Coverage__c, Estimated_ETA_Hours__c,
                   Risk_Score__c, Confidence__c, Approval_Status__c, AI_Recommendation__c, CreatedDate
            FROM Response_Plan__c
            WHERE Incident__c IN :incidentIds
            ORDER BY Incident__c, CreatedDate DESC
        ]) {
            if (!latestPlanByIncident.containsKey(plan.Incident__c)) {
                latestPlanByIncident.put(plan.Incident__c, plan);
            }
        }

        Map<Id, Integer> openRequestCounts = new Map<Id, Integer>();
        for (AggregateResult ar : [
            SELECT Incident__c incidentId, COUNT(Id) total
            FROM Resource_Request__c
            WHERE Incident__c IN :incidentIds AND Status__c != 'Fulfilled'
            GROUP BY Incident__c
        ]) {
            openRequestCounts.put((Id) ar.get('incidentId'), (Integer) ar.get('total'));
        }

        List<IncidentSummary> summaries = new List<IncidentSummary>();
        for (Emergency_Incident__c incident : incidents) {
            IncidentSummary summary = new IncidentSummary();
            summary.incident = incident;
            summary.latestPlan = latestPlanByIncident.get(incident.Id);
            summary.openRequestCount = openRequestCounts.containsKey(incident.Id) ? openRequestCounts.get(incident.Id) : 0;
            summaries.add(summary);
        }
        return summaries;
    }

    @AuraEnabled
    public static ReliefWebIncidentImportService.ImportResult importSampleFeed() {
        StaticResource feed = [SELECT Body FROM StaticResource WHERE Name = 'ReliefWebSampleFeed' LIMIT 1];
        return ReliefWebIncidentImportService.importPayload(feed.Body.toString());
    }

    @AuraEnabled
    public static ReliefWebIncidentImportService.ImportResult importPayload(String jsonBody) {
        return ReliefWebIncidentImportService.importPayload(jsonBody);
    }

    @AuraEnabled
    public static Id processIncident(Id incidentId) {
        return ReliefWebIncidentImportService.processIncidentForAgent(incidentId);
    }

    @AuraEnabled
    public static void approvePlan(Id responsePlanId) {
        RescueOptimizationService.approvePlan(responsePlanId);
    }
}
