public with sharing class RESCUEGetIncidentStatus {
    @InvocableMethod(label='RESCUEGetIncidentStatus' description='Return the current incident response snapshot.')
    public static List<RescueResponseActions.StatusResult> run(List<RescueResponseActions.StatusRequest> requests) {
        return RescueResponseActions.getIncidentStatus(requests);
    }
}
