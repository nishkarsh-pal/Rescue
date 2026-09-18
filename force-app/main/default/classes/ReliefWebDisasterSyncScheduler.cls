/**
 * Schedules the hourly ReliefWeb disaster sync (DM-001). Schedulable itself can't
 * perform callouts, so execute() just enqueues ReliefWebDisasterSyncJob.
 */
public with sharing class ReliefWebDisasterSyncScheduler implements Schedulable {

    public static final String JOB_NAME = 'RESCUE ReliefWeb Disaster Sync';
    private static final String EVERY_TWO_HOURS_CRON = '0 0 0/2 * * ?';

    public void execute(SchedulableContext context) {
        System.enqueueJob(new ReliefWebDisasterSyncJob());
    }

    /** Idempotently schedules the job (every 2 hours); returns the existing job's Id if already scheduled. */
    public static Id scheduleHourly() {
        for (CronTrigger existing : [
            SELECT Id
            FROM CronTrigger
            WHERE CronJobDetail.Name = :JOB_NAME
            LIMIT 1
        ]) {
            return existing.Id;
        }
        return System.schedule(JOB_NAME, EVERY_TWO_HOURS_CRON, new ReliefWebDisasterSyncScheduler());
    }
}
