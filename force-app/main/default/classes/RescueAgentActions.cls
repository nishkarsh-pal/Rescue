public with sharing class RescueAgentActions {
    public class IncidentRequest {
        @InvocableVariable(required=true label='Coordinator Instruction')
        public String instruction;
    }

    public class PlanRequest {
        @InvocableVariable(required=true label='Incident Id')
        public Id incidentId;
    }

    public class ApprovalRequest {
        @InvocableVariable(required=true label='Response Plan Id')
        public Id responsePlanId;
    }

    public class WhatIfRequest {
        @InvocableVariable(required=true label='Incident Id')
        public Id incidentId;

        @InvocableVariable(required=true label='Scenario')
        public String scenario;
    }

    public class ActionResult {
        @InvocableVariable(label='Record Id')
        public Id recordId;

        @InvocableVariable(label='Message')
        public String message;
    }

}