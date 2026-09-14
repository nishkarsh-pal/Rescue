public with sharing class RescueCreateIncidentAction {
    @InvocableMethod(label='RESCUE Create Incident and Plan' description='Creates an emergency incident from a natural language instruction, generates structured needs, and produces an AI response plan.')
    public static List<RescueAgentActions.ActionResult> createIncidentAndPlan(List<RescueAgentActions.IncidentRequest> requests) {
        List<RescueAgentActions.ActionResult> results = new List<RescueAgentActions.ActionResult>();
        for (RescueAgentActions.IncidentRequest request : requests) {
            Id planId = RescueCommandCenterController.createIncidentFromInstruction(request.instruction);
            RescueAgentActions.ActionResult result = new RescueAgentActions.ActionResult();
            result.recordId = planId;
            result.message = 'Created incident, needs, response plan, proposed allocations, and AI decision audit record.';
            results.add(result);
        }
        return results;
    }
}