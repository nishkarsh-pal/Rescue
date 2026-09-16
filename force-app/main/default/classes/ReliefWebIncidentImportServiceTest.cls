@IsTest
private class ReliefWebIncidentImportServiceTest {
    private static final String SAMPLE_JSON = '{"data":[{"id":"90001","fields":{"id":90001,"name":"Test Cyclone - Demo","description":"A test cyclone description used for unit testing.","status":"alert","glide":"TC-TEST-0001","date":{"created":"2026-09-15T02:10:00+00:00"},"type":[{"id":1,"name":"Tropical Cyclone","primary":true}],"country":[{"id":1,"name":"Testland","location":{"lon":10.5,"lat":5.5},"primary":true}],"maps":{"png":{"url":"https://reliefweb.int"}}}}]}';

    @IsTest
    static void importsNewIncidentAndSendsToAgent() {
        Test.startTest();
        ReliefWebIncidentImportService.ImportResult result = ReliefWebIncidentImportService.importPayload(SAMPLE_JSON);
        Test.stopTest();

        System.assertEquals(1, result.incidentsCreated);
        System.assertEquals(0, result.incidentsUpdated);
        System.assertEquals(1, result.processedIncidentIds.size());

        Emergency_Incident__c incident = [
            SELECT Status__c, Severity__c, Country__c, Disaster_Type__c, External_Id__c, Profile_Overview__c
            FROM Emergency_Incident__c
            WHERE External_Id__c = '90001'
            LIMIT 1
        ];
        System.assertEquals('Recommended', incident.Status__c);
        System.assertEquals('Critical', incident.Severity__c);
        System.assertEquals('Testland', incident.Country__c);
        System.assertEquals('Tropical Cyclone', incident.Disaster_Type__c);
        System.assert(String.isNotBlank(incident.Profile_Overview__c));

        System.assert([SELECT COUNT() FROM Response_Plan__c WHERE Incident__c = :incident.Id] > 0, 'A recommended plan should be generated automatically.');
    }

    @IsTest
    static void reimportingSamePayloadUpdatesInsteadOfDuplicating() {
        ReliefWebIncidentImportService.importPayload(SAMPLE_JSON);

        Test.startTest();
        ReliefWebIncidentImportService.ImportResult result = ReliefWebIncidentImportService.importPayload(SAMPLE_JSON);
        Test.stopTest();

        System.assertEquals(0, result.incidentsCreated);
        System.assertEquals(1, result.incidentsUpdated);
        System.assertEquals(1, [SELECT COUNT() FROM Emergency_Incident__c WHERE External_Id__c = '90001']);
    }
}
