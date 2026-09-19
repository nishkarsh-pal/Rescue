public with sharing class RescueCommandCenterController {
    public class DashboardData {
        @AuraEnabled public List<Emergency_Incident__c> incidents;
        @AuraEnabled public List<Warehouse__c> warehouses;
        @AuraEnabled public List<Resource_Request__c> requests;
        @AuraEnabled public List<Relief_Resource__c> resources;
        @AuraEnabled public List<Response_Plan__c> plans;
        @AuraEnabled public List<Allocation__c> allocations;
        @AuraEnabled public List<Shipment__c> shipments;
        @AuraEnabled public List<AI_Decision__c> decisions;
        @AuraEnabled public List<AI_Evaluation__c> evaluations;
    }

    @AuraEnabled(cacheable=true)
    public static DashboardData getDashboardData() {
        DashboardData data = new DashboardData();
        data.incidents = [
            SELECT Id, Name, Severity__c, Location__c, Country__c, Disaster_Type__c, Source__c, Latitude__c, Longitude__c,
                   Population_Affected__c, Status__c, Start_Date__c, Detected_Date__c, Situation_Summary__c, Profile_Overview__c
            FROM Emergency_Incident__c
            ORDER BY Detected_Date__c DESC
        ];
        data.warehouses = [
            SELECT Id, Name, Location__c, Latitude__c, Longitude__c, Status__c, Operating_Capacity__c
            FROM Warehouse__c
            ORDER BY Name
        ];
        data.requests = [
            SELECT Id, Name, Incident__c, Resource_Type__c, Quantity__c, Priority__c, Required_By__c, Status__c
            FROM Resource_Request__c
            ORDER BY CreatedDate DESC
            LIMIT 50
        ];
        data.resources = [
            SELECT Id, Name, Resource_Type__c, Quantity_Available__c, Available_To_Allocate__c, Warehouse__c, Warehouse__r.Name, Warehouse__r.Location__c, Status__c, Expiration_Date__c
            FROM Relief_Resource__c
            ORDER BY Quantity_Available__c DESC
        ];
        data.plans = [
            SELECT Id, Name, Incident__c, Plan_Version__c, Total_Resources__c, Estimated_Coverage__c, Estimated_ETA_Hours__c, Risk_Score__c, Confidence__c, Approval_Status__c, AI_Recommendation__c, CreatedDate
            FROM Response_Plan__c
            ORDER BY CreatedDate DESC
            LIMIT 20
        ];
        data.allocations = [
            SELECT Id, Incident__c, Response_Plan__c, Resource_Request__c, Resource_Request__r.Resource_Type__c,
                   Relief_Resource__c, Relief_Resource__r.Name, Relief_Resource__r.Warehouse__c,
                   Relief_Resource__r.Warehouse__r.Name, Relief_Resource__r.Warehouse__r.Location__c,
                   Quantity__c, Status__c
            FROM Allocation__c
            ORDER BY CreatedDate DESC
            LIMIT 100
        ];
        data.shipments = [
            SELECT Id, Name, Incident__c, Response_Plan__c, Origin__c, Destination__c, Origin_Latitude__c, Origin_Longitude__c, Destination_Latitude__c, Destination_Longitude__c, Carrier__c, Route__c, ETA__c, Status__c
            FROM Shipment__c
            ORDER BY CreatedDate DESC
            LIMIT 30
        ];
        data.decisions = [
            SELECT Id, Name, Agent__c, Decision__c, Reason__c, Evidence__c, Confidence__c, Risk__c, Action_Taken__c, Human_Approval__c, Timestamp__c
            FROM AI_Decision__c
            ORDER BY CreatedDate DESC
            LIMIT 30
        ];
        data.evaluations = [
            SELECT Id, Name, Agent__c, Confidence__c, Quality_Score__c, Evaluation_Status__c, Recommendations__c
            FROM AI_Evaluation__c
            ORDER BY CreatedDate DESC
            LIMIT 10
        ];
        return data;
    }

    @AuraEnabled
    public static Id createIncidentFromInstruction(String instruction) {
        String text = String.isBlank(instruction) ? 'Major flood. 15000 people affected. Drinking water, food and medical supplies needed within 6 hours.' : instruction;
        String incidentName = text.toLowerCase().contains('flood') ? 'District Flood Response' : 'Emergency Response';

        Emergency_Incident__c incident = new Emergency_Incident__c(
            Name = incidentName + ' ' + DateTime.now().format('yyyy-MM-dd HH:mm'),
            Severity__c = text.toLowerCase().contains('critical') || text.toLowerCase().contains('major') ? 'Critical' : 'High',
            Location__c = extractLocation(text),
            Population_Affected__c = extractPopulation(text),
            Status__c = 'Detected',
            Start_Date__c = System.now(),
            Situation_Summary__c = text
        );
        insert incident;

        List<Resource_Request__c> requests = new List<Resource_Request__c>{
            new Resource_Request__c(Incident__c = incident.Id, Resource_Type__c = 'Water', Quantity__c = 20000, Priority__c = 'Critical', Required_By__c = System.now().addHours(6), Status__c = 'Open'),
            new Resource_Request__c(Incident__c = incident.Id, Resource_Type__c = 'Food', Quantity__c = 15000, Priority__c = 'High', Required_By__c = System.now().addHours(8), Status__c = 'Open'),
            new Resource_Request__c(Incident__c = incident.Id, Resource_Type__c = 'Medicine', Quantity__c = 2000, Priority__c = 'Critical', Required_By__c = System.now().addHours(6), Status__c = 'Open')
        };
        insert requests;

        ensureDemoInventory();
        return RescueOptimizationService.generatePlan(incident.Id);
    }

    @AuraEnabled
    public static Id generatePlan(Id incidentId) {
        return RescueOptimizationService.generatePlan(incidentId);
    }

    @AuraEnabled
    public static void approvePlan(Id responsePlanId) {
        RescueOptimizationService.approvePlan(responsePlanId);
    }

    @AuraEnabled
    public static RescueOptimizationService.WhatIfResult runWhatIf(Id incidentId, String scenario) {
        return RescueOptimizationService.simulateWhatIf(incidentId, scenario);
    }

    @AuraEnabled
    public static void seedDemoData() {
        ensureDemoInventory();
        if ([SELECT COUNT() FROM AI_Evaluation__c] == 0) {
            insert new List<AI_Evaluation__c>{
                new AI_Evaluation__c(Agent__c = 'Situation Intelligence Agent', Confidence__c = 96, Quality_Score__c = 95, Evaluation_Status__c = 'Pass', Recommendations__c = 214),
                new AI_Evaluation__c(Agent__c = 'Needs Assessment Agent', Confidence__c = 94, Quality_Score__c = 93, Evaluation_Status__c = 'Pass', Recommendations__c = 188),
                new AI_Evaluation__c(Agent__c = 'Resource Intelligence Agent', Confidence__c = 97, Quality_Score__c = 96, Evaluation_Status__c = 'Pass', Recommendations__c = 205),
                new AI_Evaluation__c(Agent__c = 'Allocation & Optimization Agent', Confidence__c = 91, Quality_Score__c = 90, Evaluation_Status__c = 'Pass', Recommendations__c = 176),
                new AI_Evaluation__c(Agent__c = 'Logistics Agent', Confidence__c = 95, Quality_Score__c = 92, Evaluation_Status__c = 'Pass', Recommendations__c = 161),
                new AI_Evaluation__c(Agent__c = 'Monitoring & Replanning Agent', Confidence__c = 93, Quality_Score__c = 91, Evaluation_Status__c = 'Pass', Recommendations__c = 140)
            };
        }
    }

    public static void ensureDemoInventory() {
        if ([SELECT COUNT() FROM Relief_Resource__c] > 0) {
            return;
        }

        Warehouse__c north = new Warehouse__c(Name = 'Warehouse North', Location__c = 'North Regional Hub', Latitude__c = 40.7128, Longitude__c = -74.0060, Status__c = 'Operational', Operating_Capacity__c = 92);
        Warehouse__c east = new Warehouse__c(Name = 'Warehouse East', Location__c = 'East Regional Hub', Latitude__c = 34.0522, Longitude__c = -118.2437, Status__c = 'Operational', Operating_Capacity__c = 88);
        insert new List<Warehouse__c>{ north, east };

        insert new List<Relief_Resource__c>{
            new Relief_Resource__c(Name = 'Water Bottles - North', Resource_Type__c = 'Water', Quantity_Available__c = 12000, Warehouse__c = north.Id, Owner_Organization__c = 'AidBridge', Status__c = 'Available', Expiration_Date__c = Date.today().addYears(1)),
            new Relief_Resource__c(Name = 'Water Bottles - East', Resource_Type__c = 'Water', Quantity_Available__c = 15000, Warehouse__c = east.Id, Owner_Organization__c = 'Global Water Partner', Status__c = 'Available', Expiration_Date__c = Date.today().addYears(1)),
            new Relief_Resource__c(Name = 'Food Rations - East', Resource_Type__c = 'Food', Quantity_Available__c = 20000, Warehouse__c = east.Id, Owner_Organization__c = 'Nutrition Relief', Status__c = 'Available', Expiration_Date__c = Date.today().addMonths(10)),
            new Relief_Resource__c(Name = 'Medical Kits - East', Resource_Type__c = 'Medicine', Quantity_Available__c = 3000, Warehouse__c = east.Id, Owner_Organization__c = 'MedSupply', Status__c = 'Available', Expiration_Date__c = Date.today().addMonths(18))
        };
    }

    private static String extractLocation(String text) {
        String lowerText = text.toLowerCase();
        if (lowerText.contains('district a')) {
            return 'District A';
        }
        if (lowerText.contains('district b')) {
            return 'District B';
        }
        return 'Emergency Zone';
    }

    private static Decimal extractPopulation(String text) {
        if (text != null && text.contains('15,000')) {
            return 15000;
        }
        if (text != null && text.contains('15000')) {
            return 15000;
        }
        return 10000;
    }
}