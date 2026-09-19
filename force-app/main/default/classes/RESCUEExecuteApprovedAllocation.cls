public with sharing class RESCUEExecuteApprovedAllocation {
    @InvocableMethod(label='RESCUEExecuteApprovedAllocation' description='Reserve inventory and execute an approved allocation plan.')
    public static List<RescueResponseActions.ExecuteResult> run(List<RescueResponseActions.ExecuteRequest> requests) {
        return RescueResponseActions.executeApprovedAllocation(requests);
    }
}
