import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { loadScript } from 'lightning/platformResourceLoader';
import { publish, subscribe, unsubscribe, MessageContext } from 'lightning/messageService';
import RESCUE_INCIDENT_CHANNEL from '@salesforce/messageChannel/RescueIncidentChannel__c';
import RESCUE_THREE_GLOBE from '@salesforce/resourceUrl/RescueThreeGlobe';
import getDashboardData from '@salesforce/apex/RescueCommandCenterController.getDashboardData';
import startAgentSession from '@salesforce/apex/RescueAgentConsoleController.startAgentSession';
import sendAgentMessage from '@salesforce/apex/RescueAgentConsoleController.sendAgentMessage';

const SOURCE = 'rescueDisasterDashboard';
const STAGE_ORDER = ['Detected', 'Understanding', 'Prioritized', 'Simulating', 'Recommended', 'Pending Approval', 'Allocating', 'Executing', 'Monitoring', 'Replanning'];
const GLOBE_RADIUS = 50;
const DEFAULT_GLOBE_DISTANCE = 124;
const MIN_ZOOM_DISTANCE = 70;
const MAX_ZOOM_DISTANCE = 220;

const NEXT_STEPS = [
    { key: 'recommend', label: 'Review resource & allocation recommendation', stage: 'Recommended' },
    { key: 'logistics', label: 'Confirm logistics feasibility and ETA', stage: 'Pending Approval' },
    { key: 'approve', label: 'Human approve the response plan', stage: 'Allocating' },
    { key: 'dispatch', label: 'Allocate resources and dispatch shipments', stage: 'Executing' }
];

const NAV_ITEMS = [
    { key: 'home', label: 'Home', icon: 'utility:home' },
    { key: 'incidents', label: 'Incidents', icon: 'utility:warning' },
    { key: 'resource-centers', label: 'Resource Centers', icon: 'utility:location' },
    { key: 'resources', label: 'Resources', icon: 'utility:product' },
    { key: 'response-plans', label: 'Response Plans', icon: 'utility:task' },
    { key: 'shipments', label: 'Shipments', icon: 'utility:truck' },
    { key: 'reports', label: 'Reports', icon: 'utility:chart' },
    { key: 'agent-console', label: 'Agent Console', icon: 'utility:einstein' },
    { key: 'settings', label: 'Settings', icon: 'utility:settings' }
];

export default class RescueDisasterDashboard extends LightningElement {
    wiredResult;
    data = { incidents: [], requests: [], resources: [], plans: [], allocationPlans: [], allocations: [], shipments: [], decisions: [], evaluations: [] };
    isLoading = false;
    errorMessage;
    askText = '';
    chatMessages = [];
    agentLoading = false;
    incidentDetailsExpanded = false;
    isModifyMode = false;
    modificationText = '';
    priorityMessageVisible = false;
    proposalReady = false;
    proposalApproved = false;
    chatScrollPending = false;
    agentSessionKeys = {};
    agentSessions = {};
    agentSessionPromises = {};
    selectedIncidentId;
    selectedWarehouseId;
    showWarehouses = true;
    showGlobe = true;
    hoveredIncidentId;
    hoveredWarehouseId;
    globeLoadError;
    isNavigationOpen = false;
    activeNavigation = 'home';

    subscription;
    threeInitialized = false;
    three;
    scene;
    camera;
    renderer;
    controls;
    animationFrameId;
    markerMeshes = [];
    routeGroup;
    resizeObserver;

    @wire(MessageContext) messageContext;

    connectedCallback() {
        this.subscription = subscribe(this.messageContext, RESCUE_INCIDENT_CHANNEL, (message) => this.handleIncidentMessage(message));
    }

    disconnectedCallback() {
        unsubscribe(this.subscription);
        this.subscription = null;
        this.teardownGlobe();
    }

    renderedCallback() {
        if (this.showGlobe && !this.threeInitialized) {
            this.initGlobe();
        }
        if (this.chatScrollPending) {
            this.chatScrollPending = false;
            const chat = this.template.querySelector('.agent-chat');
            if (chat) chat.scrollTop = chat.scrollHeight;
        }
    }

    handleIncidentMessage(message) {
        if (message.source !== SOURCE && message.incidentId !== this.selectedIncidentId) {
            this.selectedIncidentId = message.incidentId;
            this.selectedWarehouseId = undefined;
            this.chatMessages = [];
            this.isModifyMode = false;
            this.modificationText = '';
            this.priorityMessageVisible = false;
            this.proposalReady = false;
            this.refreshMarkerHighlight();
            this.focusGlobeOnIncident();
            this.initializeIncidentAgentIfNeeded(message.incidentId);
        }
    }

    @wire(getDashboardData)
    wiredDashboard(result) {
        this.wiredResult = result;
        if (result.data) {
            this.data = result.data;
            (result.data.incidents || []).forEach((incident) => this.ensureAgentSessionKey(incident.Id));
            this.restoreIncidentWorkflowState();
            if (!this.selectedIncidentId && result.data.incidents && result.data.incidents.length) {
                this.selectedIncidentId = this.defaultIncidentId(result.data.incidents);
                this.restoreIncidentWorkflowState();
                this.initializeIncidentAgentIfNeeded(this.selectedIncidentId);
            }
            if (this.threeInitialized) {
                this.rebuildMarkers();
                this.focusGlobeOnIncident();
            }
        }
    }

    defaultIncidentId(incidents) {
        return incidents[0].Id;
    }

    get incidents() {
        return this.data.incidents || [];
    }

    get warehouses() {
        return this.data.warehouses || [];
    }

    get hasIncidents() {
        return this.incidents.length > 0;
    }

    get incidentDetailsToggleLabel() {
        return this.incidentDetailsExpanded ? 'Hide incident details' : 'Show incident details';
    }

    get navigationItems() {
        return NAV_ITEMS.map((item) => ({
            ...item,
            className: item.key === this.activeNavigation ? 'drawer-nav-item active' : 'drawer-nav-item'
        }));
    }

    get showIncidentsView() {
        return this.activeNavigation === 'incidents';
    }

    get showResourceCentersView() {
        return this.activeNavigation === 'resource-centers';
    }

    get showShipmentsView() {
        return this.activeNavigation === 'shipments';
    }

    get showAllocationView() {
        return this.activeNavigation === 'response-plans';
    }

    get mainGridClass() {
        return this.hasSidebarContentView ? 'main-grid sidebar-content-layout' : 'main-grid';
    }

    get hasSidebarContentView() {
        return this.showIncidentsView || this.showResourceCentersView || this.showShipmentsView || this.showAllocationView;
    }

    get metrics() {
        const incidents = this.incidents;
        const plans = this.data.plans || [];
        const resources = this.data.resources || [];

        const activeIncidents = incidents.filter((incident) => incident.Status__c !== 'Resolved').length;
        const availableResourceQuantity = resources.reduce(
            (total, resource) => total + (Number(resource.Available_To_Allocate__c) || 0),
            0
        );

        const etaValues = plans.map((plan) => plan.Estimated_ETA_Hours__c).filter((value) => value != null);
        const avgEtaHours = etaValues.length
            ? Math.round((etaValues.reduce((sum, value) => sum + Number(value), 0) / etaValues.length) * 10) / 10
            : 0;

        const locationSet = new Set();
        incidents.forEach((incident) => incident.Location__c && locationSet.add(incident.Location__c));
        resources.forEach((resource) => resource.Warehouse__r && resource.Warehouse__r.Location__c && locationSet.add(resource.Warehouse__r.Location__c));

        return {
            activeIncidents,
            availableResourceQuantity,
            avgEtaHours,
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
        const incidentMarkers = this.incidents
            .filter((incident) => incident.Latitude__c != null && incident.Longitude__c != null)
            .map((incident) => ({
                value: incident.Id,
                location: { Latitude: incident.Latitude__c, Longitude: incident.Longitude__c },
                title: incident.Name,
                description: (incident.Location__c || incident.Country__c || '') + ' — ' + (incident.Severity__c || ''),
                icon: 'standard:event'
            }));
        const warehouseMarkers = this.showWarehouses
            ? this.warehouses
                .filter((warehouse) => warehouse.Latitude__c != null && warehouse.Longitude__c != null)
                .map((warehouse) => ({
                    value: this.warehouseMarkerValue(warehouse.Id),
                    location: { Latitude: warehouse.Latitude__c, Longitude: warehouse.Longitude__c },
                    title: warehouse.Name,
                    description: (warehouse.Location__c || '') + ' — Warehouse (' + (warehouse.Status__c || 'Available') + ')',
                    icon: 'custom:custom26'
                }))
            : [];
        const shipmentMarkers = this.shipments.flatMap((shipment) => {
            const markers = [];
            if (shipment.Origin_Latitude__c != null && shipment.Origin_Longitude__c != null) {
                markers.push({
                    value: shipment.Id + '-origin',
                    location: { Latitude: shipment.Origin_Latitude__c, Longitude: shipment.Origin_Longitude__c },
                    title: shipment.Name + ' origin',
                    description: 'Shipment origin: ' + (shipment.Origin__c || '') + ' — ' + (shipment.Status__c || 'Planned'),
                    icon: 'standard:shipment'
                });
            }
            if (shipment.Destination_Latitude__c != null && shipment.Destination_Longitude__c != null) {
                markers.push({
                    value: shipment.Id + '-destination',
                    location: { Latitude: shipment.Destination_Latitude__c, Longitude: shipment.Destination_Longitude__c },
                    title: shipment.Name + ' destination',
                    description: 'Shipment destination: ' + (shipment.Destination__c || '') + ' — ETA ' + this.formatShipmentEta(shipment.ETA__c),
                    icon: 'standard:location'
                });
            }
            return markers;
        });
        return incidentMarkers.concat(warehouseMarkers, shipmentMarkers);
    }

    get shipments() {
        const plan = this.topPlan;
        const shipments = plan
            ? (this.data.shipments || []).filter((shipment) => shipment.Response_Plan__c === plan.Id)
            : [];
        return shipments.map((shipment) => ({
            ...shipment,
            etaLabel: this.formatShipmentEta(shipment.ETA__c)
        }));
    }

    get hasShipments() {
        return this.shipments.length > 0;
    }

    formatShipmentEta(value) {
        return value ? new Date(value).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Pending';
    }

    get hasMapMarkers() {
        return this.mapMarkers.length > 0;
    }

    get mapCenter() {
        const incident = this.topIncident;
        if (!incident || incident.Latitude__c == null || incident.Longitude__c == null) {
            return undefined;
        }
        return { location: { Latitude: incident.Latitude__c, Longitude: incident.Longitude__c } };
    }

    get mapZoomLevel() {
        return this.mapCenter ? 7 : 2;
    }

    get toggleMapLabel() {
        return this.showGlobe ? 'Map View' : 'Globe View';
    }

    get warehouseLegendLabel() {
        return 'Show warehouses';
    }

    get selectedMarkerValue() {
        return this.selectedWarehouseId ? this.warehouseMarkerValue(this.selectedWarehouseId) : this.selectedIncidentId;
    }

    get globeDetailIncident() {
        const incidentId = this.hoveredIncidentId || this.selectedIncidentId;
        return this.incidents.find((incident) => incident.Id === incidentId);
    }

    get globeDetailWarehouse() {
        return this.warehouses.find((warehouse) => warehouse.Id === this.hoveredWarehouseId);
    }

    get hasGlobeDetail() {
        return this.showGlobe && !!(this.globeDetailIncident || this.globeDetailWarehouse);
    }

    get globeDetailName() {
        return this.globeDetailWarehouse ? this.globeDetailWarehouse.Name : this.globeDetailIncident.Name;
    }

    get globeDetailSubtitle() {
        if (this.globeDetailWarehouse) {
            return [this.globeDetailWarehouse.Location__c, 'Warehouse'].filter(Boolean).join(' — ');
        }
        const incident = this.globeDetailIncident;
        return incident ? [incident.Disaster_Type__c, incident.Location__c || incident.Country__c].filter(Boolean).join(' — ') : '';
    }

    get globeDetailPrimaryFact() {
        return this.globeDetailWarehouse ? this.globeDetailWarehouse.Status__c : this.globeDetailIncident.Severity__c;
    }

    get globeDetailSecondaryFact() {
        return this.globeDetailWarehouse
            ? 'Capacity ' + (this.globeDetailWarehouse.Operating_Capacity__c || 0) + '%'
            : this.globeDetailIncident.Status__c;
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
        const plan = this.topPlan;
        const planGenerated = !!plan;
        const planApproved = !!plan && plan.Approval_Status__c === 'Approved';
        const shipments = plan
            ? (this.data.shipments || []).filter((shipment) => shipment.Response_Plan__c === plan.Id)
            : [];
        const shipmentsDelivered = shipments.length > 0 && shipments.every((shipment) => shipment.Status__c === 'Delivered');
        const complete = [planGenerated, planGenerated, planApproved, shipmentsDelivered];
        const activeIndex = complete.findIndex((isComplete) => !isComplete);
        return NEXT_STEPS.map((step, index) => ({
            key: step.key,
            label: step.label,
            numberClass: complete[index]
                ? 'step-number step-complete'
                : index === activeIndex
                    ? 'step-number step-active'
                    : 'step-number step-pending',
            number: index + 1
        }));
    }

    get canApproveTopPlan() {
        return this.topPlan && this.topPlan.Approval_Status__c === 'Pending Approval';
    }

    get approveDisabled() {
        return !this.topIncident || this.agentLoading || !this.proposalReady || this.proposalApproved;
    }

    restoreIncidentWorkflowState() {
        const incident = this.topIncident;
        if (!incident) {
            this.proposalReady = false;
            this.proposalApproved = false;
            return;
        }
        const incidentAllocations = (this.data.allocations || []).filter((allocation) => allocation.Incident__c === incident.Id);
        const responsePlans = (this.data.plans || []).filter((plan) => plan.Incident__c === incident.Id);
        this.proposalReady = incidentAllocations.length > 0 || responsePlans.length > 0;
        this.proposalApproved = responsePlans.some((plan) => plan.Approval_Status__c === 'Approved')
            || incidentAllocations.some((allocation) => ['Approved', 'Allocated', 'In Transit', 'Executing'].includes(allocation.Status__c));
    }

    hasExistingAllocationPlan(incidentId) {
        return (this.data.allocationPlans || []).some((plan) => plan.Incident__c === incidentId)
            || (this.data.allocations || []).some((allocation) => allocation.Incident__c === incidentId);
    }

    initializeIncidentAgentIfNeeded(incidentId) {
        if (!this.hasExistingAllocationPlan(incidentId)) {
            this.initializeIncidentAgent(incidentId);
        }
    }

    get nearestResourceCenter() {
        const resources = this.data.resources || [];
        const incident = this.topIncident;
        if (!incident || !this.warehouses.length) {
            return null;
        }
        const warehouse = this.findNearestWarehouse(incident);
        if (!warehouse) {
            return null;
        }
        const forWarehouse = resources.filter((resource) => resource.Warehouse__c === warehouse.Id);

        return {
            name: warehouse.Name,
            location: warehouse.Location__c,
            breakdown: forWarehouse.map((resource) => {
                const availabilityPercent = resource.Quantity_Available__c
                    ? Math.min(100, Math.round((resource.Available_To_Allocate__c || 0) / resource.Quantity_Available__c * 100))
                    : 0;
                const type = resource.Resource_Type__c || 'Resource';
                const iconMap = {
                    Food: 'utility:food_and_drink',
                    Water: 'utility:water',
                    Shelter: 'utility:home',
                    Medicine: 'utility:add'
                };
                return {
                    id: resource.Id,
                    type,
                    quantityLabel: this.formatResourceNumber(resource.Quantity_Available__c),
                    availableToAllocateLabel: this.formatResourceNumber(resource.Available_To_Allocate__c),
                    availabilityPercent,
                    progressStyle: `width: ${availabilityPercent}%`,
                    iconName: iconMap[type] || 'utility:product',
                    iconClass: 'resource-type-icon resource-type-' + type.toLowerCase()
                };
            })
        };
    }

    findNearestWarehouse(incident) {
        if (incident.Latitude__c == null || incident.Longitude__c == null) {
            return null;
        }
        return this.warehouses
            .filter((warehouse) => warehouse.Latitude__c != null && warehouse.Longitude__c != null)
            .map((warehouse) => ({
                warehouse,
                distance: this.distanceBetweenCoordinates(
                    incident.Latitude__c,
                    incident.Longitude__c,
                    warehouse.Latitude__c,
                    warehouse.Longitude__c
                )
            }))
            .sort((first, second) => first.distance - second.distance)
            .map((entry) => entry.warehouse)[0];
    }

    distanceBetweenCoordinates(firstLatitude, firstLongitude, secondLatitude, secondLongitude) {
        const earthRadiusKm = 6371;
        const latitudeDelta = this.toRadians(secondLatitude - firstLatitude);
        const longitudeDelta = this.toRadians(secondLongitude - firstLongitude);
        const firstLatitudeRadians = this.toRadians(firstLatitude);
        const secondLatitudeRadians = this.toRadians(secondLatitude);
        const haversine = Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2)
            + Math.cos(firstLatitudeRadians) * Math.cos(secondLatitudeRadians)
            * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);
        return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    }

    toRadians(degrees) {
        return degrees * Math.PI / 180;
    }

    formatResourceNumber(value) {
        return Number(value || 0).toLocaleString('en-US');
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
        const incidentAllocations = allocations.filter((allocation) => allocation.Incident__c === incident.Id);
        if (incidentAllocations.length) {
            return incidentAllocations.map((allocation) => ({
                id: allocation.Id,
                type: allocation.Resource_Request__r ? allocation.Resource_Request__r.Resource_Type__c : 'Resource',
                resourceName: allocation.Relief_Resource__r ? allocation.Relief_Resource__r.Name : 'Resource unavailable',
                warehouseName: allocation.Relief_Resource__r && allocation.Relief_Resource__r.Warehouse__r
                    ? allocation.Relief_Resource__r.Warehouse__r.Name
                    : 'Warehouse unavailable',
                warehouseLocation: allocation.Relief_Resource__r && allocation.Relief_Resource__r.Warehouse__r
                    ? allocation.Relief_Resource__r.Warehouse__r.Location__c
                    : '',
                allocatedQty: allocation.Quantity__c || 0,
                requestedQty: this.requestedQuantityForAllocation(allocation, requests),
                status: allocation.Status__c || 'Proposed'
            }));
        }
        return [];
    }

    requestedQuantityForAllocation(allocation, requests) {
        const request = requests.find((item) => item.Id === allocation.Resource_Request__c);
        return request ? request.Quantity__c || 0 : 0;
    }

    get hasAllocationBreakdown() {
        return this.allocationBreakdown.length > 0;
    }

    get hasAllocationProposal() {
        const incident = this.topIncident;
        if (!incident) {
            return false;
        }
        const hasAllocations = (this.data.allocations || []).some((allocation) => allocation.Incident__c === incident.Id);
        const hasApprovedResponsePlan = (this.data.plans || []).some((plan) => plan.Incident__c === incident.Id && plan.Approval_Status__c === 'Approved');
        return hasAllocations || hasApprovedResponsePlan;
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
        this.selectedWarehouseId = undefined;
        this.chatMessages = [];
            this.incidentDetailsExpanded = false;
        this.incidentDetailsExpanded = false;
        this.isModifyMode = false;
        this.modificationText = '';
        this.priorityMessageVisible = false;
        this.restoreIncidentWorkflowState();
        this.refreshMarkerHighlight();
        this.focusGlobeOnIncident();
        this.initializeIncidentAgentIfNeeded(incidentId);
        publish(this.messageContext, RESCUE_INCIDENT_CHANNEL, { incidentId, source: SOURCE });
    }

    handleNavigationToggle() {
        this.isNavigationOpen = !this.isNavigationOpen;
    }

    handleNavigationClose() {
        this.isNavigationOpen = false;
    }

    handleNavigationSelect(event) {
        this.activeNavigation = event.currentTarget.dataset.navigation;
        this.isNavigationOpen = false;
    }

    handleToggleGlobe() {
        this.showGlobe = !this.showGlobe;
        if (!this.showGlobe) {
            this.teardownGlobe();
            this.threeInitialized = false;
        }
    }

    handleShowWarehouses() {
        this.showWarehouses = true;
        this.refreshMarkerHighlight();
    }

    handleGlobeZoomIn() {
        this.dollyCamera(0.85);
    }

    handleGlobeZoomOut() {
        this.dollyCamera(1.15);
    }

    dollyCamera(factor) {
        if (!this.camera) {
            return;
        }
        const distance = Math.min(MAX_ZOOM_DISTANCE, Math.max(MIN_ZOOM_DISTANCE, this.camera.position.length() * factor));
        this.camera.position.setLength(distance);
    }

    async initGlobe() {
        this.threeInitialized = true;
        const container = this.template.querySelector('.globe-canvas-wrap');
        if (!container) {
            return;
        }
        try {
            await loadScript(this, RESCUE_THREE_GLOBE + '/three.min.js');
            await loadScript(this, RESCUE_THREE_GLOBE + '/OrbitControls.js');
            this.buildScene(container);
        } catch (error) {
            this.globeLoadError = 'Unable to load the 3D globe library: ' + this.extractError(error);
        }
    }

    buildScene(container) {
        const THREE = window.THREE;
        const width = container.clientWidth || 300;
        const height = container.clientHeight || 260;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
        this.camera.position.set(0, 0, DEFAULT_GLOBE_DISTANCE);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        container.appendChild(this.renderer.domElement);

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const sunLight = new THREE.DirectionalLight(0xffffff, 1.1);
        sunLight.position.set(120, 60, 100);
        this.scene.add(sunLight);

        const texture = new THREE.TextureLoader().load(RESCUE_THREE_GLOBE + '/earth_atmos_1024.jpg');
        const earthGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
        const earthMaterial = new THREE.MeshPhongMaterial({ map: texture });
        this.earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
        this.scene.add(this.earthMesh);

        // User-controlled only: no auto-rotate, mouse drag rotates and scroll wheel zooms.
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.autoRotate = false;
        this.controls.enablePan = false;
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = MIN_ZOOM_DISTANCE;
        this.controls.maxDistance = MAX_ZOOM_DISTANCE;
        this.controls.rotateSpeed = 0.6;

        this.markerGroup = new THREE.Group();
        this.scene.add(this.markerGroup);
        this.routeGroup = new THREE.Group();
        this.scene.add(this.routeGroup);
        this.rebuildMarkers();
        this.focusGlobeOnIncident();

        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.renderer.domElement.addEventListener('click', (event) => this.handleCanvasClick(event));
        this.renderer.domElement.addEventListener('mousemove', (event) => this.handleCanvasHover(event));

        if (window.ResizeObserver) {
            this.resizeObserver = new window.ResizeObserver(() => this.resizeGlobe(container));
            this.resizeObserver.observe(container);
        }

        this.startRenderLoop();
    }

    focusGlobeOnIncident() {
        const incident = this.topIncident;
        if (!incident || incident.Latitude__c == null || incident.Longitude__c == null || !this.earthMesh || !this.markerGroup || !window.THREE) {
            return;
        }
        const THREE = window.THREE;
        const incidentPoint = this.latLonToVector3(incident.Latitude__c, incident.Longitude__c, 1).normalize();
        const cameraDirection = new THREE.Vector3(0, 0, 1);
        const focusRotation = new THREE.Quaternion().setFromUnitVectors(incidentPoint, cameraDirection);
        this.earthMesh.quaternion.copy(focusRotation);
        this.markerGroup.quaternion.copy(focusRotation);
        this.routeGroup.quaternion.copy(focusRotation);
        if (this.controls) {
            this.controls.target.set(0, 0, 0);
            this.controls.update();
        }
    }

    resizeGlobe(container) {
        if (!this.renderer || !this.camera) {
            return;
        }
        const width = container.clientWidth || 300;
        const height = container.clientHeight || 260;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    rebuildMarkers() {
        if (!this.markerGroup || !this.routeGroup || !window.THREE) {
            return;
        }
        const THREE = window.THREE;
        this.markerGroup.clear();
        this.routeGroup.clear();
        this.markerMeshes = [];

        this.incidents
            .filter((incident) => incident.Latitude__c != null && incident.Longitude__c != null)
            .forEach((incident) => {
                const warehouse = this.findNearestWarehouse(incident);
                if (!warehouse || warehouse.Latitude__c == null || warehouse.Longitude__c == null) {
                    return;
                }
                const start = this.latLonToVector3(warehouse.Latitude__c, warehouse.Longitude__c, GLOBE_RADIUS + 1.2);
                const end = this.latLonToVector3(incident.Latitude__c, incident.Longitude__c, GLOBE_RADIUS + 1.2);
                const midpoint = start.clone().add(end).normalize().multiplyScalar(GLOBE_RADIUS + 8);
                const curve = new THREE.QuadraticBezierCurve3(start, midpoint, end);
                const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(36));
                const material = new THREE.LineDashedMaterial({
                    color: incident.Id === this.selectedIncidentId ? 0xffc14d : 0x54d6c0,
                    dashSize: incident.Id === this.selectedIncidentId ? 1.6 : 1.1,
                    gapSize: incident.Id === this.selectedIncidentId ? 0.7 : 0.9,
                    linewidth: incident.Id === this.selectedIncidentId ? 2 : 1,
                    transparent: true,
                    opacity: incident.Id === this.selectedIncidentId ? 1 : 0.72
                });
                const route = new THREE.Line(geometry, material);
                route.computeLineDistances();
                route.userData.incidentId = incident.Id;
                this.routeGroup.add(route);
            });

        this.incidents
            .filter((incident) => incident.Latitude__c != null && incident.Longitude__c != null)
            .forEach((incident) => {
                const isSelected = incident.Id === this.selectedIncidentId;
                const position = this.latLonToVector3(incident.Latitude__c, incident.Longitude__c, GLOBE_RADIUS + 1.2);
                const geometry = new THREE.SphereGeometry(isSelected ? 1.25 : 0.72, 16, 16);
                const material = new THREE.MeshBasicMaterial({ color: isSelected ? 0xff4d4f : 0xffb020 });
                const marker = new THREE.Mesh(geometry, material);
                marker.position.copy(position);
                marker.userData.incidentId = incident.Id;
                marker.userData.markerType = 'incident';
                this.markerGroup.add(marker);
                this.markerMeshes.push(marker);
                if (isSelected) {
                    const ring = new THREE.Mesh(
                        new THREE.TorusGeometry(2.1, 0.18, 8, 24),
                        new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9 })
                    );
                    ring.position.copy(position);
                    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), position.clone().normalize());
                    this.markerGroup.add(ring);
                }
            });

        if (this.showWarehouses) {
            this.warehouses
                .filter((warehouse) => warehouse.Latitude__c != null && warehouse.Longitude__c != null)
                .forEach((warehouse) => {
                    const position = this.latLonToVector3(warehouse.Latitude__c, warehouse.Longitude__c, GLOBE_RADIUS + 1.1);
                    const geometry = new THREE.OctahedronGeometry(0.62, 0);
                    const material = new THREE.MeshBasicMaterial({ color: 0x36d399 });
                    const marker = new THREE.Mesh(geometry, material);
                    marker.position.copy(position);
                    marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), position.clone().normalize());
                    marker.userData.warehouseId = warehouse.Id;
                    marker.userData.markerType = 'warehouse';
                    this.markerGroup.add(marker);
                    this.markerMeshes.push(marker);
                });
        }
    }

    refreshMarkerHighlight() {
        if (this.threeInitialized) {
            this.rebuildMarkers();
        }
    }

    latLonToVector3(lat, lon, radius) {
        const THREE = window.THREE;
        const phi = ((90 - lat) * Math.PI) / 180;
        const theta = ((lon + 180) * Math.PI) / 180;
        const x = -radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);
        return new THREE.Vector3(x, y, z);
    }

    startRenderLoop() {
        const renderFrame = () => {
            this.animationFrameId = window.requestAnimationFrame(renderFrame);
            if (this.controls) {
                this.controls.update();
            }
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }
        };
        renderFrame();
    }

    handleCanvasClick(event) {
        const marker = this.pickIncidentAt(event);
        if (marker && marker.markerType === 'warehouse') {
            this.hoveredWarehouseId = marker.id;
            this.hoveredIncidentId = undefined;
            return;
        }
        const incidentId = marker && marker.id;
        if (incidentId && incidentId !== this.selectedIncidentId) {
            this.selectedIncidentId = incidentId;
            this.selectedWarehouseId = undefined;
            this.hoveredWarehouseId = undefined;
            this.chatMessages = [];
            this.priorityMessageVisible = false;
            this.restoreIncidentWorkflowState();
            this.rebuildMarkers();
            this.focusGlobeOnIncident();
            this.initializeIncidentAgentIfNeeded(incidentId);
            publish(this.messageContext, RESCUE_INCIDENT_CHANNEL, { incidentId, source: SOURCE });
        }
    }

    handleCanvasHover(event) {
        const marker = this.pickIncidentAt(event);
        this.hoveredIncidentId = marker && marker.markerType === 'incident' ? marker.id : undefined;
        this.hoveredWarehouseId = marker && marker.markerType === 'warehouse' ? marker.id : undefined;
    }

    pickIncidentAt(event) {
        if (!this.raycaster || !this.markerMeshes.length) {
            return undefined;
        }
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const intersections = this.raycaster.intersectObjects(this.markerMeshes);
        if (!intersections.length) {
            return undefined;
        }
        const marker = intersections[0].object.userData;
        return { markerType: marker.markerType, id: marker.markerType === 'warehouse' ? marker.warehouseId : marker.incidentId };
    }

    warehouseMarkerValue(warehouseId) {
        return 'warehouse-' + warehouseId;
    }

    handleMapMarkerSelect(event) {
        const markerValue = event.detail.selectedMarkerValue;
        if (markerValue && markerValue.indexOf('warehouse-') === 0) {
            this.selectedWarehouseId = markerValue.substring('warehouse-'.length);
            return;
        }
        if (markerValue) {
            this.selectedIncidentId = markerValue;
            this.selectedWarehouseId = undefined;
            this.chatMessages = [];
            this.priorityMessageVisible = false;
            this.proposalReady = false;
            this.focusGlobeOnIncident();
            this.initializeIncidentAgentIfNeeded(markerValue);
            publish(this.messageContext, RESCUE_INCIDENT_CHANNEL, { incidentId: markerValue, source: SOURCE });
        }
    }

    teardownGlobe() {
        if (this.animationFrameId) {
            window.cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = undefined;
        }
        if (this.controls) {
            this.controls.dispose();
            this.controls = undefined;
        }
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.domElement.remove();
            this.renderer = undefined;
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = undefined;
        }
        this.scene = undefined;
        this.camera = undefined;
        this.routeGroup = undefined;
        this.markerMeshes = [];
    }

    handleAskChange(event) {
        this.askText = event.target.value;
    }

    handleIncidentDetailsToggle() {
        this.incidentDetailsExpanded = !this.incidentDetailsExpanded;
    }

    handleAskKeydown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.handleAsk();
        }
    }

    handleModificationChange(event) {
        this.modificationText = event.target.value;
    }

    handleCancelModification() {
        this.isModifyMode = false;
        this.modificationText = '';
    }

    async handleAsk() {
        const question = (this.askText || '').trim();
        const incident = this.topIncident;
        if (!question || !incident || this.agentLoading) {
            return;
        }
        this.chatMessages = [...this.chatMessages, { id: Date.now() + '-user', from: 'user', text: question }];
        this.chatScrollPending = true;
        this.askText = '';
        this.agentLoading = true;

        try {
            const session = await this.ensureAgentSession(incident.Id);
            const message = this.buildAgentFollowUpMessage(question);
            console.log('Agent follow-up payload:', message);
            const result = await this.sendMessageToAgent(session, message);
            this.chatMessages = [...this.chatMessages, { id: Date.now() + '-agent', from: 'agent', text: result.reply }];
            this.chatScrollPending = true;
        } catch (error) {
            this.chatMessages = [...this.chatMessages, { id: Date.now() + '-error', from: 'agent', text: this.extractError(error) }];
            this.chatScrollPending = true;
        } finally {
            this.agentLoading = false;
        }
    }

    buildAgentFollowUpMessage(question) {
        const normalized = question.toLowerCase();
        const approval = /\b(approve|approved|confirm|confirmed|authorize|authorise|proceed|yes\s*proceed)\b/.test(normalized);
        const modification = /\b(modify|modified|change|adjust|replan|alter)\b/.test(normalized);
        if (approval) {
            return JSON.stringify({ action: 'Approve', message: question });
        }
        if (modification) {
            return JSON.stringify({ action: 'Modify', message: question });
        }
        return question;
    }

    async initializeIncidentAgent(incidentId) {
        const incident = this.incidents.find((item) => item.Id === incidentId);
        if (!incident || this.agentSessions[incidentId] || this.agentSessionPromises[incidentId]) {
            return;
        }
        const incidentPayload = {
            incidentId: incident.Id,
            sessionKey: this.ensureAgentSessionKey(incidentId),
            severity: incident.Severity__c || '',
            profile_overview: incident.Profile_Overview__c || '',
            latitude: incident.Latitude__c,
            longitude: incident.Longitude__c,
            detected_date: incident.Detected_Date__c || ''
        };
        const incidentMessage = JSON.stringify(incidentPayload);
        console.log('Agent incident payload:', incidentMessage);
        this.agentLoading = true;
        const initialization = this.ensureAgentSession(incidentId)
            .then((session) => this.sendMessageToAgent(session, incidentMessage))
            .then(async (result) => {
                await refreshApex(this.wiredResult);
                if (this.selectedIncidentId === incidentId) {
                    const welcome = this.agentSessions[incidentId].welcomeMessage;
                    this.chatMessages = [
                        ...(welcome ? [{ id: Date.now() + '-welcome', from: 'agent', text: welcome }] : []),
                        { id: Date.now() + '-agent', from: 'agent', text: result.reply }
                    ];
                    this.proposalReady = true;
                }
            })
            .catch((error) => {
                if (this.selectedIncidentId === incidentId) {
                    this.chatMessages = [{ id: Date.now() + '-error', from: 'agent', text: this.extractError(error) }];
                }
            })
            .finally(() => {
                const promises = { ...this.agentSessionPromises };
                delete promises[incidentId];
                this.agentSessionPromises = promises;
                this.agentLoading = false;
            });
        this.agentSessionPromises = { ...this.agentSessionPromises, [incidentId]: initialization };
    }

    async sendMessageToAgent(session, message) {
        const result = await sendAgentMessage({
            sessionId: session.sessionId,
            sequenceId: session.nextSequence,
            message
        });
        session.nextSequence += 1;
        return result;
    }

    ensureAgentSessionKey(incidentId) {
        if (!this.agentSessionKeys[incidentId]) {
            this.agentSessionKeys = {
                ...this.agentSessionKeys,
                [incidentId]: this.createUuid()
            };
        }
        return this.agentSessionKeys[incidentId];
    }

    createUuid() {
        if (window.crypto && window.crypto.randomUUID) {
            return window.crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
            const random = Math.random() * 16 | 0;
            const value = character === 'x' ? random : (random & 0x3 | 0x8);
            return value.toString(16);
        });
    }

    async ensureAgentSession(incidentId) {
        if (this.agentSessions[incidentId]) {
            return this.agentSessions[incidentId];
        }
        const session = await startAgentSession({ externalSessionKey: this.ensureAgentSessionKey(incidentId) });
        const storedSession = { ...session, nextSequence: 1, welcomeShown: false };
        this.agentSessions = { ...this.agentSessions, [incidentId]: storedSession };
        return storedSession;
    }

    async handleApprove() {
        const incident = this.topIncident;
        if (!incident || this.approveDisabled) {
            return;
        }
        const payload = JSON.stringify({ action: 'Approve', message: 'Approve the displayed allocation plan.' });
        this.agentLoading = true;
        this.errorMessage = undefined;
        try {
            const session = await this.ensureAgentSession(incident.Id);
            console.log('Agent approval payload:', payload);
            const result = await this.sendMessageToAgent(session, payload);
            this.chatMessages = [...this.chatMessages, { id: Date.now() + '-agent', from: 'agent', text: result.reply }];
            this.proposalApproved = true;
            this.chatScrollPending = true;
            await refreshApex(this.wiredResult);
        } catch (error) {
            this.errorMessage = this.extractError(error);
        } finally {
            this.agentLoading = false;
        }
    }

    handleModifyPlan() {
        if (!this.topIncident || this.agentLoading) {
            return;
        }
        this.isModifyMode = true;
        this.proposalApproved = false;
    }

    async handleSubmitModification() {
        const instruction = (this.modificationText || '').trim();
        const incident = this.topIncident;
        if (!instruction || !incident || this.agentLoading) {
            return;
        }
        const payload = JSON.stringify({ action: 'Modify', message: instruction });
        this.isModifyMode = false;
        this.modificationText = '';
        this.agentLoading = true;
        console.log('Agent modification payload:', payload);
        try {
            const session = await this.ensureAgentSession(incident.Id);
            const result = await this.sendMessageToAgent(session, payload);
            await refreshApex(this.wiredResult);
            this.chatMessages = [...this.chatMessages, { id: Date.now() + '-agent', from: 'agent', text: result.reply }];
            this.proposalReady = true;
            this.proposalApproved = false;
            this.chatScrollPending = true;
        } catch (error) {
            this.chatMessages = [...this.chatMessages, { id: Date.now() + '-error', from: 'agent', text: this.extractError(error) }];
        } finally {
            this.agentLoading = false;
        }
    }

    extractError(error) {
        return (error && error.body && error.body.message) || error.message || 'Something went wrong.';
    }
}
