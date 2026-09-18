@IsTest
private class RescueAgentConsoleControllerTest {
    private class AgentApiMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest request) {
            HttpResponse response = new HttpResponse();
            response.setStatusCode(200);
            response.setHeader('Content-Type', 'application/json');
            if (request.getEndpoint().contains('/oauth2/token')) {
                response.setBody('{"access_token":"test-token"}');
            } else if (request.getEndpoint().contains('/agents/')) {
                response.setBody('{"sessionId":"test-session","messages":[{"message":"Hello from the real agent."}]}');
            } else {
                response.setBody('{"messages":[{"message":"Agent response to prompt."}]}');
            }
            return response;
        }
    }

    @IsTest
    static void routesGenerateSimulateAndApproveCommands() {
        Warehouse__c warehouse = new Warehouse__c(Name = 'Test Warehouse', Location__c = 'Hub', Status__c = 'Operational', Operating_Capacity__c = 90);
        insert warehouse;
        insert new Relief_Resource__c(Name = 'Test Water', Resource_Type__c = 'Water', Quantity_Available__c = 20000, Warehouse__c = warehouse.Id, Owner_Organization__c = 'Test Partner', Status__c = 'Available', Expiration_Date__c = Date.today().addYears(1));

        Emergency_Incident__c incident = new Emergency_Incident__c(
            Name = 'Test Incident',
            Severity__c = 'Critical',
            Location__c = 'Test Zone',
            Status__c = 'Detected',
            Start_Date__c = System.now(),
            Situation_Summary__c = 'Test flood scenario.'
        );
        insert incident;
        insert new Resource_Request__c(Incident__c = incident.Id, Resource_Type__c = 'Water', Quantity__c = 10000, Priority__c = 'Critical', Required_By__c = System.now().addHours(6), Status__c = 'Open');

        Test.startTest();
        RescueAgentConsoleController.AgentReply generateReply = RescueAgentConsoleController.sendCommand(incident.Id, 'Please generate a recommendation');
        RescueAgentConsoleController.AgentReply simulateReply = RescueAgentConsoleController.sendCommand(incident.Id, 'What if road X is blocked?');
        RescueAgentConsoleController.AgentReply approveReply = RescueAgentConsoleController.sendCommand(incident.Id, 'I approve, please dispatch');
        Test.stopTest();

        System.assertNotEquals(null, generateReply.planId);
        System.assertEquals('Simulated', simulateReply.actionTaken);
        System.assertEquals('Allocated and executed', approveReply.actionTaken);
        System.assertEquals(3, [SELECT COUNT() FROM AI_Decision__c WHERE Incident__c = :incident.Id]);
    }

    @IsTest
    static void startsSessionAndSendsSequencedMessage() {
        Test.setMock(HttpCalloutMock.class, new AgentApiMock());

        Test.startTest();
        RescueAgentConsoleController.AgentSession session = RescueAgentConsoleController.startAgentSession('57904eb6-5352-4c5e-adf6-5f100572cf5d');
        RescueAgentConsoleController.AgentMessageReply reply = RescueAgentConsoleController.sendAgentMessage(session.sessionId, 1, 'Show me the current incident status.');
        Test.stopTest();

        System.assertEquals('test-session', session.sessionId);
        System.assertEquals('Hello from the real agent.', session.welcomeMessage);
        System.assertEquals('Agent response to prompt.', reply.reply);
        System.assertEquals(1, reply.sequenceId);
    }
}
