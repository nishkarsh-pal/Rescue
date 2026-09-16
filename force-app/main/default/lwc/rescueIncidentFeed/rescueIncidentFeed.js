import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { publish, subscribe, unsubscribe, MessageContext } from 'lightning/messageService';
import RESCUE_INCIDENT_CHANNEL from '@salesforce/messageChannel/RescueIncidentChannel__c';
import getIncidents from '@salesforce/apex/RescueIncidentFeedController.getIncidents';
import importSampleFeed from '@salesforce/apex/RescueIncidentFeedController.importSampleFeed';
import processIncident from '@salesforce/apex/RescueIncidentFeedController.processIncident';
import approvePlan from '@salesforce/apex/RescueIncidentFeedController.approvePlan';
import sendCommand from '@salesforce/apex/RescueAgentConsoleController.sendCommand';

const SOURCE = 'rescueIncidentFeed';

const STAGES = [
    'Detected',
    'Understanding',
    'Prioritized',
    'Simulating',
    'Recommended',
    'Pending Approval',
    'Allocating',
    'Executing',
    'Monitoring',
    'Replanning'
];

export default class RescueIncidentFeed extends LightningElement {
    wiredResult;
    summaries = [];
    selectedIncidentId;
    isLoading = false;
    errorMessage;
    askText = '';
    chatMessages = [];

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

    @wire(getIncidents)
    wiredIncidents(result) {
        this.wiredResult = result;
        if (result.data) {
            this.summaries = result.data;
            if (!this.selectedIncidentId && result.data.length) {
                this.selectedIncidentId = result.data[0].incident.Id;
            }
        }
    }

    get hasIncidents() {
        return this.summaries && this.summaries.length > 0;
    }

    get incidentRows() {
        return this.summaries.map((summary) => {
            const incident = summary.incident;
            return {
                id: incident.Id,
                name: incident.Name,
                severity: incident.Severity__c,
                status: incident.Status__c,
                location: incident.Location__c,
                disasterType: incident.Disaster_Type__c,
                source: incident.Source__c,
                rowClass: incident.Id === this.selectedIncidentId ? 'incident-row selected' : 'incident-row',
                severityClass: 'severity-badge severity-' + (incident.Severity__c ? incident.Severity__c.toLowerCase() : 'medium')
            };
        });
    }

    get selectedSummary() {
        return this.summaries.find((summary) => summary.incident.Id === this.selectedIncidentId);
    }

    get selectedIncident() {
        return this.selectedSummary ? this.selectedSummary.incident : null;
    }

    get selectedPlan() {
        return this.selectedSummary ? this.selectedSummary.latestPlan : null;
    }

    get hasSelection() {
        return !!this.selectedIncident;
    }

    get mapMarkers() {
        const incident = this.selectedIncident;
        if (!incident || incident.Latitude__c == null || incident.Longitude__c == null) {
            return [];
        }
        return [
            {
                value: incident.Id,
                location: { Latitude: incident.Latitude__c, Longitude: incident.Longitude__c },
                title: incident.Name,
                description: (incident.Location__c || incident.Country__c || '') + ' — ' + (incident.Severity__c || '')
            }
        ];
    }

    get hasMapMarkers() {
        return this.mapMarkers.length > 0;
    }

    get stageSteps() {
        const currentStatus = this.selectedIncident ? this.selectedIncident.Status__c : null;
        const currentIndex = STAGES.indexOf(currentStatus);
        return STAGES.map((stage, index) => ({
            key: stage,
            label: stage,
            stepClass: index <= currentIndex ? 'stage-pill stage-complete' : 'stage-pill'
        }));
    }

    get canProcessWithAi() {
        return this.selectedIncident && this.selectedIncident.Status__c === 'Detected';
    }

    get canApprove() {
        return this.selectedPlan && this.selectedPlan.Approval_Status__c === 'Pending Approval';
    }

    get planRiskLabel() {
        return this.selectedPlan ? this.selectedPlan.Risk_Score__c + '% risk' : '';
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
        if (!question || !this.selectedIncidentId) {
            return;
        }
        this.chatMessages = [...this.chatMessages, { id: Date.now() + '-user', from: 'user', text: question }];
        this.askText = '';
        try {
            const result = await sendCommand({ incidentId: this.selectedIncidentId, message: question });
            this.chatMessages = [...this.chatMessages, { id: Date.now() + '-agent', from: 'agent', text: result.reply }];
            if (result.actionTaken === 'Allocated and executed' || result.actionTaken === 'Recommended') {
                await refreshApex(this.wiredResult);
            }
        } catch (error) {
            this.chatMessages = [...this.chatMessages, { id: Date.now() + '-error', from: 'agent', text: this.extractError(error) }];
        }
    }

    async handleImportSampleFeed() {
        this.isLoading = true;
        this.errorMessage = undefined;
        try {
            const result = await importSampleFeed();
            // eslint-disable-next-line no-console
            console.log('ReliefWeb import result', JSON.stringify(result));
            await refreshApex(this.wiredResult);
        } catch (error) {
            this.errorMessage = this.extractError(error);
        } finally {
            this.isLoading = false;
        }
    }

    async handleProcessWithAi() {
        if (!this.selectedIncidentId) {
            return;
        }
        this.isLoading = true;
        this.errorMessage = undefined;
        try {
            await processIncident({ incidentId: this.selectedIncidentId });
            await refreshApex(this.wiredResult);
        } catch (error) {
            this.errorMessage = this.extractError(error);
        } finally {
            this.isLoading = false;
        }
    }

    async handleApprove() {
        if (!this.selectedPlan) {
            return;
        }
        this.isLoading = true;
        this.errorMessage = undefined;
        try {
            await approvePlan({ responsePlanId: this.selectedPlan.Id });
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
