@RestResource(urlMapping='/rescue/v1/*')
global with sharing class RescueApi {
    global class ActionRequest {
        public String instruction;
        public Id incidentId;
        public Id responsePlanId;
        public String scenario;
    }

    global class ActionResponse {
        public Id planId;
        public Boolean approved;
        public RescueOptimizationService.WhatIfResult simulation;
    }

    @HttpGet
    global static void getDashboard() {
        writeJson(RescueCommandCenterController.getDashboardData());
    }

    @HttpPost
    global static void runAction() {
        String action = getAction();
        ActionRequest requestBody = parseBody();
        ActionResponse response = new ActionResponse();

        if (action == 'incidents') {
            requireValue(requestBody.instruction, 'instruction');
            response.planId = RescueCommandCenterController.createIncidentFromInstruction(requestBody.instruction);
            writeJson(response);
            return;
        }
        if (action == 'approve') {
            requireId(requestBody.responsePlanId, 'responsePlanId');
            RescueCommandCenterController.approvePlan(requestBody.responsePlanId);
            response.approved = true;
            writeJson(response);
            return;
        }
        if (action == 'simulate') {
            requireId(requestBody.incidentId, 'incidentId');
            requireValue(requestBody.scenario, 'scenario');
            response.simulation = RescueCommandCenterController.runWhatIf(requestBody.incidentId, requestBody.scenario);
            writeJson(response);
            return;
        }

        throw badRequest('Unsupported RESCUE action: ' + action);
    }

    private static void writeJson(Object value) {
        RestContext.response.addHeader('Content-Type', 'application/json');
        RestContext.response.responseBody = Blob.valueOf(JSON.serialize(value));
    }

    private static String getAction() {
        String path = RestContext.request.requestURI;
        List<String> segments = path.split('/');
        return segments.isEmpty() ? '' : segments[segments.size() - 1].toLowerCase();
    }

    private static ActionRequest parseBody() {
        String body = RestContext.request.requestBody == null ? null : RestContext.request.requestBody.toString();
        if (String.isBlank(body)) {
            throw badRequest('A JSON request body is required.');
        }
        try {
            return (ActionRequest) JSON.deserialize(body, ActionRequest.class);
        } catch (JSONException error) {
            throw badRequest('The request body must contain valid JSON.');
        }
    }

    private static void requireValue(String value, String fieldName) {
        if (String.isBlank(value)) {
            throw badRequest(fieldName + ' is required.');
        }
    }

    private static void requireId(Id value, String fieldName) {
        if (value == null) {
            throw badRequest(fieldName + ' is required.');
        }
    }

    private static AuraHandledException badRequest(String message) {
        RestContext.response.statusCode = 400;
        return new AuraHandledException(message);
    }
}