/**
 * Batch/async ingestion job: calls the ReliefWeb API (via Named Credential 'ReliefWeb')
 * and hands the raw JSON to ReliefWebIncidentImportService for incident creation + agent hand-off.
 * Schedule via ReliefWebIncidentSyncScheduler, or invoke directly for on-demand sync.
 */
public with sharing class ReliefWebSyncJob implements Queueable, Database.AllowsCallouts {

    public void execute(QueueableContext context) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:ReliefWeb/v2/disasters?appname=rescue-agentforce&limit=10&sort[]=date.created:desc');
        req.setMethod('GET');
        req.setTimeout(30000);

        try {
            HttpResponse res = new Http().send(req);
            if (res.getStatusCode() == 200) {
                ReliefWebIncidentImportService.importPayload(res.getBody());
            } else {
                System.debug(LoggingLevel.WARN, 'ReliefWeb sync failed with status ' + res.getStatusCode() + ': ' + res.getBody());
            }
        } catch (Exception e) {
            // No Named Credential configured, or the endpoint is unreachable in this org.
            System.debug(LoggingLevel.WARN, 'ReliefWeb sync callout error: ' + e.getMessage());
        }
    }
}
