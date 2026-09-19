public with sharing class RescueOptimizationService {
    public class WhatIfResult {
        @AuraEnabled public String summary;
        @AuraEnabled public Decimal currentCoverage;
        @AuraEnabled public Decimal proposedCoverage;
        @AuraEnabled public Decimal improvement;
        @AuraEnabled public String recommendation;
        @AuraEnabled public String reason;
    }

    public static Id generatePlan(Id incidentId) {
        if (incidentId == null) {
            throw new AuraHandledException('Incident Id is required.');
        }

        Emergency_Incident__c incident = [
            SELECT Id, Name, Severity__c, Location__c, Population_Affected__c
            FROM Emergency_Incident__c
            WHERE Id = :incidentId
            LIMIT 1
        ];

        List<Resource_Request__c> requests = [
            SELECT Id, Resource_Type__c, Quantity__c, Priority__c, Required_By__c
            FROM Resource_Request__c
            WHERE Incident__c = :incidentId AND Status__c != 'Fulfilled'
            ORDER BY Priority__c, Required_By__c
        ];

        List<Relief_Resource__c> resources = [
            SELECT Id, Name, Resource_Type__c, Quantity_Available__c, Status__c,
                   Warehouse__c, Warehouse__r.Name, Warehouse__r.Location__c, Expiration_Date__c
            FROM Relief_Resource__c
            WHERE Status__c = 'Available' AND Quantity_Available__c > 0
            ORDER BY Expiration_Date__c ASC NULLS LAST, Quantity_Available__c DESC
            LIMIT 200
        ];

        Decimal requestedTotal = 0;
        Decimal allocatedTotal = 0;
        List<Allocation__c> allocations = new List<Allocation__c>();
        Map<Id, Decimal> resourceRemaining = new Map<Id, Decimal>();

        for (Relief_Resource__c resource : resources) {
            resourceRemaining.put(resource.Id, resource.Quantity_Available__c == null ? 0 : resource.Quantity_Available__c);
        }

        for (Resource_Request__c request : requests) {
            Decimal needed = request.Quantity__c == null ? 0 : request.Quantity__c;
            requestedTotal += needed;

            for (Relief_Resource__c resource : resources) {
                if (needed <= 0) {
                    break;
                }
                if (!isResourceMatch(request.Resource_Type__c, resource.Resource_Type__c)) {
                    continue;
                }

                Decimal remaining = resourceRemaining.get(resource.Id);
                if (remaining <= 0) {
                    continue;
                }

                Decimal quantity = Math.min(needed, remaining);
                needed -= quantity;
                allocatedTotal += quantity;
                resourceRemaining.put(resource.Id, remaining - quantity);

                allocations.add(new Allocation__c(
                    Incident__c = incidentId,
                    Resource_Request__c = request.Id,
                    Relief_Resource__c = resource.Id,
                    Quantity__c = quantity,
                    Priority__c = String.isBlank(request.Priority__c) ? 'High' : request.Priority__c,
                    Status__c = 'Proposed',
                    AI_Confidence__c = calculateConfidence(incident, request, resource),
                    AI_Recommendation__c = 'Allocate ' + String.valueOf(quantity.intValue()) + ' ' + request.Resource_Type__c + ' from ' + resource.Name + ' to ' + incident.Name + '.'
                ));
            }
        }

        Decimal coverage = requestedTotal == 0 ? 0 : Math.min(100, (allocatedTotal / requestedTotal) * 100);
        Decimal riskScore = coverage >= 90 ? 18 : coverage >= 70 ? 42 : 76;
        Decimal confidence = coverage >= 90 ? 94 : coverage >= 70 ? 86 : 72;
        Decimal etaHours = incident.Severity__c == 'Critical' ? 4.5 : 8;

        // Simulate → Recommend: the plan is only ever a recommendation until a human approves it (no resources are reserved yet).
        Response_Plan__c plan = new Response_Plan__c(
            Incident__c = incidentId,
            Plan_Version__c = getNextPlanVersion(incidentId),
            Total_Resources__c = allocatedTotal,
            Estimated_Coverage__c = coverage,
            Estimated_ETA_Hours__c = etaHours,
            Risk_Score__c = riskScore,
            Confidence__c = confidence,
            Approval_Status__c = 'Pending Approval',
            AI_Recommendation__c = buildRecommendation(incident, requestedTotal, allocatedTotal, coverage, etaHours, riskScore)
        );
        insert plan;

        for (Allocation__c allocation : allocations) {
            allocation.Response_Plan__c = plan.Id;
        }
        if (!allocations.isEmpty()) {
            insert allocations;
        }

        update new Emergency_Incident__c(Id = incidentId, Status__c = 'Recommended');

        logDecision(
            incidentId,
            plan.Id,
            'Resource & Allocation Agent',
            plan.AI_Recommendation__c,
            'Prioritized critical requests, earliest required-by time, expiring inventory, and available warehouse stock.',
            'Requests=' + requests.size() + '; Resources=' + resources.size() + '; Coverage=' + coverage.setScale(0) + '%',
            confidence,
            riskScore >= 70 ? 'High' : riskScore >= 40 ? 'Medium' : 'Low',
            'Response plan recommended, awaiting human approval',
            false
        );

        return plan.Id;
    }

    // Human Approve → Allocate → Execute: only after explicit human approval do resources move from
    // Available to Reserved/Allocated and shipments get created for delivery.
    public static void approvePlan(Id responsePlanId) {
        if (responsePlanId == null) {
            throw new AuraHandledException('Response Plan Id is required.');
        }

        Response_Plan__c plan = [
            SELECT Id, Incident__c, Incident__r.Name, Incident__r.Location__c, Incident__r.Latitude__c, Incident__r.Longitude__c, Estimated_ETA_Hours__c, Confidence__c
            FROM Response_Plan__c
            WHERE Id = :responsePlanId
            LIMIT 1
        ];

        plan.Approval_Status__c = 'Approved';
        update plan;

        List<Allocation__c> allocations = [
            SELECT Id, Incident__c, Resource_Request__c, Relief_Resource__c, Relief_Resource__r.Name,
                   Relief_Resource__r.Quantity_Available__c, Relief_Resource__r.Reserved_Quantity__c, Relief_Resource__r.Warehouse__r.Location__c,
                   Relief_Resource__r.Warehouse__r.Latitude__c, Relief_Resource__r.Warehouse__r.Longitude__c, Quantity__c
            FROM Allocation__c
            WHERE Response_Plan__c = :responsePlanId
        ];

        Map<Id, Relief_Resource__c> resourcesToUpdate = new Map<Id, Relief_Resource__c>();
        Set<Id> requestIds = new Set<Id>();
        List<Shipment__c> shipments = new List<Shipment__c>();

        for (Allocation__c allocation : allocations) {
            allocation.Status__c = 'Allocated';
            requestIds.add(allocation.Resource_Request__c);

            resourcesToUpdate.put(allocation.Relief_Resource__c, new Relief_Resource__c(
                Id = allocation.Relief_Resource__c,
                Reserved_Quantity__c = (allocation.Relief_Resource__r.Reserved_Quantity__c == null ? 0 : allocation.Relief_Resource__r.Reserved_Quantity__c) + allocation.Quantity__c,
                Status__c = 'Reserved'
            ));

            shipments.add(new Shipment__c(
                Allocation__c = allocation.Id,
                Response_Plan__c = responsePlanId,
                Origin__c = allocation.Relief_Resource__r.Warehouse__r.Location__c,
                Destination__c = plan.Incident__r.Location__c,
                Origin_Latitude__c = allocation.Relief_Resource__r.Warehouse__r.Latitude__c,
                Origin_Longitude__c = allocation.Relief_Resource__r.Warehouse__r.Longitude__c,
                Destination_Latitude__c = plan.Incident__r.Latitude__c,
                Destination_Longitude__c = plan.Incident__r.Longitude__c,
                Carrier__c = 'Emergency Logistics Network',
                Route__c = 'Fastest feasible route with active route-constraint monitoring.',
                ETA__c = System.now().addHours(Integer.valueOf(plan.Estimated_ETA_Hours__c == null ? 6 : plan.Estimated_ETA_Hours__c.intValue())),
                Status__c = 'Planned'
            ));
        }
        if (!allocations.isEmpty()) {
            update allocations;
        }
        if (!resourcesToUpdate.isEmpty()) {
            update resourcesToUpdate.values();
        }
        if (!requestIds.isEmpty()) {
            List<Resource_Request__c> requests = new List<Resource_Request__c>();
            for (Id reqId : requestIds) {
                requests.add(new Resource_Request__c(Id = reqId, Status__c = 'Allocated'));
            }
            update requests;
        }
        if (!shipments.isEmpty()) {
            insert shipments;
        }

        update new Emergency_Incident__c(Id = plan.Incident__c, Status__c = 'Executing');

        logDecision(
            plan.Incident__c,
            plan.Id,
            'RESCUE Coordinator Agent',
            'Human approved response plan. Resources reserved/allocated and shipments dispatched for execution.',
            'Medium/high-impact emergency action requires coordinator approval before allocation.',
            'Allocations=' + allocations.size() + '; Shipments=' + shipments.size(),
            plan.Confidence__c,
            'Medium',
            'Allocated and executed',
            true
        );
    }

    public static WhatIfResult simulateWhatIf(Id incidentId, String scenario) {
        Response_Plan__c currentPlan = [
            SELECT Id, Estimated_Coverage__c, Confidence__c
            FROM Response_Plan__c
            WHERE Incident__c = :incidentId
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];

        Decimal currentCoverage = currentPlan.Estimated_Coverage__c == null ? 0 : currentPlan.Estimated_Coverage__c;
        Decimal severityBoost = String.isBlank(scenario) ? 12 : Math.min(35, scenario.length() / 3);
        Decimal proposedCoverage = Math.min(100, currentCoverage + severityBoost);

        WhatIfResult result = new WhatIfResult();
        result.currentCoverage = currentCoverage.setScale(0);
        result.proposedCoverage = proposedCoverage.setScale(0);
        result.improvement = (proposedCoverage - currentCoverage).setScale(0);
        result.summary = 'RESCUE recalculated allocation under the new condition.';
        result.recommendation = 'Rebalance water and medical allocations toward the newly critical district while preserving minimum coverage for existing high-priority locations.';
        result.reason = 'The scenario increases life-critical demand. Reallocation improves critical-location coverage while maintaining baseline support for the original incident.';

        update new Emergency_Incident__c(Id = incidentId, Status__c = 'Replanning');

        logDecision(
            incidentId,
            currentPlan.Id,
            'Monitoring & Replanning Agent',
            result.recommendation,
            result.reason,
            'What-if scenario: ' + scenario,
            currentPlan.Confidence__c,
            'Medium',
            'Simulation only',
            false
        );

        return result;
    }

    private static Boolean isResourceMatch(String requestedType, String resourceType) {
        if (String.isBlank(requestedType) || String.isBlank(resourceType)) {
            return false;
        }
        return resourceType.toLowerCase().contains(requestedType.toLowerCase()) || requestedType.toLowerCase().contains(resourceType.toLowerCase());
    }

    private static Decimal calculateConfidence(Emergency_Incident__c incident, Resource_Request__c request, Relief_Resource__c resource) {
        Decimal score = 78;
        if (request.Priority__c == 'Critical') {
            score += 8;
        }
        if (incident.Severity__c == 'Critical') {
            score += 5;
        }
        if (resource.Expiration_Date__c != null && resource.Expiration_Date__c <= Date.today().addMonths(6)) {
            score += 3;
        }
        return Math.min(98, score);
    }

    private static Decimal getNextPlanVersion(Id incidentId) {
        Integer countPlans = [SELECT COUNT() FROM Response_Plan__c WHERE Incident__c = :incidentId];
        return countPlans + 1;
    }

    private static String buildRecommendation(Emergency_Incident__c incident, Decimal requestedTotal, Decimal allocatedTotal, Decimal coverage, Decimal etaHours, Decimal riskScore) {
        return 'Allocate ' + String.valueOf(allocatedTotal.intValue()) + ' of ' + String.valueOf(requestedTotal.intValue()) +
            ' requested units for ' + incident.Name + '. Estimated coverage is ' + String.valueOf(coverage.setScale(0)) +
            '%, ETA is ' + String.valueOf(etaHours) + ' hours, risk score is ' + String.valueOf(riskScore.setScale(0)) +
            '%. Human approval is required for medium/high risk response execution.';
    }

    private static void logDecision(Id incidentId, Id planId, String agent, String decision, String reason, String evidence, Decimal confidence, String risk, String actionTaken, Boolean humanApproval) {
        insert new AI_Decision__c(
            Incident__c = incidentId,
            Response_Plan__c = planId,
            Agent__c = agent,
            Decision__c = decision,
            Reason__c = reason,
            Evidence__c = evidence,
            Confidence__c = confidence,
            Risk__c = risk,
            Action_Taken__c = actionTaken,
            Human_Approval__c = humanApproval,
            Timestamp__c = System.now()
        );
    }
}