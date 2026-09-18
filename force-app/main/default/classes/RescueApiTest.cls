@IsTest
private class RescueApiTest {
    @TestSetup
    static void setupData() {
        RescueCommandCenterController.seedDemoData();
        RescueCommandCenterController.createIncidentFromInstruction(
            'A major flood has occurred in District A. 15000 people are affected.'
        );
    }

    @IsTest
    static void returnsDashboardData() {
        setRequest('GET', '/services/apexrest/rescue/v1/dashboard', null);

        Test.startTest();
        RescueApi.getDashboard();
        Test.stopTest();

        Map<String, Object> dashboard = (Map<String, Object>) JSON.deserializeUntyped(
            RestContext.response.responseBody.toString()
        );
        System.assert(!((List<Object>) dashboard.get('incidents')).isEmpty());
        System.assert(!((List<Object>) dashboard.get('resources')).isEmpty());
    }

    @IsTest
    static void createsIncidentFromInstruction() {
        setRequest(
            'POST',
            '/services/apexrest/rescue/v1/incidents',
            '{"instruction":"Critical flood in District B affecting 15000 people."}'
        );

        Test.startTest();
        RescueApi.runAction();
        Test.stopTest();

        Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(
            RestContext.response.responseBody.toString()
        );
        System.assertNotEquals(null, result.get('planId'));
    }

    @IsTest
    static void simulatesAndApprovesResponsePlan() {
        Response_Plan__c plan = [SELECT Id, Incident__c FROM Response_Plan__c LIMIT 1];
        setRequest(
            'POST',
            '/services/apexrest/rescue/v1/simulate',
            JSON.serialize(new Map<String, Object>{
                'incidentId' => plan.Incident__c,
                'scenario' => 'Road B17 is blocked.'
            })
        );

        Test.startTest();
        RescueApi.runAction();
        Map<String, Object> simulation = (Map<String, Object>) JSON.deserializeUntyped(
            RestContext.response.responseBody.toString()
        );

        setRequest(
            'POST',
            '/services/apexrest/rescue/v1/approve',
            JSON.serialize(new Map<String, Object>{ 'responsePlanId' => plan.Id })
        );
        RescueApi.runAction();
        Test.stopTest();

        Map<String, Object> approval = (Map<String, Object>) JSON.deserializeUntyped(
            RestContext.response.responseBody.toString()
        );
        System.assertNotEquals(null, simulation.get('simulation'));
        System.assertEquals(true, approval.get('approved'));
    }

    @IsTest
    static void rejectsMissingActionInput() {
        setRequest('POST', '/services/apexrest/rescue/v1/simulate', '{}');

        Test.startTest();
        try {
            RescueApi.runAction();
            Assert.fail('Expected missing incidentId to be rejected.');
        } catch (AuraHandledException error) {
            System.assertEquals(400, RestContext.response.statusCode);
        }
        Test.stopTest();
    }

    private static void setRequest(String method, String uri, String body) {
        RestRequest request = new RestRequest();
        request.httpMethod = method;
        request.requestURI = uri;
        if (body != null) {
            request.requestBody = Blob.valueOf(body);
        }
        RestContext.request = request;
        RestContext.response = new RestResponse();
    }
}