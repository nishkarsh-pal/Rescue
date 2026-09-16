/**
 * Lightweight command console backed by the same deterministic engine the
 * Agentforce RESCUE_AGENT invokes (RescueOptimizationService). Lets a user type
 * a command scoped to one incident (approve, replan/what-if, generate) and logs
 * every interaction to AI_Decision__c for the same audit trail the agent uses.
 */
public with sharing class RescueAgentConsoleController {

    public class AgentReply {
        @AuraEnabled public String reply;
        @AuraEnabled public String actionTaken;
        @AuraEnabled public Id planId;
    }

    @AuraEnabled
    public static AgentReply sendCommand(Id incidentId, String message) {
        if (incidentId == null) {
            throw new AuraHandledException('An incident must be selected before sending a command.');
        }

        Emergency_Incident__c incident = [
            SELECT Id, Name, Status__c, Situation_Summary__c
            FROM Emergency_Incident__c
            WHERE Id = :incidentId
            LIMIT 1
        ];

        List<Response_Plan__c> plans = [
            SELECT Id, Approval_Status__c, AI_Recommendation__c, Estimated_Coverage__c, Risk_Score__c
            FROM Response_Plan__c
            WHERE Incident__c = :incidentId
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];
        Response_Plan__c latestPlan = plans.isEmpty() ? null : plans[0];

        String lowerMessage = String.isBlank(message) ? '' : message.toLowerCase();
        AgentReply reply = new AgentReply();

        if (containsAny(lowerMessage, new List<String>{ 'approve', 'confirm', 'authorize', 'dispatch', 'allocate' })) {
            if (latestPlan == null) {
                reply.reply = 'There is no response plan yet for ' + incident.Name + '. Ask me to generate a recommendation first.';
            } else if (latestPlan.Approval_Status__c != 'Pending Approval') {
                reply.reply = 'The current plan for ' + incident.Name + ' is "' + latestPlan.Approval_Status__c + '" and is not waiting for approval.';
            } else {
                RescueOptimizationService.approvePlan(latestPlan.Id);
                reply.reply = 'Approved. Resources are reserved/allocated and shipments are dispatched for ' + incident.Name + '.';
                reply.actionTaken = 'Allocated and executed';
                reply.planId = latestPlan.Id;
            }
        } else if (containsAny(lowerMessage, new List<String>{ 'replan', 'what if', 'what-if', 'reallocate', 'simulate', 'blocked', 'change' })) {
            RescueOptimizationService.WhatIfResult simulation = RescueOptimizationService.simulateWhatIf(incidentId, message);
            reply.reply = simulation.recommendation + ' ' + simulation.reason + ' (Coverage ' + simulation.currentCoverage + '% -> ' + simulation.proposedCoverage + '%)';
            reply.actionTaken = 'Simulated';
            reply.planId = latestPlan != null ? latestPlan.Id : null;
        } else if (containsAny(lowerMessage, new List<String>{ 'generate', 'recommend', 'new plan', 'prioritize' }) || latestPlan == null) {
            Id newPlanId = RescueOptimizationService.generatePlan(incidentId);
            reply.reply = 'Generated a new recommendation for ' + incident.Name + '. It is awaiting human approval.';
            reply.actionTaken = 'Recommended';
            reply.planId = newPlanId;
        } else {
            reply.reply = latestPlan != null
                ? latestPlan.AI_Recommendation__c + ' Current status: ' + incident.Status__c + '.'
                : 'No response plan yet for ' + incident.Name + '. Ask me to generate one.';
            reply.actionTaken = 'Status update';
            reply.planId = latestPlan != null ? latestPlan.Id : null;
        }

        insert new AI_Decision__c(
            Incident__c = incidentId,
            Response_Plan__c = reply.planId,
            Agent__c = 'RESCUE Coordinator Agent',
            Decision__c = reply.reply,
            Reason__c = 'Coordinator command: ' + message,
            Evidence__c = 'Incident status=' + incident.Status__c,
            Confidence__c = latestPlan != null ? latestPlan.Confidence__c : null,
            Risk__c = latestPlan != null && latestPlan.Risk_Score__c >= 70 ? 'High' : latestPlan != null && latestPlan.Risk_Score__c >= 40 ? 'Medium' : 'Low',
            Action_Taken__c = reply.actionTaken,
            Human_Approval__c = reply.actionTaken == 'Allocated and executed',
            Timestamp__c = System.now()
        );

        return reply;
    }

    private static Boolean containsAny(String text, List<String> keywords) {
        for (String keyword : keywords) {
            if (text.contains(keyword)) {
                return true;
            }
        }
        return false;
    }
}
