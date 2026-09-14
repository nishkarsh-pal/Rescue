public with sharing class RescueGeneratePlanAction {
    @InvocableMethod(label='RESCUE Generate Allocation Plan' description='Generates a response plan for an existing incident.')
    public static List<RescueAgentActions.ActionResult> generatePlan(List<RescueAgentActions.PlanRequest> requests) {
        List<RescueAgentActions.ActionResult> results = new List<RescueAgentActions.ActionResult>();
        for (RescueAgentActions.PlanRequest request : requests) {
            Id planId = RescueOptimizationService.generatePlan(request.incidentId);
            RescueAgentActions.ActionResult result = new RescueAgentActions.ActionResult();
            result.recordId = planId;
            result.message = 'Generated response plan and AI decision audit record.';
            results.add(result);
        }
        return results;
    }
}