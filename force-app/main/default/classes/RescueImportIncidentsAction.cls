public with sharing class RescueImportIncidentsAction {
    public class ImportRequest {
        @InvocableVariable(required=true label='ReliefWeb JSON Payload')
        public String jsonPayload;
    }

    @InvocableMethod(label='RESCUE Import Incidents From Feed' description='Parses a ReliefWeb-style JSON payload, creates new Emergency Incident records (Detect), and sends each new incident through Understand → Prioritize → Simulate → Recommend.')
    public static List<RescueAgentActions.ActionResult> importIncidents(List<ImportRequest> requests) {
        List<RescueAgentActions.ActionResult> results = new List<RescueAgentActions.ActionResult>();
        for (ImportRequest request : requests) {
            ReliefWebIncidentImportService.ImportResult importResult = ReliefWebIncidentImportService.importPayload(request.jsonPayload);
            RescueAgentActions.ActionResult result = new RescueAgentActions.ActionResult();
            result.recordId = importResult.processedIncidentIds.isEmpty() ? null : importResult.processedIncidentIds[0];
            result.message = 'Created ' + importResult.incidentsCreated + ' new incident(s) and updated ' + importResult.incidentsUpdated +
                '. Each new incident was sent through Understand, Prioritize, Simulate and Recommend, and now awaits human approval.';
            results.add(result);
        }
        return results;
    }
}
