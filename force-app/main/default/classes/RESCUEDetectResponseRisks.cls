public with sharing class RESCUEDetectResponseRisks {
    @InvocableMethod(label='RESCUEDetectResponseRisks' description='Analyze the response plan for shipment, inventory, expiry, and critical-gap risks.')
    public static List<RescueResponseActions.RiskResult> run(List<RescueResponseActions.RiskRequest> requests) {
        return RescueResponseActions.detectResponseRisks(requests);
    }
}
