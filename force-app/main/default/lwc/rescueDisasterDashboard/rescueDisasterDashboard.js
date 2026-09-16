import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { publish, subscribe, unsubscribe, MessageContext } from 'lightning/messageService';
import RESCUE_INCIDENT_CHANNEL from '@salesforce/messageChannel/RescueIncidentChannel__c';
import getDashboardData from '@salesforce/apex/RescueCommandCenterController.getDashboardData';
import approvePlan from '@salesforce/apex/RescueCommandCenterController.approvePlan';
import generatePlan from '@salesforce/apex/RescueCommandCenterController.generatePlan';
import sendCommand from '@salesforce/apex/RescueAgentConsoleController.sendCommand';

const SOURCE = 'rescueDisasterDashboard';
const STAGE_ORDER = ['Detected', 'Understanding', 'Prioritized', 'Simulating', 'Recommended', 'Pending Approval', 'Allocating', 'Executing', 'Monitoring', 'Replanning'];

const NEXT_STEPS = [
    { key: 'recommend', label: 'Review resource & allocation recommendation', stage: 'Recommended' },
    { key: 'logistics', label: 'Confirm logistics feasibility and ETA', stage: 'Pending Approval' },
    { key: 'approve', label: 'Human approve the response plan', stage: 'Allocating' },
    { key: 'dispatch', label: 'Allocate resources and dispatch shipments', stage: 'Executing' }
];

export default class RescueDisasterDashboard extends LightningElement {
    wiredResult;
    data = { incidents: [], requests: [], resources: [], plans: [], allocations: [], shipments: [], decisions: [], evaluations: [] };
    isLoading = false;
    errorMessage;
    askText = '';
    chatMessages = [];
    selectedIncidentId;

    subscription;
    @wire(MessageContext) messageContext;

    connectedCallback() {
        this.subscription = subscribe(this.messageContext, RESCUE_INCIDENT_CHANNEL, (message) => this.handleIncidentMessage(message));
    }

    disconnectedCallback() {
        unsubscribe(this.subscription);
        this.subscription = null;
    }

    handleIncidentMessage(message) {
        if (message.source !== SOURCE && message.incidentId !== this.selectedIncidentId) {
            this.selectedIncidentId = message.incidentId;
            this.chatMessages = [];
        }
    }

    @wire(getDashboardData)
    wiredDashboard(result) {
        this.wiredResult = result;
        if (result.data) {
            this.data = result.data;
            if (!this.selectedIncidentId && result.data.incidents && result.data.incidents.length) {
                this.selectedIncidentId = this.defaultIncidentId(result.data.incidents);
            }
        }
    }

    defaultIncidentId(incidents) {
        const critical = incidents.find((incident) => incident.Severity__c === 'Critical');
        return (critical || incidents[0]).Id;
    }

    get incidents() {
        return this.data.incidents || [];
    }

    get hasIncidents() {
        return this.incidents.length > 0;
    }

    get metrics() {
        const incidents = this.incidents;
        const allocations = this.data.allocations || [];
        const plans = this.data.plans || [];
        const resources = this.data.resources || [];

        const activeIncidents = incidents.filter((incident) => incident.Status__c !== 'Resolved').length;
        const resourcesDeployed = allocations.filter((allocation) => allocation.Status__c === 'Allocated' || allocation.Status__c === 'In Transit').length;

        const etaValues = plans.map((plan) => plan.Estimated_ETA_Hours__c).filter((value) => value != null);
        const avgEtaMinutes = etaValues.length
            ? Math.round((etaValues.reduce((sum, value) => sum + value, 0) / etaValues.length) * 60)
            : 0;

        const locationSet = new Set();
        incidents.forEach((incident) => incident.Location__c && locationSet.add(incident.Location__c));
        resources.forEach((resource) => resource.Warehouse__r && resource.Warehouse__r.Location__c && locationSet.add(resource.Warehouse__r.Location__c));

        return {
            activeIncidents,
            resourcesDeployed,
            avgEtaMinutes,
            locationsMonitored: locationSet.size
        };
    }

    get recentIncidents() {
        return this.incidents.map((incident) => ({
            id: incident.Id,
            name: incident.Name,
            location: incident.Location__c,
            severity: incident.Severity__c,
            severityClass: 'severity-badge severity-' + (incident.Severity__c ? incident.Severity__c.toLowerCase() : 'medium'),
            timeLabel: this.formatTime(incident.Detected_Date__c || incident.Start_Date__c),
            rowClass: incident.Id === this.selectedIncidentId ? 'incident-item selected' : 'incident-item'
        }));
    }

    get mapMarkers() {
        return this.incidents
            .filter((incident) => incident.Latitude__c != null && incident.Longitude__c != null)
            .map((incident) => ({
                value: incident.Id,
                location: { Latitude: incident.Latitude__c, Longitude: incident.Longitude__c },
                title: incident.Name,
                description: (incident.Location__c || incident.Country__c || '') + ' — ' + (incident.Severity__c || '')
            }));
    }

    get hasMapMarkers() {
        return this.mapMarkers.length > 0;
    }

    get topIncident() {
        return this.incidents.find((incident) => incident.Id === this.selectedIncidentId);
    }

    get hasTopIncident() {
        return !!this.topIncident;
    }

    get topPlan() {
        const incident = this.topIncident;
        if (!incident) {
            return null;
        }
        return (this.data.plans || []).find((plan) => plan.Incident__c === incident.Id);
    }

    get topIncidentSubtitle() {
        const incident = this.topIncident;
        return incident ? [incident.Disaster_Type__c, incident.Location__c].filter(Boolean).join(' — ') : '';
    }

    get nextSteps() {
        const incident = this.topIncident;
        const currentStatus = incident ? incident.Status__c : null;
        const currentIndex = STAGE_ORDER.indexOf(currentStatus);
        return NEXT_STEPS.map((step, index) => ({
            key: step.key,
            label: step.label,
            numberClass: index <= currentIndex ? 'step-number step-complete' : 'step-number',
            number: index + 1
        }));
    }

    get canApproveTopPlan() {
        return this.topPlan && this.topPlan.Approval_Status__c === 'Pending Approval';
    }

    get approveDisabled() {
        return !this.canApproveTopPlan;
    }

    get nearestResourceCenter() {
        const resources = this.data.resources || [];
        if (!resources.length) {
            return null;
        }
        const warehouseId = resources[0].Warehouse__c;
        const warehouseName = resources[0].Warehouse__r ? resources[0].Warehouse__r.Name : 'Resource Center';
        const warehouseLocation = resources[0].Warehouse__r ? resources[0].Warehouse__r.Location__c : '';
        const forWarehouse = resources.filter((resource) => resource.Warehouse__c === warehouseId);

        return {
            name: warehouseName,
            location: warehouseLocation,
            breakdown: forWarehouse.map((resource) => ({
                id: resource.Id,
                type: resource.Resource_Type__c,
                quantity: resource.Quantity_Available__c
            }))
        };
    }

    get hasNearestResourceCenter() {
        return !!this.nearestResourceCenter;
    }

    get allocationBreakdown() {
        const incident = this.topIncident;
        if (!incident) {
            return [];
        }
        const requests = (this.data.requests || []).filter((request) => request.Incident__c === incident.Id);
        const allocations = this.data.allocations || [];
        return requests.map((request) => {
            const allocatedQty = allocations
                .filter((allocation) => allocation.Resource_Request__c === request.Id)
                .reduce((sum, allocation) => sum + (allocation.Quantity__c || 0), 0);
            return {
                id: request.Id,
                type: request.Resource_Type__c,
                allocatedQty,
                requestedQty: request.Quantity__c || 0
            };
        });
    }

    get hasAllocationBreakdown() {
        return this.allocationBreakdown.length > 0;
    }

    formatTime(value) {
        if (!value) {
            return '';
        }
        return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    handleSelectIncident(event) {
        const incidentId = event.currentTarget.dataset.id;
        if (incidentId === this.selectedIncidentId) {
            return;
        }
        this.selectedIncidentId = incidentId;
        this.chatMessages = [];
        publish(this.messageContext, RESCUE_INCIDENT_CHANNEL, { incidentId, source: SOURCE });
    }

    handleAskChange(event) {
        this.askText = event.target.value;
    }

    async handleAsk() {
        const question = (this.askText || '').trim();
        const incident = this.topIncident;
        if (!question || !incident) {
            return;
        }
        this.chatMessages = [...this.chatMessages, { id: Date.now() + '-user', from: 'user', text: question }];
        this.askText = '';

        try {
            const result = await sendCommand({ incidentId: incident.Id, message: question });
            this.chatMessages = [...this.chatMessages, { id: Date.now() + '-agent', from: 'agent', text: result.reply }];
            if (result.actionTaken === 'Allocated and executed' || result.actionTaken === 'Recommended') {
                await refreshApex(this.wiredResult);
            }
        } catch (error) {
            this.chatMessages = [...this.chatMessages, { id: Date.now() + '-error', from: 'agent', text: this.extractError(error) }];
        }
    }

    async handleApprove() {
        if (!this.topPlan) {
            return;
        }
        this.isLoading = true;
        this.errorMessage = undefined;
        try {
            await approvePlan({ responsePlanId: this.topPlan.Id });
            await refreshApex(this.wiredResult);
        } catch (error) {
            this.errorMessage = this.extractError(error);
        } finally {
            this.isLoading = false;
        }
    }

    async handleModifyPlan() {
        if (!this.topIncident) {
            return;
        }
        this.isLoading = true;
        this.errorMessage = undefined;
        try {
            await generatePlan({ incidentId: this.topIncident.Id });
            await refreshApex(this.wiredResult);
        } catch (error) {
            this.errorMessage = this.extractError(error);
        } finally {
            this.isLoading = false;
        }
    }

    extractError(error) {
        return (error && error.body && error.body.message) || error.message || 'Something went wrong.';
    }
}
