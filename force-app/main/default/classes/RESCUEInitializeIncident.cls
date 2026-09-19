public with sharing class RESCUEInitializeIncident {
    @InvocableMethod(label='RESCUEInitializeIncident' description='Parse incident JSON and update the emergency incident.')
    public static List<RescueResponseActions.InitializeResult> run(List<RescueResponseActions.InitializeRequest> requests) {
        return RescueResponseActions.initializeIncident(requests);
    }
}
