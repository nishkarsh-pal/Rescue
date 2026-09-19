public with sharing class RESCUEExecuteReplan {
    @InvocableMethod(label='RESCUEExecuteReplan' description='Execute an approved replan and supersede the prior response plan.')
    public static List<RescueResponseActions.ExecuteReplanResult> run(List<RescueResponseActions.ExecuteReplanRequest> requests) {
        return RescueResponseActions.executeReplan(requests);
    }
}
