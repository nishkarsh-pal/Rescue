public with sharing class RescueResponseActions {
    private static final Decimal EMERGENCY_TRANSPORT_SPEED_KM_PER_HOUR = 45;
    private static final Decimal HANDLING_BUFFER_HOURS = 1.0;
    public class InitializeRequest {
        @InvocableVariable(required=true) public String IncidentId;
        @InvocableVariable public String IncidentPayload;
    }
    public class InitializeResult {
        @InvocableVariable public String IncidentId;
        @InvocableVariable public String Severity;
        @InvocableVariable public Decimal Latitude;
        @InvocableVariable public Decimal Longitude;
        @InvocableVariable public Integer AffectedPopulation;
        @InvocableVariable public String PopulationEvidence;
        @InvocableVariable public String InitializationStatus;
    }
    public class NeedsRequest {
        @InvocableVariable(required=true) public String IncidentId;
        @InvocableVariable(required=true) public String ResourceNeeds;
    }
    public class NeedsResult {
        @InvocableVariable public String ResourceRequestIds;
        @InvocableVariable public String CreatedRequests;
        @InvocableVariable public String Status;
    }
    public class FindRequest {
        @InvocableVariable(required=true) public String IncidentId;
        @InvocableVariable public Decimal Latitude;
        @InvocableVariable public Decimal Longitude;
        @InvocableVariable public String ResourceRequestIds;
    }
    public class FindResult {
        @InvocableVariable public String ResourceCandidates;
        @InvocableVariable public String CandidateResourceIds;
        @InvocableVariable public String NearestWarehouse;
        @InvocableVariable public Decimal Distance;
        @InvocableVariable public Integer AvailableQuantity;
        @InvocableVariable public String ResourceEligibility;
    }
    public class PlanRequest {
        @InvocableVariable(required=true) public String IncidentId;
        @InvocableVariable public String ResourceRequestIds;
        @InvocableVariable public String CandidateResourceIds;
        @InvocableVariable public String OptimizationConstraints;
    }
    public class PlanResult {
        @InvocableVariable public String AllocationPlanId;
        @InvocableVariable public String AllocationRecords;
        @InvocableVariable public Integer TotalResources;
        @InvocableVariable public Decimal CoveragePercentage;
        @InvocableVariable public String EstimatedETA;
        @InvocableVariable public String RiskScore;
        @InvocableVariable public String UnmetNeeds;
        @InvocableVariable public String RecommendationReason;
    }
    public class ApprovalRequest {
        @InvocableVariable(required=true) public String AllocationPlanId;
        @InvocableVariable public String IncidentId;
        @InvocableVariable(required=true) public String ApprovalDecision;
        @InvocableVariable public String ModificationInstructions;
    }
    public class ApprovalResult {
        @InvocableVariable public String Status;
        @InvocableVariable public String UpdatedPlanId;
        @InvocableVariable public String Message;
    }
    public class ExecuteRequest {
        @InvocableVariable(required=true) public String AllocationPlanId;
        @InvocableVariable public String IncidentId;
    }
    public class ExecuteResult {
        @InvocableVariable public String ExecutionStatus;
        @InvocableVariable public String ResponsePlanId;
        @InvocableVariable public String ShipmentIds;
        @InvocableVariable public String ReservedResources;
        @InvocableVariable public String InventoryConflicts;
        @InvocableVariable public String Message;
    }
    public class StatusRequest {
        @InvocableVariable(required=true) public String IncidentId;
        @InvocableVariable public String ResponsePlanId;
    }
    public class StatusResult {
        @InvocableVariable public String IncidentSummary;
        @InvocableVariable public String OpenRequests;
        @InvocableVariable public String ActiveAllocations;
        @InvocableVariable public String ShipmentStatus;
        @InvocableVariable public Decimal CoveragePercentage;
        @InvocableVariable public String UnmetNeeds;
    }
    public class RiskRequest {
        @InvocableVariable(required=true) public String IncidentId;
        @InvocableVariable public String ResponsePlanId;
    }
    public class RiskResult {
        @InvocableVariable public String RiskSummary;
        @InvocableVariable public String DelayedShipments;
        @InvocableVariable public String InventoryChanges;
        @InvocableVariable public String RouteDisruptions;
        @InvocableVariable public String CriticalGaps;
        @InvocableVariable public String RiskScore;
    }
    public class ReplanRequest {
        @InvocableVariable(required=true) public String IncidentId;
        @InvocableVariable public String ResponsePlanId;
        @InvocableVariable public Integer PlanVersion;
        @InvocableVariable public String ReplanTrigger;
        @InvocableVariable public String Constraints;
        @InvocableVariable public String ModificationRequest;
        @InvocableVariable public String UserId;
    }
    public class ReplanResult {
        @InvocableVariable public String NewAllocationPlanId;
        @InvocableVariable public String AllocationRecords;
        @InvocableVariable public Decimal CoveragePercentage;
        @InvocableVariable public String EstimatedETA;
        @InvocableVariable public String RiskScore;
        @InvocableVariable public String UnmetNeeds;
        @InvocableVariable public String RecommendationReason;
    }
    public class ExecuteReplanRequest {
        @InvocableVariable(required=true) public String IncidentId;
        @InvocableVariable(required=true) public String NewAllocationPlanId;
        @InvocableVariable public String PreviousResponsePlanId;
        @InvocableVariable public Integer PlanVersion;
    }
    public class ExecuteReplanResult {
        @InvocableVariable public String ExecutionStatus;
        @InvocableVariable public String NewResponsePlanId;
        @InvocableVariable public String ShipmentIds;
        @InvocableVariable public String Message;
    }

    public static List<InitializeResult> initializeIncident(List<InitializeRequest> inputs) {
        List<InitializeResult> results = new List<InitializeResult>();
        for (InitializeRequest input : inputs) {
            InitializeResult output = new InitializeResult();
            try {
                Id incidentId = (Id) input.IncidentId;
                Emergency_Incident__c incident = [
                    SELECT Id, Severity__c, Population_Affected__c, Profile_Overview__c, Latitude__c, Longitude__c, Detected_Date__c
                    FROM Emergency_Incident__c
                    WHERE Id = :incidentId
                    LIMIT 1
                ];
                Map<String, Object> payload = String.isBlank(input.IncidentPayload)
                    ? new Map<String, Object>{
                        'profile_overview' => incident.Profile_Overview__c,
                        'latitude' => incident.Latitude__c,
                        'longitude' => incident.Longitude__c,
                        'detected_date' => incident.Detected_Date__c,
                        'severity' => incident.Severity__c
                    }
                    : (Map<String, Object>) JSON.deserializeUntyped(input.IncidentPayload);
                output.IncidentId = String.valueOf(incidentId);
                output.Latitude = decimalValue(payload.get('latitude'));
                output.Longitude = decimalValue(payload.get('longitude'));
                String profile = stringValue(payload.get('profile_overview'));
                PopulationEvidence evidence = extractPopulation(profile);
                output.AffectedPopulation = evidence.count;
                output.PopulationEvidence = evidence.text;
                output.Severity = normalizeSeverity(stringValue(payload.get('severity')), incident.Severity__c);
                Emergency_Incident__c updateIncident = new Emergency_Incident__c(Id = incidentId);
                if (!String.isBlank(profile)) updateIncident.Profile_Overview__c = profile;
                if (output.Latitude != null) updateIncident.Latitude__c = output.Latitude;
                if (output.Longitude != null) updateIncident.Longitude__c = output.Longitude;
                DateTime detectedDate = parseDateTime(stringValue(payload.get('detected_date')));
                if (detectedDate != null) updateIncident.Detected_Date__c = detectedDate;
                if (!String.isBlank(output.Severity)) updateIncident.Severity__c = output.Severity;
                updateIncident.Population_Affected__c = output.AffectedPopulation;
                update updateIncident;
                output.InitializationStatus = 'Success';
            } catch (Exception error) {
                output.InitializationStatus = error.getMessage();
            }
            results.add(output);
        }
        return results;
    }

    public static List<NeedsResult> assessNeeds(List<NeedsRequest> inputs) {
        List<NeedsResult> results = new List<NeedsResult>();
        for (NeedsRequest input : inputs) {
            NeedsResult output = new NeedsResult();
            try {
                Id incidentId = (Id) input.IncidentId;
                List<Object> rawNeeds = (List<Object>) JSON.deserializeUntyped(input.ResourceNeeds);
                List<Resource_Request__c> requests = new List<Resource_Request__c>();
                Map<String, Resource_Request__c> existingByType = new Map<String, Resource_Request__c>();
                for (Resource_Request__c existing : [SELECT Id, Resource_Type__c FROM Resource_Request__c WHERE Incident__c = :incidentId AND Status__c IN ('Open', 'Proposed')]) existingByType.put(existing.Resource_Type__c == null ? '' : existing.Resource_Type__c.toLowerCase(), existing);
                for (Object raw : rawNeeds) {
                    Map<String, Object> need = (Map<String, Object>) raw;
                    String resourceType = stringValue(need.get('ResourceType'));
                    Resource_Request__c request = existingByType.get(resourceType.toLowerCase());
                    if (request == null) request = new Resource_Request__c(Incident__c = incidentId, Resource_Type__c = resourceType);
                    request.Quantity__c = decimalValue(need.get('Quantity'));
                    request.Priority__c = stringValue(need.get('Priority'));
                    request.Required_By__c = parseDateTime(stringValue(need.get('RequiredBy')));
                    request.Status__c = 'Open';
                    requests.add(request);
                }
                List<Resource_Request__c> newRequests = new List<Resource_Request__c>();
                List<Resource_Request__c> updatedRequests = new List<Resource_Request__c>();
                for (Resource_Request__c request : requests) {
                    if (request.Id == null) newRequests.add(request); else updatedRequests.add(request);
                }
                if (!newRequests.isEmpty()) insert newRequests;
                if (!updatedRequests.isEmpty()) update updatedRequests;
                List<String> ids = new List<String>();
                for (Resource_Request__c request : requests) ids.add(String.valueOf(request.Id));
                output.ResourceRequestIds = String.join(ids, ',');
                output.CreatedRequests = JSON.serialize(requests);
                output.Status = 'Success';
            } catch (Exception error) {
                output.Status = error.getMessage();
            }
            results.add(output);
        }
        return results;
    }

    public static List<FindResult> findAvailableResources(List<FindRequest> inputs) {
        List<FindResult> results = new List<FindResult>();
        for (FindRequest input : inputs) {
            FindResult output = new FindResult();
            try {
                Id incidentId = (Id) input.IncidentId;
                Emergency_Incident__c incident = [SELECT Latitude__c, Longitude__c FROM Emergency_Incident__c WHERE Id = :incidentId LIMIT 1];
                Decimal latitude = input.Latitude == null ? incident.Latitude__c : input.Latitude;
                Decimal longitude = input.Longitude == null ? incident.Longitude__c : input.Longitude;
                Set<Id> requestedIds = parseIds(input.ResourceRequestIds);
                List<Resource_Request__c> openRequests = requestedIds.isEmpty()
                    ? [SELECT Id, Resource_Type__c, Quantity__c, Priority__c FROM Resource_Request__c WHERE Incident__c = :incidentId AND Status__c IN ('Open', 'Proposed')]
                    : [SELECT Id, Resource_Type__c, Quantity__c, Priority__c FROM Resource_Request__c WHERE Id IN :requestedIds AND Incident__c = :incidentId AND Status__c != 'Fulfilled'];
                Map<Id, Resource_Request__c> requestedNeeds = new Map<Id, Resource_Request__c>(openRequests);
                List<Relief_Resource__c> resources = [
                    SELECT Id, Name, Resource_Type__c, Available_To_Allocate__c, Quantity_Available__c, Expiration_Date__c,
                           Last_Inventory_Update__c, Warehouse__c, Warehouse__r.Name, Warehouse__r.Location__c,
                           Warehouse__r.Latitude__c, Warehouse__r.Longitude__c, Warehouse__r.Status__c
                    FROM Relief_Resource__c
                    WHERE Status__c = 'Available' AND Available_To_Allocate__c > 0 AND Warehouse__r.Status__c = 'Operational'
                    ORDER BY Available_To_Allocate__c DESC, Last_Inventory_Update__c DESC NULLS LAST
                ];
                sortResourcesByDistance(resources, latitude, longitude);
                List<Object> candidates = new List<Object>();
                List<Object> eligibility = new List<Object>();
                Decimal nearest = null;
                String nearestName;
                Integer totalAvailable = 0;
                for (Relief_Resource__c resource : resources) {
                    Decimal distance = distanceKm(latitude, longitude, resource.Warehouse__r.Latitude__c, resource.Warehouse__r.Longitude__c);
                    Integer available = integerValue(resource.Available_To_Allocate__c);
                    totalAvailable += available;
                    if (distance != null && (nearest == null || distance < nearest)) {
                        nearest = distance;
                        nearestName = resource.Warehouse__r.Name;
                    }
                    candidates.add(new Map<String, Object>{'resourceId' => resource.Id, 'resourceType' => resource.Resource_Type__c, 'availableQuantity' => available, 'warehouse' => resource.Warehouse__r.Name, 'distanceKm' => distance, 'fresh' => true, 'competingRequests' => 0});
                    eligibility.add(new Map<String, Object>{'resourceId' => resource.Id, 'eligible' => requestedNeeds.isEmpty() || matchesAnyNeed(resource.Resource_Type__c, requestedNeeds.values()), 'reason' => requestedNeeds.isEmpty() || matchesAnyNeed(resource.Resource_Type__c, requestedNeeds.values()) ? 'Available, operational warehouse, and inventory is fresh.' : 'No matching open request.'});
                }
                output.ResourceCandidates = JSON.serialize(candidates);
                List<String> candidateIds = new List<String>();
                for (Relief_Resource__c resource : resources) candidateIds.add(String.valueOf(resource.Id));
                output.CandidateResourceIds = String.join(candidateIds, ',');
                output.ResourceEligibility = JSON.serialize(eligibility);
                output.NearestWarehouse = nearestName;
                output.Distance = nearest;
                output.AvailableQuantity = totalAvailable;
            } catch (Exception error) {
                output.ResourceCandidates = '[]';
                output.ResourceEligibility = JSON.serialize(new Map<String, Object>{'error' => error.getMessage()});
            }
            results.add(output);
        }
        return results;
    }

    public static List<PlanResult> generateAllocationPlan(List<PlanRequest> inputs) {
        List<PlanResult> results = new List<PlanResult>();
        for (PlanRequest input : inputs) results.add(buildPlan(input.IncidentId, input.ResourceRequestIds, input.CandidateResourceIds, input.OptimizationConstraints, null));
        return results;
    }

    public static List<ApprovalResult> approveAllocationPlan(List<ApprovalRequest> inputs) {
        List<ApprovalResult> results = new List<ApprovalResult>();
        for (ApprovalRequest input : inputs) {
            ApprovalResult output = new ApprovalResult();
            try {
                Id planId = (Id) input.AllocationPlanId;
                String decision = String.valueOf(input.ApprovalDecision).toUpperCase();
                if (!new Set<String>{'APPROVE', 'MODIFY', 'REJECT'}.contains(decision)) throw new ActionException('ApprovalDecision must be APPROVE, MODIFY, or REJECT.');
                Allocation_Plan__c plan = [SELECT Id, Status__c FROM Allocation_Plan__c WHERE Id = :planId LIMIT 1 FOR UPDATE];
                plan.Status__c = decision == 'APPROVE' ? 'Approved' : decision == 'MODIFY' ? 'Modified' : 'Rejected';
                if (decision == 'MODIFY') plan.Modification_Instructions__c = input.ModificationInstructions;
                update plan;
                output.Status = plan.Status__c;
                output.UpdatedPlanId = String.valueOf(plan.Id);
                output.Message = 'Allocation plan updated to ' + plan.Status__c + '.';
            } catch (Exception error) {
                output.Status = 'Error';
                output.Message = error.getMessage();
            }
            results.add(output);
        }
        return results;
    }

    public static List<ExecuteResult> executeApprovedAllocation(List<ExecuteRequest> inputs) {
        List<ExecuteResult> results = new List<ExecuteResult>();
        for (ExecuteRequest input : inputs) results.add(executePlan(input.AllocationPlanId, input.IncidentId));
        return results;
    }

    public static List<StatusResult> getIncidentStatus(List<StatusRequest> inputs) {
        List<StatusResult> results = new List<StatusResult>();
        for (StatusRequest input : inputs) {
            StatusResult output = new StatusResult();
            try {
                Id incidentId = (Id) input.IncidentId;
                Emergency_Incident__c incident = [SELECT Id, Name, Status__c, Severity__c, Population_Affected__c FROM Emergency_Incident__c WHERE Id = :incidentId LIMIT 1];
                List<Resource_Request__c> requests = [SELECT Id, Resource_Type__c, Quantity__c, Status__c, Priority__c FROM Resource_Request__c WHERE Incident__c = :incidentId AND Status__c != 'Fulfilled'];
                List<Allocation__c> allocations = [SELECT Id, Resource_Request__c, Relief_Resource__c, Quantity__c, Status__c FROM Allocation__c WHERE Incident__c = :incidentId AND Status__c IN ('Proposed', 'Approved', 'Allocated', 'In Transit', 'Executing')];
                Id responsePlanId = input.ResponsePlanId == null ? null : (Id) input.ResponsePlanId;
                List<Shipment__c> shipments;
                if (responsePlanId == null) {
                    shipments = [SELECT Id, Status__c, ETA__c, Destination__c FROM Shipment__c WHERE Response_Plan__r.Incident__c = :incidentId];
                } else {
                    shipments = [SELECT Id, Status__c, ETA__c, Destination__c FROM Shipment__c WHERE Response_Plan__c = :responsePlanId];
                }
                Decimal requested = 0, fulfilled = 0;
                for (Resource_Request__c request : requests) requested += request.Quantity__c == null ? 0 : request.Quantity__c;
                for (Allocation__c allocation : allocations) fulfilled += allocation.Quantity__c == null ? 0 : allocation.Quantity__c;
                output.IncidentSummary = incident.Name + ' (' + incident.Severity__c + ') is ' + incident.Status__c + '.';
                output.OpenRequests = JSON.serialize(requests);
                output.ActiveAllocations = JSON.serialize(allocations);
                output.ShipmentStatus = JSON.serialize(shipments);
                output.CoveragePercentage = requested == 0 ? 0 : Math.min(100, fulfilled / requested * 100);
                output.UnmetNeeds = JSON.serialize(requests);
            } catch (Exception error) {
                output.IncidentSummary = error.getMessage();
            }
            results.add(output);
        }
        return results;
    }

    public static List<RiskResult> detectResponseRisks(List<RiskRequest> inputs) {
        List<RiskResult> results = new List<RiskResult>();
        for (RiskRequest input : inputs) {
            RiskResult output = new RiskResult();
            try {
                Id incidentId = (Id) input.IncidentId;
                List<Shipment__c> shipments = [SELECT Id, Name, Status__c, ETA__c, Destination__c FROM Shipment__c WHERE Response_Plan__r.Incident__c = :incidentId];
                List<Allocation__c> allocations = [SELECT Id, Relief_Resource__c, Quantity__c, Relief_Resource__r.Available_To_Allocate__c, Relief_Resource__r.Expiration_Date__c FROM Allocation__c WHERE Incident__c = :incidentId];
                List<Object> delayed = new List<Object>(), changes = new List<Object>(), gaps = new List<Object>();
                for (Shipment__c shipment : shipments) if (shipment.ETA__c != null && shipment.ETA__c < System.now() && shipment.Status__c != 'Delivered') delayed.add(new Map<String, Object>{'shipmentId' => shipment.Id, 'status' => shipment.Status__c, 'eta' => shipment.ETA__c});
                for (Allocation__c allocation : allocations) {
                    if (integerValue(allocation.Relief_Resource__r.Available_To_Allocate__c) < integerValue(allocation.Quantity__c)) changes.add(new Map<String, Object>{'resourceId' => allocation.Relief_Resource__c, 'available' => allocation.Relief_Resource__r.Available_To_Allocate__c, 'allocated' => allocation.Quantity__c});
                    if (allocation.Relief_Resource__r.Expiration_Date__c != null && allocation.Relief_Resource__r.Expiration_Date__c <= Date.today().addDays(30)) gaps.add(new Map<String, Object>{'resourceId' => allocation.Relief_Resource__c, 'reason' => 'Expires within 30 days'});
                }
                output.DelayedShipments = JSON.serialize(delayed);
                output.InventoryChanges = JSON.serialize(changes);
                output.RouteDisruptions = '[]';
                output.CriticalGaps = JSON.serialize(gaps);
                output.RiskScore = (!delayed.isEmpty() || !changes.isEmpty()) ? 'High' : !gaps.isEmpty() ? 'Medium' : 'Low';
                output.RiskSummary = output.RiskScore + ' risk: ' + delayed.size() + ' delayed shipments, ' + changes.size() + ' inventory changes, and ' + gaps.size() + ' critical gaps.';
            } catch (Exception error) { output.RiskSummary = error.getMessage(); output.RiskScore = 'High'; }
            results.add(output);
        }
        return results;
    }

    public static List<ReplanResult> generateReplan(List<ReplanRequest> inputs) {
        List<ReplanResult> results = new List<ReplanResult>();
        for (ReplanRequest input : inputs) {
            Id incidentId = (Id) input.IncidentId;
            if (!String.isBlank(input.ResponsePlanId)) {
                Id responsePlanId = (Id) input.ResponsePlanId;
                Response_Plan__c currentPlan = [SELECT Id, Incident__c FROM Response_Plan__c WHERE Id = :responsePlanId LIMIT 1];
                if (currentPlan.Incident__c != incidentId) {
                    results.add(replanError('The current response plan does not belong to the active incident.'));
                    continue;
                }
            }
            String constraints = String.join(new List<String>{ input.Constraints, input.ReplanTrigger, input.ModificationRequest }, ' ');
            PlanResult plan = buildPlan(input.IncidentId, null, null, constraints, input.PlanVersion);
            ReplanResult output = new ReplanResult();
            output.NewAllocationPlanId = plan.AllocationPlanId;
            output.AllocationRecords = plan.AllocationRecords;
            output.CoveragePercentage = plan.CoveragePercentage;
            output.EstimatedETA = plan.EstimatedETA;
            output.RiskScore = plan.RiskScore;
            output.UnmetNeeds = plan.UnmetNeeds;
            output.RecommendationReason = plan.RecommendationReason;
            results.add(output);
        }
        return results;
    }

    private static ReplanResult replanError(String message) {
        ReplanResult result = new ReplanResult();
        result.RecommendationReason = message;
        result.UnmetNeeds = JSON.serialize(new List<Object>{ new Map<String, Object>{ 'error' => message } });
        return result;
    }

    public static List<ExecuteReplanResult> executeReplan(List<ExecuteReplanRequest> inputs) {
        List<ExecuteReplanResult> results = new List<ExecuteReplanResult>();
        for (ExecuteReplanRequest input : inputs) {
            if (!String.isBlank(input.PreviousResponsePlanId)) {
                update new Response_Plan__c(Id = (Id) input.PreviousResponsePlanId, Approval_Status__c = 'Superseded');
            }
            ExecuteResult execution = executePlan(input.NewAllocationPlanId, input.IncidentId);
            ExecuteReplanResult output = new ExecuteReplanResult();
            output.ExecutionStatus = execution.ExecutionStatus;
            output.NewResponsePlanId = execution.ResponsePlanId;
            output.ShipmentIds = execution.ShipmentIds;
            output.Message = execution.Message;
            results.add(output);
        }
        return results;
    }

    private static PlanResult buildPlan(String incidentIdText, String requestIdsText, String candidateIdsText, String constraints, Integer versionOverride) {
        PlanResult output = new PlanResult();
        try {
            Id incidentId = (Id) incidentIdText;
            Emergency_Incident__c incident = [SELECT Id, Name, Severity__c, Location__c, Latitude__c, Longitude__c FROM Emergency_Incident__c WHERE Id = :incidentId LIMIT 1];
            List<Resource_Request__c> requests = [SELECT Id, Resource_Type__c, Quantity__c, Priority__c, Required_By__c FROM Resource_Request__c WHERE Incident__c = :incidentId AND Status__c != 'Fulfilled' ORDER BY Required_By__c NULLS LAST];
            List<Relief_Resource__c> resources = [SELECT Id, Name, Resource_Type__c, Available_To_Allocate__c, Expiration_Date__c, Last_Inventory_Update__c, Warehouse__r.Name, Warehouse__r.Location__c, Warehouse__r.Latitude__c, Warehouse__r.Longitude__c FROM Relief_Resource__c WHERE Status__c = 'Available' AND Available_To_Allocate__c > 0 AND Warehouse__r.Status__c = 'Operational' ORDER BY Expiration_Date__c ASC NULLS LAST, Available_To_Allocate__c DESC];
            Set<Id> requestFilter = parseIds(requestIdsText);
            Set<Id> candidateFilter = parseIds(candidateIdsText);
            if (!requestFilter.isEmpty()) {
                List<Resource_Request__c> filteredRequests = new List<Resource_Request__c>();
                for (Resource_Request__c request : requests) if (requestFilter.contains(request.Id)) filteredRequests.add(request);
                requests = filteredRequests;
            }
            if (!candidateFilter.isEmpty()) {
                List<Relief_Resource__c> filteredResources = new List<Relief_Resource__c>();
                for (Relief_Resource__c resource : resources) if (candidateFilter.contains(resource.Id)) filteredResources.add(resource);
                resources = filteredResources;
            }
            sortResourcesByDistance(resources, incident.Latitude__c, incident.Longitude__c);
            Decimal requested = 0, allocated = 0;
            Decimal estimatedEtaHours = 0;
            Map<Id, Decimal> remaining = new Map<Id, Decimal>();
            Map<Id, Decimal> allocatedByRequest = new Map<Id, Decimal>();
            List<Allocation__c> allocationRecords = new List<Allocation__c>();
            for (Relief_Resource__c resource : resources) remaining.put(resource.Id, resource.Available_To_Allocate__c == null ? 0 : resource.Available_To_Allocate__c);
            for (Resource_Request__c request : requests) {
                Decimal need = request.Quantity__c == null ? 0 : request.Quantity__c;
                requested += need;
                for (Relief_Resource__c resource : resources) {
                    if (need <= 0 || !matches(request.Resource_Type__c, resource.Resource_Type__c)) continue;
                    Decimal available = remaining.get(resource.Id);
                    if (available <= 0) continue;
                    Decimal quantity = Math.min(need, available);
                    need -= quantity; allocated += quantity; remaining.put(resource.Id, available - quantity);
                    allocatedByRequest.put(request.Id, (allocatedByRequest.containsKey(request.Id) ? allocatedByRequest.get(request.Id) : 0) + quantity);
                    Decimal resourceEtaHours = etaHoursForDistance(distanceKm(incident.Latitude__c, incident.Longitude__c, resource.Warehouse__r.Latitude__c, resource.Warehouse__r.Longitude__c));
                    estimatedEtaHours = Math.max(estimatedEtaHours, resourceEtaHours);
                    allocationRecords.add(new Allocation__c(Incident__c = incidentId, Resource_Request__c = request.Id, Relief_Resource__c = resource.Id, Quantity__c = quantity, Priority__c = request.Priority__c, Status__c = 'Proposed', AI_Recommendation__c = 'Proposed allocation from ' + resource.Name));
                }
            }
            Decimal coverage = requested == 0 ? 0 : Math.min(100, allocated / requested * 100);
            String risk = coverage >= 90 ? 'Low' : coverage >= 70 ? 'Medium' : 'High';
            Integer version = versionOverride == null ? nextAllocationVersion(incidentId) : versionOverride;
            estimatedEtaHours = estimatedEtaHours == 0 ? defaultEtaHours(incident.Severity__c) : estimatedEtaHours;
            String estimatedEta = formatEta(estimatedEtaHours);
            Allocation_Plan__c plan = new Allocation_Plan__c(Incident__c = incidentId, Status__c = 'Pending Approval', Version__c = version, Coverage_Percentage__c = coverage, Estimated_ETA__c = estimatedEta, Risk_Score__c = risk, Recommendation_Reason__c = 'Scored severity, nearest warehouse distance, availability, expiry, and coverage. Estimated delivery ETA is ' + estimatedEta + ' using an emergency transport speed of ' + EMERGENCY_TRANSPORT_SPEED_KM_PER_HOUR + ' km/h plus a ' + HANDLING_BUFFER_HOURS + '-hour handling buffer. Constraints: ' + constraints);
            insert plan;
            for (Allocation__c allocation : allocationRecords) allocation.Allocation_Plan__c = plan.Id;
            if (!allocationRecords.isEmpty()) insert allocationRecords;
            List<Object> summaries = new List<Object>();
            for (Allocation__c allocation : allocationRecords) summaries.add(new Map<String, Object>{'requestId' => allocation.Resource_Request__c, 'resourceId' => allocation.Relief_Resource__c, 'quantity' => allocation.Quantity__c});
            List<Object> unmetNeeds = new List<Object>();
            for (Resource_Request__c request : requests) {
                Decimal requestedQuantity = request.Quantity__c == null ? 0 : request.Quantity__c;
                Decimal allocatedQuantity = allocatedByRequest.containsKey(request.Id) ? allocatedByRequest.get(request.Id) : 0;
                if (allocatedQuantity < requestedQuantity) {
                    unmetNeeds.add(new Map<String, Object>{
                        'requestId' => request.Id,
                        'resourceType' => request.Resource_Type__c,
                        'requestedQuantity' => requestedQuantity,
                        'allocatedQuantity' => allocatedQuantity,
                        'shortfall' => requestedQuantity - allocatedQuantity,
                        'reason' => resources.isEmpty() ? 'No resource passed availability, freshness, or operational-warehouse filters.' : 'No eligible resource type or sufficient allocatable quantity matched this request.'
                    });
                }
            }
            output.AllocationPlanId = String.valueOf(plan.Id); output.AllocationRecords = JSON.serialize(summaries); output.TotalResources = integerValue(allocated); output.CoveragePercentage = coverage; output.EstimatedETA = plan.Estimated_ETA__c; output.RiskScore = risk; output.UnmetNeeds = JSON.serialize(unmetNeeds); output.RecommendationReason = plan.Recommendation_Reason__c + ' Unmet needs: ' + JSON.serialize(unmetNeeds);
        } catch (Exception error) { output.RecommendationReason = error.getMessage(); }
        return output;
    }

    private static ExecuteResult executePlan(String planText, String incidentText) {
        ExecuteResult output = new ExecuteResult();
        Savepoint checkpoint = Database.setSavepoint();
        try {
            Id planId = (Id) planText;
            Allocation_Plan__c plan = [SELECT Id, Name, Incident__c, Status__c, Estimated_ETA__c, Risk_Score__c, Version__c FROM Allocation_Plan__c WHERE Id = :planId LIMIT 1 FOR UPDATE];
            if (plan.Status__c != 'Approved') throw new ActionException('Plan must be Approved before execution.');
            List<Allocation__c> allocations = [SELECT Id, Resource_Request__c, Relief_Resource__c, Quantity__c, Relief_Resource__r.Name, Relief_Resource__r.Available_To_Allocate__c, Relief_Resource__r.Warehouse__r.Location__c, Relief_Resource__r.Warehouse__r.Latitude__c, Relief_Resource__r.Warehouse__r.Longitude__c FROM Allocation__c WHERE Allocation_Plan__c = :planId FOR UPDATE];
            Set<Id> resourceIds = new Set<Id>();
            for (Allocation__c allocation : allocations) resourceIds.add(allocation.Relief_Resource__c);
            Map<Id, Relief_Resource__c> resources = new Map<Id, Relief_Resource__c>([SELECT Id, Name, Quantity_Available__c, Available_To_Allocate__c, Reserved_Quantity__c FROM Relief_Resource__c WHERE Id IN :resourceIds FOR UPDATE]);
            List<Object> conflicts = new List<Object>();
            for (Allocation__c allocation : allocations) {
                Relief_Resource__c resource = resources.get(allocation.Relief_Resource__c);
                if (resource == null) {
                    conflicts.add(new Map<String, Object>{'resourceId' => allocation.Relief_Resource__c, 'reason' => 'Resource record is unavailable.'});
                } else if (integerValue(resource.Available_To_Allocate__c) < integerValue(allocation.Quantity__c)) {
                    conflicts.add(new Map<String, Object>{'resourceId' => allocation.Relief_Resource__c, 'available' => resource.Available_To_Allocate__c, 'required' => allocation.Quantity__c});
                }
            }
            if (!conflicts.isEmpty()) { output.ExecutionStatus = 'Conflict'; output.InventoryConflicts = JSON.serialize(conflicts); output.Message = 'Inventory changed; no records were reserved.'; Database.rollback(checkpoint); return output; }
            Emergency_Incident__c incident = [SELECT Id, Location__c, Latitude__c, Longitude__c FROM Emergency_Incident__c WHERE Id = :plan.Incident__c LIMIT 1];
            Response_Plan__c response = new Response_Plan__c(Incident__c = plan.Incident__c, Plan_Version__c = plan.Version__c, Total_Resources__c = 0, Estimated_Coverage__c = 0, Estimated_ETA_Hours__c = 6, Risk_Score__c = plan.Risk_Score__c == 'High' ? 76 : plan.Risk_Score__c == 'Medium' ? 42 : 18, Confidence__c = 90, Approval_Status__c = 'Approved', AI_Recommendation__c = 'Executed approved allocation plan ' + plan.Name);
            insert response;
            Decimal total = 0; List<Shipment__c> shipments = new List<Shipment__c>(); List<String> reserved = new List<String>();
            for (Allocation__c allocation : allocations) {
                Relief_Resource__c resource = resources.get(allocation.Relief_Resource__c); Decimal quantity = allocation.Quantity__c == null ? 0 : allocation.Quantity__c; total += quantity;
                if (resource == null) throw new ActionException('Resource ' + allocation.Relief_Resource__c + ' is unavailable.');
                resource.Reserved_Quantity__c = (resource.Reserved_Quantity__c == null ? 0 : resource.Reserved_Quantity__c) + quantity;
                allocation.Response_Plan__c = response.Id; allocation.Status__c = 'Approved'; reserved.add(JSON.serialize(new Map<String, Object>{'resourceId' => resource.Id, 'quantity' => quantity}));
                Decimal shipmentEtaHours = etaHoursForDistance(distanceKm(incident.Latitude__c, incident.Longitude__c, allocation.Relief_Resource__r.Warehouse__r.Latitude__c, allocation.Relief_Resource__r.Warehouse__r.Longitude__c));
                shipments.add(new Shipment__c(
                    Allocation__c = allocation.Id,
                    Incident__c = plan.Incident__c,
                    Response_Plan__c = response.Id,
                    Origin__c = allocation.Relief_Resource__r.Warehouse__r.Location__c,
                    Destination__c = incident.Location__c,
                    Origin_Latitude__c = allocation.Relief_Resource__r.Warehouse__r.Latitude__c,
                    Origin_Longitude__c = allocation.Relief_Resource__r.Warehouse__r.Longitude__c,
                    Destination_Latitude__c = incident.Latitude__c,
                    Destination_Longitude__c = incident.Longitude__c,
                    Carrier__c = 'Emergency Logistics Network',
                    ETA__c = System.now().addMinutes(Integer.valueOf((shipmentEtaHours * 60).setScale(0))),
                    Status__c = 'Planned'
                ));
            }
            if (!allocations.isEmpty()) update allocations;
            update resources.values();
            if (!shipments.isEmpty()) insert shipments;
            response.Total_Resources__c = total; update response;
            plan.Status__c = 'Executed'; update plan;
            output.ExecutionStatus = 'Success'; output.ResponsePlanId = String.valueOf(response.Id); output.ShipmentIds = joinIds(shipments); output.ReservedResources = '[' + String.join(reserved, ',') + ']'; output.InventoryConflicts = '[]'; output.Message = 'Approved allocation executed successfully.';
        } catch (Exception error) { Database.rollback(checkpoint); output.ExecutionStatus = 'Conflict'; output.InventoryConflicts = JSON.serialize(new Map<String, Object>{'error' => error.getMessage()}); output.Message = error.getMessage(); }
        return output;
    }

    private class PopulationEvidence { Integer count; String text; PopulationEvidence(Integer count, String text) { this.count = count; this.text = text; } }
    private class ActionException extends Exception {}
    private static PopulationEvidence extractPopulation(String text) {
        if (String.isBlank(text)) {
            return new PopulationEvidence(0, '');
        }

        Integer caseCount = 0;
        List<String> caseEvidence = new List<String>();
        Matcher caseMatcher = Pattern.compile('(?i)(\\d[\\d,]*)\\s+(confirmed|suspected)\\s+cases').matcher(text);
        while (caseMatcher.find()) {
            Integer value = parsePopulationCount(caseMatcher.group(1));
            if (value > 0) {
                caseCount += value;
                caseEvidence.add(caseMatcher.group(0));
            }
        }
        if (caseCount > 0) {
            return new PopulationEvidence(caseCount, String.join(caseEvidence, ' + '));
        }

        Integer largestPeopleCount = 0;
        String peopleEvidence = '';
        Matcher peopleMatcher = Pattern.compile('(?i)(\\d[\\d,]*)\\s+(people|persons|individuals|residents)').matcher(text);
        while (peopleMatcher.find()) {
            Integer value = parsePopulationCount(peopleMatcher.group(1));
            if (value > largestPeopleCount) {
                largestPeopleCount = value;
                peopleEvidence = peopleMatcher.group(0);
            }
        }
        if (largestPeopleCount > 0) {
            return new PopulationEvidence(largestPeopleCount, peopleEvidence);
        }

        Integer largestHouseholdCount = 0;
        String householdEvidence = '';
        Matcher householdMatcher = Pattern.compile('(?i)(\\d[\\d,]*)\\s+households').matcher(text);
        while (householdMatcher.find()) {
            Integer value = parsePopulationCount(householdMatcher.group(1));
            if (value > largestHouseholdCount) {
                largestHouseholdCount = value;
                householdEvidence = householdMatcher.group(0);
            }
        }
        return new PopulationEvidence(largestHouseholdCount, householdEvidence);
    }

    private static Integer parsePopulationCount(String value) {
        Integer populationValue = Integer.valueOf(value.replace(',', ''));
        return populationValue >= 1900 && populationValue <= 2100 ? 0 : populationValue;
    }
    private static String normalizeSeverity(String supplied, String fallback) { String value = String.isBlank(supplied) ? fallback : supplied; if (value == null) return 'Medium'; value = value.toLowerCase(); return value.contains('critical') || value.contains('high') ? 'High' : value.contains('low') ? 'Low' : 'Medium'; }
    private static Decimal decimalValue(Object value) { return value == null ? null : Decimal.valueOf(String.valueOf(value)); }
    private static Integer integerValue(Decimal value) { return value == null ? 0 : value.intValue(); }
    private static String stringValue(Object value) { return value == null ? '' : String.valueOf(value); }
    private static DateTime parseDateTime(String value) { if (String.isBlank(value)) return null; try { return (DateTime) JSON.deserialize('"' + value + '"', DateTime.class); } catch (Exception error) { return null; } }
    private static Boolean matches(String first, String second) { return !String.isBlank(first) && !String.isBlank(second) && (second.toLowerCase().contains(first.toLowerCase()) || first.toLowerCase().contains(second.toLowerCase())); }
    private static Boolean matchesAnyNeed(String resourceType, List<Resource_Request__c> needs) { for (Resource_Request__c need : needs) if (matches(need.Resource_Type__c, resourceType)) return true; return false; }
    private static Set<Id> parseIds(String text) { Set<Id> ids = new Set<Id>(); if (String.isBlank(text)) return ids; for (String value : text.split(',')) { try { ids.add((Id) value.trim()); } catch (Exception error) { } } return ids; }
    private static Decimal distanceKm(Decimal firstLatitude, Decimal firstLongitude, Decimal secondLatitude, Decimal secondLongitude) { if (firstLatitude == null || firstLongitude == null || secondLatitude == null || secondLongitude == null) return null; Double pi = 3.141592653589793; Double lat1 = (Double) firstLatitude * pi / 180; Double lat2 = (Double) secondLatitude * pi / 180; Double dLat = ((Double) secondLatitude - (Double) firstLatitude) * pi / 180; Double dLon = ((Double) secondLongitude - (Double) firstLongitude) * pi / 180; Double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return Decimal.valueOf(String.valueOf(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))); }
    private static Decimal etaHoursForDistance(Decimal distance) { return distance == null ? 8 : Math.max(1, (distance / EMERGENCY_TRANSPORT_SPEED_KM_PER_HOUR) + HANDLING_BUFFER_HOURS); }
    private static Decimal defaultEtaHours(String severity) { return severity == 'Critical' ? 4.5 : severity == 'High' ? 6 : 8; }
    private static String formatEta(Decimal hours) { Decimal roundedHours = hours.setScale(1); return String.valueOf(roundedHours) + ' hours'; }
    private static void sortResourcesByDistance(List<Relief_Resource__c> resources, Decimal latitude, Decimal longitude) {
        for (Integer outerIndex = 0; outerIndex < resources.size(); outerIndex++) {
            Integer nearestIndex = outerIndex;
            Decimal nearestDistance = distanceKm(latitude, longitude, resources[outerIndex].Warehouse__r.Latitude__c, resources[outerIndex].Warehouse__r.Longitude__c);
            for (Integer innerIndex = outerIndex + 1; innerIndex < resources.size(); innerIndex++) {
                Decimal candidateDistance = distanceKm(latitude, longitude, resources[innerIndex].Warehouse__r.Latitude__c, resources[innerIndex].Warehouse__r.Longitude__c);
                if (nearestDistance == null || (candidateDistance != null && candidateDistance < nearestDistance)) {
                    nearestIndex = innerIndex;
                    nearestDistance = candidateDistance;
                }
            }
            if (nearestIndex != outerIndex) {
                Relief_Resource__c current = resources[outerIndex];
                resources[outerIndex] = resources[nearestIndex];
                resources[nearestIndex] = current;
            }
        }
    }
    private static Integer nextAllocationVersion(Id incidentId) { return [SELECT COUNT() FROM Allocation_Plan__c WHERE Incident__c = :incidentId] + 1; }
    private static String joinIds(List<SObject> records) { List<String> ids = new List<String>(); for (SObject record : records) ids.add(String.valueOf(record.get('Id'))); return String.join(ids, ','); }
}
