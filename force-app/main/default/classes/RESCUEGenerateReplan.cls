public with sharing class RESCUEGenerateReplan {
    @InvocableMethod(label='RESCUEGenerateReplan' description='Generate a versioned proposed replan without changing existing shipments.')
    public static List<RescueResponseActions.ReplanResult> run(List<RescueResponseActions.ReplanRequest> requests) {
        return RescueResponseActions.generateReplan(requests);
    }
}
