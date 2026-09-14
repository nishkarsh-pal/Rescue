import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getDashboardData from '@salesforce/apex/RescueCommandCenterController.getDashboardData';
import createIncidentFromInstruction from '@salesforce/apex/RescueCommandCenterController.createIncidentFromInstruction';
import approvePlan from '@salesforce/apex/RescueCommandCenterController.approvePlan';
import runWhatIf from '@salesforce/apex/RescueCommandCenterController.runWhatIf';
import seedDemoData from '@salesforce/apex/RescueCommandCenterController.seedDemoData';

export default class RescueCommandCenter extends LightningElement {
    instruction = 'A major flood has occurred in District A. 15000 people are affected. We need drinking water, food and medical supplies within 6 hours.';
    whatIfScenario = 'District B also reports a critical water shortage and Road X is blocked.';
    whatIfResult;
    isBusy = false;
    wiredDashboard;
    dashboard = {
        incidents: [],
        requests: [],
        resources: [],
        plans: [],
        shipments: [],
        decisions: [],
        evaluations: []
    };

    @wire(getDashboardData)
    wiredData(result) {
        this.wiredDashboard = result;
        if (result.data) {
            this.dashboard = result.data;
        } else if (result.error) {
            this.showToast('Unable to load RESCUE data', this.normalizeError(result.error), 'error');
        }
    }

    get incidents() {
        return this.dashboard.incidents || [];
    }

    get requests() {
        return this.dashboard.requests || [];
    }

    get resources() {
        return this.dashboard.resources || [];
    }

    get plans() {
        return this.dashboard.plans || [];
    }

    get shipments() {
        return this.dashboard.shipments || [];
    }

    get decisions() {
        return this.dashboard.decisions || [];
    }

    get evaluations() {
        return this.dashboard.evaluations || [];
    }

    get currentPlan() {
        return this.plans.length > 0 ? this.plans[0] : null;
    }

    get currentIncident() {
        return this.incidents.length > 0 ? this.incidents[0] : null;
    }

    get incidentCount() {
        return this.incidents.length;
    }

    get criticalNeedCount() {
        return this.requests.filter((request) => request.Priority__c === 'Critical').length;
    }

    get decisionCount() {
        return this.decisions.length;
    }

    get availableResourceTotal() {
        const total = this.resources.reduce((sum, resource) => sum + (resource.Quantity_Available__c || 0), 0);
        return new Intl.NumberFormat('en-US').format(total);
    }

    get disableWhatIf() {
        return this.isBusy || !this.currentIncident;
    }

    handleInstructionChange(event) {
        this.instruction = event.target.value;
    }

    handleWhatIfChange(event) {
        this.whatIfScenario = event.target.value;
    }

    async handleSeedDemoData() {
        await this.runAction(async () => {
            await seedDemoData();
            this.showToast('Demo data ready', 'Warehouses, resources, and AI health metrics are available.', 'success');
        });
    }

    async handleCreatePlan() {
        await this.runAction(async () => {
            await createIncidentFromInstruction({ instruction: this.instruction });
            this.whatIfResult = null;
            this.showToast('Response plan created', 'RESCUE generated needs, allocations, response plan, and audit trail records.', 'success');
        });
    }

    async handleApprovePlan(event) {
        const responsePlanId = event.currentTarget.dataset.id;
        await this.runAction(async () => {
            await approvePlan({ responsePlanId });
            this.showToast('Response plan approved', 'Shipments were created and the AI decision audit trail was updated.', 'success');
        });
    }

    async handleWhatIf() {
        await this.runAction(async () => {
            this.whatIfResult = await runWhatIf({
                incidentId: this.currentIncident.Id,
                scenario: this.whatIfScenario
            });
            this.showToast('Simulation complete', 'RESCUE recalculated allocation impact for the changed condition.', 'success');
        });
    }

    async refresh() {
        if (this.wiredDashboard) {
            await refreshApex(this.wiredDashboard);
        }
    }

    async runAction(action) {
        this.isBusy = true;
        try {
            await action();
            await this.refresh();
        } catch (error) {
            this.showToast('RESCUE action failed', this.normalizeError(error), 'error');
        } finally {
            this.isBusy = false;
        }
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    normalizeError(error) {
        if (Array.isArray(error?.body)) {
            return error.body.map((item) => item.message).join(', ');
        }
        return error?.body?.message || error?.message || 'Unknown error';
    }
}