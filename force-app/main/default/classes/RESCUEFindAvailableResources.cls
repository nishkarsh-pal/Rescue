public with sharing class RESCUEFindAvailableResources {
    @InvocableMethod(label='RESCUEFindAvailableResources' description='Find and rank fresh available resources near the incident.')
    public static List<RescueResponseActions.FindResult> run(List<RescueResponseActions.FindRequest> requests) {
        return RescueResponseActions.findAvailableResources(requests);
    }
}
