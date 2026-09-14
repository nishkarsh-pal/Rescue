public with sharing class RescueApprovePlanAction {
    @InvocableMethod(label='RESCUE Approve Response Plan' description='Approves a response plan and creates shipment records for execution.')
    public static List<RescueAgentActions.ActionResult> approvePlan(List<RescueAgentActions.ApprovalRequest> requests) {
        List<RescueAgentActions.ActionResult> results = new List<RescueAgentActions.ActionResult>();
        for (RescueAgentActions.ApprovalRequest request : requests) {
            RescueOptimizationService.approvePlan(request.responsePlanId);
            RescueAgentActions.ActionResult result = new RescueAgentActions.ActionResult();
            result.recordId = request.responsePlanId;
            result.message = 'Approved response plan and created shipment execution records.';
            results.add(result);
        }
        return results;
    }
}