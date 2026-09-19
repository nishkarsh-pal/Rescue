/**
 * Lightweight command console backed by the same deterministic engine the
 * Agentforce RESCUE_AGENT invokes (RescueOptimizationService). Lets a user type
 * a command scoped to one incident (approve, replan/what-if, generate) and logs
 * every interaction to AI_Decision__c for the same audit trail the agent uses.
 */
public with sharing class RescueAgentConsoleController {

    private static final String CONFIG_NAME = 'Default';
    private static final Integer AGENT_CALLOUT_TIMEOUT_MS = 120000;

    public class AgentReply {
        @AuraEnabled public String reply;
        @AuraEnabled public String actionTaken;
        @AuraEnabled public Id planId;
    }

    public class AgentSession {
        @AuraEnabled public String sessionId;
        @AuraEnabled public String externalSessionKey;
        @AuraEnabled public String welcomeMessage;
    }

    public class AgentMessageReply {
        @AuraEnabled public String reply;
        @AuraEnabled public Integer sequenceId;
    }

    @AuraEnabled
    public static AgentSession startAgentSession(String externalSessionKey) {
        if (String.isBlank(externalSessionKey)) {
            throw new AuraHandledException('An external session key is required.');
        }

        Agentforce_Integration__mdt config = getAgentConfig();
        String accessToken = requestAccessToken(config);
        HttpRequest request = new HttpRequest();
        request.setEndpoint(config.Api_Endpoint__c + '/agents/' + config.Agent_Id__c + '/sessions');
        request.setMethod('POST');
        request.setTimeout(AGENT_CALLOUT_TIMEOUT_MS);
        request.setHeader('Accept', 'application/json');
        request.setHeader('Content-Type', 'application/json');
        request.setHeader('Authorization', 'Bearer ' + accessToken);
        request.setBody(JSON.serialize(new Map<String, Object>{
            'externalSessionKey' => externalSessionKey,
            'instanceConfig' => new Map<String, Object>{ 'endpoint' => config.Instance_Endpoint__c },
            'bypassUser' => true
        }));

        Map<String, Object> response = sendJson(request);
        AgentSession session = new AgentSession();
        session.sessionId = (String) response.get('sessionId');
        session.externalSessionKey = externalSessionKey;
        session.welcomeMessage = firstMessage(response);
        return session;
    }

    @AuraEnabled
    public static AgentMessageReply sendAgentMessage(String sessionId, Integer sequenceId, String message) {
        if (String.isBlank(sessionId) || sequenceId == null || String.isBlank(message)) {
            throw new AuraHandledException('A session, sequence ID, and message are required.');
        }

        Agentforce_Integration__mdt config = getAgentConfig();
        HttpRequest request = new HttpRequest();
        request.setEndpoint(config.Api_Endpoint__c + '/sessions/' + EncodingUtil.urlEncode(sessionId, 'UTF-8') + '/messages');
        request.setMethod('POST');
        request.setTimeout(AGENT_CALLOUT_TIMEOUT_MS);
        request.setHeader('Accept', 'application/json');
        request.setHeader('Content-Type', 'application/json');
        request.setHeader('Authorization', 'Bearer ' + requestAccessToken(config));
        request.setBody(JSON.serialize(new Map<String, Object>{
            'message' => new Map<String, Object>{
                'sequenceId' => sequenceId,
                'type' => 'Text',
                'text' => message
            }
        }));

        Map<String, Object> response = sendJson(request);
        AgentMessageReply reply = new AgentMessageReply();
        reply.reply = firstMessage(response);
        reply.sequenceId = sequenceId;
        return reply;
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

    private static Agentforce_Integration__mdt getAgentConfig() {
        Agentforce_Integration__mdt config = Agentforce_Integration__mdt.getInstance(CONFIG_NAME);
        if (config == null || String.isBlank(config.Client_Id__c) || String.isBlank(config.Client_Secret__c)
            || String.isBlank(config.Agent_Id__c) || String.isBlank(config.Api_Endpoint__c)
            || String.isBlank(config.Token_Endpoint__c) || String.isBlank(config.Instance_Endpoint__c)) {
            throw new AuraHandledException('Agentforce integration is not configured. Update the Default Agentforce Integration custom metadata record.');
        }
        return config;
    }

    private static String requestAccessToken(Agentforce_Integration__mdt config) {
        HttpRequest request = new HttpRequest();
        request.setEndpoint(config.Token_Endpoint__c);
        request.setMethod('POST');
        request.setTimeout(AGENT_CALLOUT_TIMEOUT_MS);
        request.setHeader('Accept', 'application/json');
        request.setHeader('Content-Type', 'application/x-www-form-urlencoded');
        request.setBody('grant_type=client_credentials'
            + '&client_id=' + EncodingUtil.urlEncode(config.Client_Id__c, 'UTF-8')
            + '&client_secret=' + EncodingUtil.urlEncode(config.Client_Secret__c, 'UTF-8'));

        Map<String, Object> response = sendJson(request);
        String accessToken = (String) response.get('access_token');
        if (String.isBlank(accessToken)) {
            throw new AuraHandledException('The OAuth token response did not contain an access token.');
        }
        return accessToken;
    }

    private static Map<String, Object> sendJson(HttpRequest request) {
        HttpResponse response;
        try {
            response = new Http().send(request);
        } catch (System.CalloutException error) {
            throw new AuraHandledException('Agentforce callout timed out or failed at ' + request.getEndpoint() + ': ' + error.getMessage());
        }
        if (response.getStatusCode() < 200 || response.getStatusCode() >= 300) {
            throw new AuraHandledException('Agentforce API returned HTTP ' + response.getStatusCode() + ': ' + response.getBody());
        }
        return (Map<String, Object>) JSON.deserializeUntyped(response.getBody());
    }

    private static String firstMessage(Map<String, Object> response) {
        List<Object> messages = (List<Object>) response.get('messages');
        if (messages == null || messages.isEmpty()) {
            return '';
        }
        Map<String, Object> message = (Map<String, Object>) messages[0];
        return (String) message.get('message');
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
