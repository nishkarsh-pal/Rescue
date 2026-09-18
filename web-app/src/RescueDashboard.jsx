import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, Bell, Boxes, Check, ChevronDown, CircleDot,
  ClipboardCheck, Clock3, Command, Gauge, LayoutDashboard, MapPin, Menu,
  Moon, Radio, Search, ShieldCheck, Sparkles, Sun, Truck, Users, Warehouse, X, Zap,
} from 'lucide-react'
import './rescue.css'
import './salesforce.css'
import {
  approveSalesforcePlan,
  beginSalesforceLogin,
  completeSalesforceLogin,
  getSalesforceSession,
  isSalesforceConfigured,
  loadSalesforceDashboard,
  simulateSalesforcePlan,
} from './salesforce.js'

const fallbackIncidents = [
  { id: 2, name: 'Gaziantep Earthquake', country: 'Türkiye', type: 'Earthquake', severity: 'High', status: 'Executing', people: '18,200', updated: '11 min', coordinates: '38.96 N, 35.24 E', description: 'A magnitude 6.4 event caused structural damage and utility outages across dense urban districts.', needs: ['Medical', 'Shelter', 'Food'], coverage: 78, eta: '2h 45m', risk: 72 },
  { id: 3, name: 'Guatemala Landslide', country: 'Guatemala', type: 'Landslide', severity: 'High', status: 'Recommended', people: '9,600', updated: '18 min', coordinates: '15.78 N, 90.23 W', description: 'Saturated hillsides have blocked primary transit routes and isolated several residential communities.', needs: ['Food', 'Equipment', 'Medical'], coverage: 58, eta: '4h 10m', risk: 68 },
  { id: 4, name: 'Tropical Cyclone Delta', country: 'Philippines', type: 'Cyclone', severity: 'High', status: 'Executing', people: '31,400', updated: '26 min', coordinates: '12.87 N, 121.77 E', description: 'Severe winds and flash flooding are affecting coastal communities and critical infrastructure.', needs: ['Water', 'Shelter', 'Power'], coverage: 81, eta: '2h 05m', risk: 70 },
  { id: 5, name: 'Bangladesh Monsoon Floods', country: 'Bangladesh', type: 'Flood', severity: 'High', status: 'Detected', people: '24,100', updated: '42 min', coordinates: '23.68 N, 90.35 E', description: 'Flood walls have been breached, leaving low-lying districts isolated from regional supply routes.', needs: ['Water', 'Food', 'Shelter'], coverage: 46, eta: '5h 30m', risk: 74 },
  { id: 6, name: 'Somalia Drought', country: 'Somalia', type: 'Drought', severity: 'Medium', status: 'Monitoring', people: '67,000', updated: '1 hr', coordinates: '5.15 N, 46.20 E', description: 'Consecutive failed rainy seasons continue to disrupt local food and water systems.', needs: ['Water', 'Food', 'Nutrition'], coverage: 71, eta: '6h 15m', risk: 54 },
]

const fallbackResources = [
  { name: 'Drinking water', icon: 'W', available: '92,400 L', allocated: 68, trend: '+12%' },
  { name: 'Emergency meals', icon: 'F', available: '48,200 units', allocated: 52, trend: '+8%' },
  { name: 'Medical kits', icon: 'M', available: '8,620 kits', allocated: 74, trend: '-4%' },
  { name: 'Shelter kits', icon: 'S', available: '12,840 kits', allocated: 46, trend: '+18%' },
]

const agents = [['Situation intelligence', 96], ['Needs assessment', 94], ['Resource allocation', 91], ['Logistics routing', 95]]
const activities = [
  ['Shipment SHP-0058 dispatched', 'Regional Hub to Gaziantep', '2 min ago', Truck],
  ['Response plan approved', 'Gaziantep Earthquake · RP-0024', '8 min ago', ClipboardCheck],
  ['New situation report received', 'ReliefWeb incident feed', '14 min ago', Radio],
  ['Inventory threshold detected', 'Medical kits · Regional Hub', '21 min ago', AlertTriangle],
]
const navItems = [['Overview', LayoutDashboard], ['Incidents', AlertTriangle], ['Resources', Boxes], ['Logistics', Truck], ['AI decisions', Sparkles]]
const hiddenIncidentNames = new Set(['Kenya Flash Floods'])

export default function RescueDashboard() {
  const [activeNav, setActiveNav] = useState('Overview')
  const [selectedId, setSelectedId] = useState(2)
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState('All')
  const [approved, setApproved] = useState(false)
  const [scenario, setScenario] = useState('Road B17 is blocked and rainfall is increasing.')
  const [simulation, setSimulation] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [notice, setNotice] = useState('')
  const [dashboard, setDashboard] = useState(null)
  const [connection, setConnection] = useState(getSalesforceSession() ? 'loading' : 'demo')
  const [connectionError, setConnectionError] = useState('')
  const [theme, setTheme] = useState(() => localStorage.getItem('rescue.theme') || 'light')
  const sourceIncidents = dashboard?.incidents?.length ? dashboard.incidents : fallbackIncidents
  const displayIncidents = sourceIncidents.filter((incident) => !hiddenIncidentNames.has(incident.name))
  const displayResources = dashboard?.resources?.length ? dashboard.resources : fallbackResources
  const criticalNeeds = dashboard?.requests?.filter((request) => request.Priority__c === 'Critical').length || 0
  const availableResources = dashboard?.resources?.reduce((total, resource) => total + Number(resource.Quantity_Available__c || 0), 0) || 0
  const aiDecisionCount = dashboard?.decisions?.length || 0
  const displayAgents = dashboard?.evaluations?.length
    ? dashboard.evaluations.slice(0, 4).map((evaluation) => [evaluation.Agent__c, Number(evaluation.Confidence__c || 0)])
    : agents
  const selected = displayIncidents.find((incident) => incident.id === selectedId) || displayIncidents[0]
  const filteredIncidents = useMemo(() => displayIncidents.filter((incident) => {
    const matches = `${incident.name} ${incident.country} ${incident.type}`.toLowerCase().includes(query.toLowerCase())
    return matches && (severity === 'All' || incident.severity === severity)
  }), [displayIncidents, query, severity])

  useEffect(() => {
    let active = true
    async function initializeSalesforce() {
      try {
        const session = await completeSalesforceLogin() || getSalesforceSession()
        if (!session) return
        const liveDashboard = await loadSalesforceDashboard()
        if (!active) return
        setDashboard(liveDashboard)
        setSelectedId(liveDashboard.incidents.find((incident) => !hiddenIncidentNames.has(incident.name))?.id)
        setConnection('live')
      } catch (error) {
        if (!active) return
        setConnection('error')
        setConnectionError(error.message)
      }
    }
    initializeSalesforce()
    return () => { active = false }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('rescue.theme', theme)
  }, [theme])

  function selectIncident(id) {
    setSelectedId(id)
    setApproved(false)
    setSimulation(false)
    setMobileNav(false)
  }

  function showNotice(message) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }

  async function refreshDashboard() {
    try {
      if (connection === 'live') {
        setDashboard(await loadSalesforceDashboard())
        setConnection('live')
        showNotice('Salesforce data refreshed')
      } else {
        setQuery('')
        setSeverity('All')
        setSelectedId(2)
        setApproved(false)
        setSimulation(false)
        showNotice('Demo view refreshed')
      }
    } catch (error) {
      setConnection('error')
      setConnectionError(error.message)
    }
  }

  async function approvePlan() {
    if (connection === 'live' && selected.planId) {
      await approveSalesforcePlan(selected.planId)
      await refreshDashboard()
    }
    setApproved(true)
    showNotice('Response plan approved and dispatched')
  }

  async function simulatePlan() {
    if (connection === 'live') {
      setSimulation(await simulateSalesforcePlan(selected.id, scenario))
      return
    }
    setSimulation({ proposedCoverage: 82, recommendation: 'Use the alternative northern route.', reason: 'Risk decreases by 12%.' })
  }

  return <div className="rescue-app">
    <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><div className="brand-mark"><Command size={21} /></div><div><strong>RESCUE</strong><span>Command network</span></div><button className="icon-button sidebar-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={20} /></button></div>
      <nav aria-label="Main navigation">
        <p className="nav-label">Operations</p>
        {navItems.map(([label, Icon]) => <button key={label} className={activeNav === label ? 'nav-item active' : 'nav-item'} onClick={() => { setActiveNav(label); setMobileNav(false) }}><Icon size={19} /><span>{label}</span>{label === 'Incidents' && <b>{displayIncidents.length}</b>}</button>)}
        <p className="nav-label">Management</p>
        <button className="nav-item"><Warehouse size={19} /><span>Warehouses</span></button>
        <button className="nav-item"><Users size={19} /><span>Field teams</span></button>
      </nav>
      <div className="system-card"><span className="live-dot" /><div><strong>All systems operational</strong><small>Last sync 1 min ago</small></div></div>
      <div className="profile"><span className="avatar">AS</span><div><strong>Alex Sharma</strong><small>Operations lead</small></div><ChevronDown size={17} /></div>
    </aside>
    {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation overlay" />}

    <main>
      <header className="topbar">
        <button className="icon-button menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={21} /></button>
        <div className="mobile-brand"><Command size={18} /><strong>RESCUE</strong></div>
        <label className="global-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search incidents, locations, resources..." /></label>
        <div className="top-actions">{connection === 'live' ? <button className="live-pill connection-button" onClick={() => showNotice('Salesforce connection is active')}><span className="live-dot" /> Salesforce live</button> : <button className="connect-button" onClick={() => isSalesforceConfigured() ? beginSalesforceLogin() : setConnectionError('Add your Connected App client ID to web-app/.env first.')}><span className="live-dot demo" /> Connect Salesforce</button>}<button className="icon-button theme-button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button><button className="icon-button notification" aria-label="Notifications"><Bell size={20} /><span>3</span></button></div>
      </header>
      <div className="content">
        <section className="page-heading"><div><p className="eyebrow">Emergency operations · September 16, 2026</p><h1>{activeNav === 'Overview' ? 'Emergency response overview' : activeNav}</h1><p>Coordinate active incidents and response teams in real time.</p></div><button className="primary-button" onClick={() => showNotice('Incident report workspace opened')}><AlertTriangle size={18} /> Report an incident</button></section>
        {connectionError && <div className="connection-error"><AlertTriangle size={16} /><span>{connectionError}</span><button onClick={() => setConnectionError('')} aria-label="Dismiss connection error"><X size={15} /></button></div>}
        <section className="metrics-grid" aria-label="Operational metrics">
          <Metric icon={AlertTriangle} label="Active incidents" value={displayIncidents.length} detail={`${displayIncidents.filter((incident) => incident.severity === 'Critical').length} critical`} tone="red" />
          <Metric icon={Users} label="Critical needs" value={connection === 'live' ? criticalNeeds : 'Demo'} detail={connection === 'live' ? 'Resource requests' : 'Connect Salesforce'} tone="amber" />
          <Metric icon={Truck} label="Available resources" value={connection === 'live' ? availableResources.toLocaleString('en-US') : 'Demo'} detail={connection === 'live' ? 'Units in inventory' : 'Connect Salesforce'} tone="green" />
          <Metric icon={Clock3} label="AI decisions" value={connection === 'live' ? aiDecisionCount : 'Demo'} detail={connection === 'live' ? 'Audit trail records' : 'Connect Salesforce'} tone="blue" />
        </section>

        <section className="workspace-grid">
          <div className="panel incidents-panel">
            <PanelHeading kicker="Priority queue" title="Active incidents" action="View all" />
            <div className="filters"><label className="filter-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter incidents" /></label><div className="select-wrap"><select value={severity} onChange={(event) => setSeverity(event.target.value)} aria-label="Filter by severity"><option>All</option><option>Critical</option><option>High</option><option>Medium</option></select><ChevronDown size={15} /></div></div>
            <div className="incident-list">{filteredIncidents.map((incident) => <button key={incident.id} className={selected.id === incident.id ? 'incident-item selected' : 'incident-item'} onClick={() => selectIncident(incident.id)}><span className={`severity-mark ${incident.severity.toLowerCase()}`} /><span className="incident-main"><strong>{incident.name}</strong><small><MapPin size={13} /> {incident.country} · {incident.type}</small></span><span className="incident-meta"><b className={`severity-label ${incident.severity.toLowerCase()}`}>{incident.severity}</b><small>{incident.updated}</small></span></button>)}{!filteredIncidents.length && <div className="empty-state">No incidents match this filter.</div>}</div>
          </div>

          <article className="panel focus-panel">
            <div className="focus-top"><div><span className={`severity-label ${selected.severity.toLowerCase()}`}>{selected.severity} priority</span><h2>{selected.name}</h2><p><MapPin size={15} /> {selected.country} · {selected.coordinates}</p></div><span className="map-provider-label">Google Maps</span></div>
            <GoogleIncidentMap incidents={displayIncidents} selected={selected} onSelect={selectIncident} />
            <p className="incident-description">{selected.description}</p>
            <div className="impact-row"><div><span>People affected</span><strong>{selected.people}</strong></div><div><span>Current coverage</span><strong>{selected.coverage}%</strong></div><div><span>Response ETA</span><strong>{selected.eta}</strong></div></div>
            <div className="needs"><span>Priority needs</span>{selected.needs.map((need) => <b key={need}>{need}</b>)}</div>
          </article>

          <aside className="panel ai-panel">
            <div className="agent-heading"><span className="agent-icon"><Sparkles size={19} /></span><div><h2>AI response agent</h2><p>Recommendation ready</p></div><span className="online-dot" /></div>
            <div className="recommendation"><span className="section-kicker">Recommended allocation</span><h3>Deploy rapid response package</h3><p>Prioritize water and medical supplies from the nearest available regional hub.</p><div className="allocation-line"><span>Water</span><strong>24,000 L</strong></div><div className="allocation-line"><span>Medical kits</span><strong>1,800</strong></div><div className="allocation-line"><span>Shelter kits</span><strong>3,200</strong></div><div className="confidence"><span>Confidence</span><div><i style={{ width: `${100 - selected.risk / 3}%` }} /></div><strong>{Math.round(100 - selected.risk / 3)}%</strong></div><div className="risk-note"><ShieldCheck size={17} /><span><strong>Human approval required</strong><small>Risk score {selected.risk}% · Medium-high impact</small></span></div></div>
            <button className={approved ? 'approve-button approved' : 'approve-button'} onClick={approvePlan} disabled={connection === 'live' && !selected.planId}>{approved ? <><Check size={18} /> Plan approved</> : <><Zap size={18} /> Approve & dispatch</>}</button>
            <button className="secondary-button" onClick={() => showNotice('Plan editor opened')}>Modify response plan</button>
          </aside>
        </section>

        <section className="lower-grid">
          <article className="panel resource-panel"><PanelHeading kicker="Network inventory" title="Resource readiness" action="Manage" /><div className="resource-grid">{displayResources.map((resource) => <div className="resource-item" key={resource.name}><span className="resource-icon">{resource.icon}</span><div><strong>{resource.name}</strong><small>{resource.available}</small><div className="progress"><i style={{ width: `${resource.allocated}%` }} /></div></div><b>{resource.trend}</b></div>)}</div></article>
          <article className="panel activity-panel"><div className="panel-heading"><div><span className="section-kicker">Live network</span><h2>Recent activity</h2></div><Activity size={19} /></div>{activities.map(([title, detail, time, Icon]) => <div className="activity-item" key={title}><span><Icon size={17} /></span><div><strong>{title}</strong><small>{detail}</small></div><time>{time}</time></div>)}</article>
        </section>

        <section className="lower-grid final-row">
          <article className="panel simulator-panel"><div className="panel-heading"><div><span className="section-kicker">Decision support</span><h2>What-if simulator</h2></div><Gauge size={20} /></div><label>Scenario change<textarea value={scenario} onChange={(event) => setScenario(event.target.value)} /></label><button className="secondary-button simulate" onClick={simulatePlan}><Sparkles size={17} /> Simulate reallocation</button>{simulation && <div className="simulation-result"><span><Check size={16} /></span><p><strong>Alternative route improves coverage to {simulation.proposedCoverage}%</strong>{simulation.recommendation} {simulation.reason}</p></div>}</article>
          <article className="panel agent-panel"><div className="panel-heading"><div><span className="section-kicker">Agentforce network</span><h2>AI command health</h2></div><span className="status-text"><span className="online-dot" /> Operational</span></div>{displayAgents.map(([name, score]) => <div className="agent-row" key={name}><span><CircleDot size={14} /> {name}</span><div><i style={{ width: `${score}%` }} /></div><strong>{score}%</strong></div>)}</article>
        </section>
      </div>
    </main>
    {notice && <div className="toast"><Check size={18} /> {notice}</div>}
  </div>
}

function Metric({ icon: Icon, label, value, detail, tone }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}><Icon size={20} /></span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>
}

function PanelHeading({ kicker, title, action }) {
  return <div className="panel-heading"><div><span className="section-kicker">{kicker}</span><h2>{title}</h2></div><button className="text-button">{action}</button></div>
}

function GoogleIncidentMap({ incidents, selected, onSelect }) {
  const mapElement = useRef(null)
  const mapInstance = useRef(null)
  const markers = useRef([])
  const [mapType, setMapType] = useState('roadmap')
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const [mapError, setMapError] = useState(() => apiKey ? '' : 'Add VITE_GOOGLE_MAPS_API_KEY to web-app/.env to load Google Maps.')
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    const handleAuthFailure = () => {
      setMapReady(false)
      setMapError('Google Maps needs Maps JavaScript API enabled, billing enabled, and localhost referrers allowed.')
    }
    window.addEventListener('rescue-google-auth-failure', handleAuthFailure)
    if (!apiKey) {
      return () => window.removeEventListener('rescue-google-auth-failure', handleAuthFailure)
    }

    let active = true
    loadGoogleMaps(apiKey)
      .then(() => {
        if (!active || !mapElement.current || mapInstance.current) return
        mapInstance.current = new window.google.maps.Map(mapElement.current, {
          center: { lat: 18, lng: 18 },
          zoom: 2,
          minZoom: 2,
          mapTypeId: 'roadmap',
          streetViewControl: false,
          fullscreenControl: true,
          mapTypeControl: false,
          gestureHandling: 'greedy',
          styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
        })
        setMapReady(true)
      })
      .catch(() => { if (active) { setMapReady(false); setMapError('Google Maps needs Maps JavaScript API enabled, billing enabled, and localhost referrers allowed.') } })

    return () => {
      active = false
      window.removeEventListener('rescue-google-auth-failure', handleAuthFailure)
    }
  }, [apiKey])

  useEffect(() => {
    if (!mapInstance.current || !window.google?.maps) return
    mapInstance.current.setMapTypeId(mapType)
  }, [mapType])

  useEffect(() => {
    if (!mapInstance.current || !window.google?.maps) return
    markers.current.forEach((marker) => marker.setMap(null))
    markers.current = incidents.map((incident) => {
      const marker = new window.google.maps.Marker({
        map: mapInstance.current,
        position: getIncidentPosition(incident),
        title: incident.name,
        label: { text: '•', color: incident.id === selected.id ? '#d93025' : '#f9a825', fontSize: '38px' },
        zIndex: incident.id === selected.id ? 10 : 2,
      })
      marker.addListener('click', () => onSelect(incident.id))
      return marker
    })

    const selectedPosition = getIncidentPosition(selected)
    mapInstance.current.setCenter(selectedPosition)
    mapInstance.current.setZoom(incidentCountForZoom(incidents.length))
    return () => markers.current.forEach((marker) => marker.setMap(null))
  }, [incidents, selected, onSelect])

  return <div className="google-map-shell">
    <div ref={mapElement} className="map-visual google-map" role="img" aria-label="Google map showing active RESCUE incidents" />
    {(!mapReady || mapError) && <div className="google-map-fallback" role="img" aria-label="Satellite preview of active RESCUE incidents"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Equirectangular_projection_SW.jpg/1280px-Equirectangular_projection_SW.jpg" alt="Satellite preview of the global incident network" /><div className="fallback-grid" />{incidents.map((incident, index) => <button key={incident.id} className={`fallback-pin pin-${index + 1} ${incident.id === selected.id ? 'selected' : ''}`} onClick={() => onSelect(incident.id)} aria-label={`Select ${incident.name}`} />)}</div>}
    <div className="google-map-toolbar"><button className={mapType === 'roadmap' ? 'active' : ''} onClick={() => setMapType('roadmap')}>Map</button><button className={mapType === 'satellite' ? 'active' : ''} onClick={() => setMapType('satellite')}>Satellite</button></div>
    <div className="map-incident-card"><strong>{selected.name}</strong><span>{selected.type} — {selected.country}</span><div><b className={`severity-text ${selected.severity.toLowerCase()}`}>{selected.severity}</b><span>{selected.status}</span></div></div>
    <span className="map-label">Global operations<small>{incidents.length} active impact zones · drag to move</small></span><div className="map-status"><Radio size={15} /> Live incident network</div>
    {mapError && <div className="map-error"><AlertTriangle size={16} /><span>Preview map active. {mapError}</span></div>}
  </div>
}

function loadGoogleMaps(apiKey) {
  if (window.google?.maps) return Promise.resolve()
  if (window.rescueGoogleMapsPromise) return window.rescueGoogleMapsPromise
  window.rescueGoogleMapsPromise = new Promise((resolve, reject) => {
    window.gm_authFailure = () => {
      window.dispatchEvent(new Event('rescue-google-auth-failure'))
      reject(new Error('Google Maps authentication failed'))
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`
    script.async = true
    script.defer = true
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
  return window.rescueGoogleMapsPromise
}

function getIncidentPosition(incident) {
  const coordinateMatch = String(incident.coordinates || '').match(/(-?\d+(?:\.\d+)?)[^\d-]+(-?\d+(?:\.\d+)?)/)
  if (coordinateMatch) {
    const latitude = Number(coordinateMatch[1]) * (String(incident.coordinates).includes('S') ? -1 : 1)
    const longitude = Number(coordinateMatch[2]) * (String(incident.coordinates).includes('W') ? -1 : 1)
    return { lat: latitude, lng: longitude }
  }
  const fallbackPositions = { Türkiye: { lat: 38.96, lng: 35.24 }, Guatemala: { lat: 15.78, lng: -90.23 }, Philippines: { lat: 12.87, lng: 121.77 }, Bangladesh: { lat: 23.68, lng: 90.35 }, Somalia: { lat: 5.15, lng: 46.2 } }
  return fallbackPositions[incident.country] || { lat: 18, lng: 18 }
}

function incidentCountForZoom(count) {
  return count > 4 ? 2 : count > 1 ? 3 : 5
}