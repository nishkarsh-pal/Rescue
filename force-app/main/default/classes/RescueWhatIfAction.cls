public with sharing class RescueWhatIfAction {
    @InvocableMethod(label='RESCUE Simulate Reallocation' description='Runs a what-if replanning simulation for an incident.')
    public static List<RescueAgentActions.ActionResult> simulateReallocation(List<RescueAgentActions.WhatIfRequest> requests) {
        List<RescueAgentActions.ActionResult> results = new List<RescueAgentActions.ActionResult>();
        for (RescueAgentActions.WhatIfRequest request : requests) {
            RescueOptimizationService.WhatIfResult simulation = RescueOptimizationService.simulateWhatIf(request.incidentId, request.scenario);
            RescueAgentActions.ActionResult result = new RescueAgentActions.ActionResult();
            result.recordId = request.incidentId;
            result.message = simulation.summary + ' Current coverage: ' + simulation.currentCoverage + '%. Proposed coverage: ' + simulation.proposedCoverage + '%. ' + simulation.recommendation;
            results.add(result);
        }
        return results;
    }
}