public with sharing class RESCUEModifyAllocationPlan {
    @InvocableMethod(label='RESCUEModifyAllocationPlan' description='Recalculate a proposed allocation plan from explicit user changes without reserving inventory or creating shipments.')
    public static List<RescueResponseActions.ReplanResult> run(List<RescueResponseActions.ReplanRequest> requests) {
        return RescueResponseActions.generateReplan(requests);
    }
}