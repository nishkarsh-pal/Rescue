/**
 * Schedule this class (e.g. every 30 minutes) to periodically pull new disasters
 * from ReliefWeb and feed them into the RESCUE incident pipeline automatically.
 * Example: System.schedule('RESCUE ReliefWeb Sync', '0 0/30 * * * ?', new ReliefWebIncidentSyncScheduler());
 */
public with sharing class ReliefWebIncidentSyncScheduler implements Schedulable {
    public void execute(SchedulableContext context) {
        System.enqueueJob(new ReliefWebSyncJob());
    }
}
