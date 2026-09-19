public with sharing class RESCUEAssessNeeds {
    @InvocableMethod(label='RESCUEAssessNeeds' description='Bulk-create resource requests from JSON needs.')
    public static List<RescueResponseActions.NeedsResult> run(List<RescueResponseActions.NeedsRequest> requests) {
        return RescueResponseActions.assessNeeds(requests);
    }
}
