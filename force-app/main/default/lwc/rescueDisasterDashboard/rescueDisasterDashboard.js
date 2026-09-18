import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { loadScript } from 'lightning/platformResourceLoader';
import { publish, subscribe, unsubscribe, MessageContext } from 'lightning/messageService';
import RESCUE_INCIDENT_CHANNEL from '@salesforce/messageChannel/RescueIncidentChannel__c';
import RESCUE_THREE_GLOBE from '@salesforce/resourceUrl/RescueThreeGlobe';
import getDashboardData from '@salesforce/apex/RescueCommandCenterController.getDashboardData';
import approvePlan from '@salesforce/apex/RescueCommandCenterController.approvePlan';
import generatePlan from '@salesforce/apex/RescueCommandCenterController.generatePlan';
import startAgentSession from '@salesforce/apex/RescueAgentConsoleController.startAgentSession';
import sendAgentMessage from '@salesforce/apex/RescueAgentConsoleController.sendAgentMessage';

const SOURCE = 'rescueDisasterDashboard';
const STAGE_ORDER = ['Detected', 'Understanding', 'Prioritized', 'Simulating', 'Recommended', 'Pending Approval', 'Allocating', 'Executing', 'Monitoring', 'Replanning'];
const GLOBE_RADIUS = 50;
const MIN_ZOOM_DISTANCE = 70;
const MAX_ZOOM_DISTANCE = 220;

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
    agentLoading = false;
    priorityMessageVisible = false;
    agentSessionKeys = {};
    agentSessions = {};
    agentSessionPromises = {};
    selectedIncidentId;
    selectedWarehouseId;
    showWarehouses = true;
    showGlobe = false;
    hoveredIncidentId;
    hoveredWarehouseId;
    globeLoadError;

    subscription;
    threeInitialized = false;
    three;
    scene;
    camera;
    renderer;
    controls;
    animationFrameId;
    markerMeshes = [];
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
    }

    handleIncidentMessage(message) {
        if (message.source !== SOURCE && message.incidentId !== this.selectedIncidentId) {
            this.selectedIncidentId = message.incidentId;
            this.selectedWarehouseId = undefined;
            this.chatMessages = [];
            this.priorityMessageVisible = false;
            this.refreshMarkerHighlight();
            this.focusGlobeOnIncident();
            this.initializeIncidentAgent(message.incidentId);
        }
    }

    @wire(getDashboardData)
    wiredDashboard(result) {
        this.wiredResult = result;
        if (result.data) {
            this.data = result.data;
            (result.data.incidents || []).forEach((incident) => this.ensureAgentSessionKey(incident.Id));
            if (!this.selectedIncidentId && result.data.incidents && result.data.incidents.length) {
                this.selectedIncidentId = this.defaultIncidentId(result.data.incidents);
                this.initializeIncidentAgent(this.selectedIncidentId);
            }
            if (this.threeInitialized) {
                this.rebuildMarkers();
                this.focusGlobeOnIncident();
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

    get warehouses() {
        return this.data.warehouses || [];
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
        return incidentMarkers.concat(warehouseMarkers);
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
            breakdown: forWarehouse.map((resource) => ({
                id: resource.Id,
                type: resource.Resource_Type__c,
                quantity: resource.Quantity_Available__c
            }))
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
        this.selectedWarehouseId = undefined;
        this.chatMessages = [];
        this.priorityMessageVisible = false;
        this.refreshMarkerHighlight();
        this.focusGlobeOnIncident();
        this.initializeIncidentAgent(incidentId);
        publish(this.messageContext, RESCUE_INCIDENT_CHANNEL, { incidentId, source: SOURCE });
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
        this.camera.position.set(0, 0, 140);

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
        if (!this.markerGroup || !window.THREE) {
            return;
        }
        const THREE = window.THREE;
        this.markerGroup.clear();
        this.markerMeshes = [];

        this.incidents
            .filter((incident) => incident.Latitude__c != null && incident.Longitude__c != null)
            .forEach((incident) => {
                const isSelected = incident.Id === this.selectedIncidentId;
                const position = this.latLonToVector3(incident.Latitude__c, incident.Longitude__c, GLOBE_RADIUS + 1.5);
                const geometry = new THREE.SphereGeometry(isSelected ? 2.2 : 1.4, 12, 12);
                const material = new THREE.MeshBasicMaterial({ color: isSelected ? 0xff4d4f : 0xffb020 });
                const marker = new THREE.Mesh(geometry, material);
                marker.position.copy(position);
                marker.userData.incidentId = incident.Id;
                marker.userData.markerType = 'incident';
                this.markerGroup.add(marker);
                this.markerMeshes.push(marker);
            });

        if (this.showWarehouses) {
            this.warehouses
                .filter((warehouse) => warehouse.Latitude__c != null && warehouse.Longitude__c != null)
                .forEach((warehouse) => {
                    const position = this.latLonToVector3(warehouse.Latitude__c, warehouse.Longitude__c, GLOBE_RADIUS + 1.8);
                    const geometry = new THREE.ConeGeometry(2.2, 5, 8);
                    const material = new THREE.MeshBasicMaterial({ color: 0x36d399 });
                    const marker = new THREE.Mesh(geometry, material);
                    marker.position.copy(position);
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
            this.rebuildMarkers();
            this.focusGlobeOnIncident();
            this.initializeIncidentAgent(incidentId);
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
            this.focusGlobeOnIncident();
            this.initializeIncidentAgent(markerValue);
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
        this.markerMeshes = [];
    }

    handleAskChange(event) {
        this.askText = event.target.value;
    }

    async handleAsk() {
        const question = (this.askText || '').trim();
        const incident = this.topIncident;
        if (!question || !incident || this.agentLoading) {
            return;
        }
        this.chatMessages = [...this.chatMessages, { id: Date.now() + '-user', from: 'user', text: question }];
        this.askText = '';
        this.agentLoading = true;

        try {
            const session = await this.ensureAgentSession(incident.Id);
            const result = await this.sendMessageToAgent(session, question);
            this.chatMessages = [...this.chatMessages, { id: Date.now() + '-agent', from: 'agent', text: result.reply }];
        } catch (error) {
            this.chatMessages = [...this.chatMessages, { id: Date.now() + '-error', from: 'agent', text: this.extractError(error) }];
        } finally {
            this.agentLoading = false;
        }
    }

    async initializeIncidentAgent(incidentId) {
        const incident = this.incidents.find((item) => item.Id === incidentId);
        if (!incident || this.agentSessions[incidentId] || this.agentSessionPromises[incidentId]) {
            return;
        }
        const incidentPayload = {
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
            .then((result) => {
                if (this.selectedIncidentId === incidentId) {
                    const welcome = this.agentSessions[incidentId].welcomeMessage;
                    this.chatMessages = [
                        ...(welcome ? [{ id: Date.now() + '-welcome', from: 'agent', text: welcome }] : []),
                        { id: Date.now() + '-agent', from: 'agent', text: result.reply }
                    ];
                    this.priorityMessageVisible = true;
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
