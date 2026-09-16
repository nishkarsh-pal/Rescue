@IsTest
private class RescueIncidentFeedControllerTest {
    @IsTest
    static void importsSampleFeedAndProcessesApproval() {
        Test.startTest();
        RescueIncidentFeedController.importSampleFeed();
        Test.stopTest();

        List<RescueIncidentFeedController.IncidentSummary> summaries = RescueIncidentFeedController.getIncidents();
        System.assert(!summaries.isEmpty(), 'Importing the sample feed should create incidents.');

        RescueIncidentFeedController.IncidentSummary summary = summaries[0];
        System.assertNotEquals(null, summary.latestPlan, 'A response plan should already be recommended for the incident.');

        RescueIncidentFeedController.approvePlan(summary.latestPlan.Id);

        Response_Plan__c plan = [SELECT Approval_Status__c FROM Response_Plan__c WHERE Id = :summary.latestPlan.Id];
        System.assertEquals('Approved', plan.Approval_Status__c);
    }
}
