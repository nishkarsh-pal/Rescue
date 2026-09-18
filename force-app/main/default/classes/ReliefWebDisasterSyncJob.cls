/**
 * DM-001 hourly sync entry point: runs the ReliefWeb list + detail callouts via
 * ReliefWebDisasterService and upserts Emergency_Incident__c records. Scheduled
 * by ReliefWebDisasterSyncScheduler, or can be enqueued directly for on-demand sync.
 */
public with sharing class ReliefWebDisasterSyncJob implements Queueable, Database.AllowsCallouts {

    public void execute(QueueableContext context) {
        try {
            ReliefWebDisasterService.SyncResult result = ReliefWebDisasterService.syncLatestDisasters();
            System.debug(LoggingLevel.INFO, 'ReliefWeb disaster sync: ' + result.incidentsCreated + ' created, ' + result.incidentsUpdated + ' updated.');
            if (!result.errors.isEmpty()) {
                System.debug(LoggingLevel.WARN, 'ReliefWeb disaster sync completed with errors: ' + result.errors);
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'ReliefWeb disaster sync job failed: ' + e.getMessage());
        }
    }
}
