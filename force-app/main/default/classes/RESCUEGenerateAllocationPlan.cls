public with sharing class RESCUEGenerateAllocationPlan {
    @InvocableMethod(label='RESCUEGenerateAllocationPlan' description='Create an explainable proposed allocation plan without reserving inventory.')
    public static List<RescueResponseActions.PlanResult> run(List<RescueResponseActions.PlanRequest> requests) {
        return RescueResponseActions.generateAllocationPlan(requests);
    }
}
