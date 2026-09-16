@IsTest
private class RescueOptimizationServiceTest {
    @IsTest
    static void generatesApprovesAndSimulatesPlan() {
        Warehouse__c warehouse = new Warehouse__c(
            Name = 'Test Warehouse',
            Location__c = 'North Test Hub',
            Status__c = 'Operational',
            Operating_Capacity__c = 95
        );
        insert warehouse;

        Relief_Resource__c water = new Relief_Resource__c(
            Name = 'Test Water',
            Resource_Type__c = 'Water',
            Quantity_Available__c = 25000,
            Warehouse__c = warehouse.Id,
            Owner_Organization__c = 'Test Partner',
            Status__c = 'Available',
            Expiration_Date__c = Date.today().addYears(1)
        );
        Relief_Resource__c medicine = new Relief_Resource__c(
            Name = 'Test Medicine',
            Resource_Type__c = 'Medicine',
            Quantity_Available__c = 3000,
            Warehouse__c = warehouse.Id,
            Owner_Organization__c = 'Test Partner',
            Status__c = 'Available',
            Expiration_Date__c = Date.today().addYears(1)
        );
        insert new List<Relief_Resource__c>{ water, medicine };

        Emergency_Incident__c incident = new Emergency_Incident__c(
            Name = 'District A Flood',
            Severity__c = 'Critical',
            Location__c = 'District A',
            Population_Affected__c = 15000,
            Status__c = 'Detected',
            Start_Date__c = System.now(),
            Situation_Summary__c = 'Major flood with urgent drinking water and medical needs.'
        );
        insert incident;

        insert new List<Resource_Request__c>{
            new Resource_Request__c(Incident__c = incident.Id, Resource_Type__c = 'Water', Quantity__c = 20000, Priority__c = 'Critical', Required_By__c = System.now().addHours(6), Status__c = 'Open'),
            new Resource_Request__c(Incident__c = incident.Id, Resource_Type__c = 'Medicine', Quantity__c = 2000, Priority__c = 'Critical', Required_By__c = System.now().addHours(6), Status__c = 'Open')
        };

        Test.startTest();
        Id planId = RescueOptimizationService.generatePlan(incident.Id);
        RescueOptimizationService.WhatIfResult simulation = RescueOptimizationService.simulateWhatIf(incident.Id, 'District B reports a critical water shortage and Road X is blocked.');
        RescueOptimizationService.approvePlan(planId);
        Test.stopTest();

        Response_Plan__c plan = [SELECT Approval_Status__c, Estimated_Coverage__c FROM Response_Plan__c WHERE Id = :planId];
        System.assertEquals('Approved', plan.Approval_Status__c);
        System.assert(plan.Estimated_Coverage__c > 0, 'Plan should have measurable coverage.');
        System.assert(simulation.proposedCoverage >= simulation.currentCoverage, 'What-if should not reduce proposed coverage in this demo model.');
        System.assertEquals(2, [SELECT COUNT() FROM Shipment__c WHERE Response_Plan__c = :planId]);
        System.assert([SELECT COUNT() FROM AI_Decision__c WHERE Incident__c = :incident.Id] >= 3, 'Each agent action should create audit records.');
    }

    @IsTest
    static void controllerCreatesIncidentAndDashboardData() {
        Test.startTest();
        RescueCommandCenterController.seedDemoData();
        Id planId = RescueCommandCenterController.createIncidentFromInstruction('A major flood has occurred in District A. 15000 people are affected. We need drinking water, food and medical supplies within 6 hours.');
        RescueCommandCenterController.DashboardData data = RescueCommandCenterController.getDashboardData();
        Test.stopTest();

        System.assertNotEquals(null, planId);
        System.assert(!data.incidents.isEmpty(), 'Dashboard should return incidents.');
        System.assert(!data.plans.isEmpty(), 'Dashboard should return plans.');
        System.assert(!data.evaluations.isEmpty(), 'Dashboard should return AI evaluations.');
    }
}