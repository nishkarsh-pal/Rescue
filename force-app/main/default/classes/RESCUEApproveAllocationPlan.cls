public with sharing class RESCUEApproveAllocationPlan {
    @InvocableMethod(label='RESCUEApproveAllocationPlan' description='Approve, modify, or reject a proposed allocation plan.')
    public static List<RescueResponseActions.ApprovalResult> run(List<RescueResponseActions.ApprovalRequest> requests) {
        return RescueResponseActions.approveAllocationPlan(requests);
    }
}
