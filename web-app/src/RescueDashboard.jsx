import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, Bell, Boxes, Check, ChevronDown, CircleDot,
  ClipboardCheck, Clock3, Command, Gauge, LayoutDashboard, MapPin, Menu,
  Radio, Search, ShieldCheck, Sparkles, Truck, Users, Warehouse, X, Zap,
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
  { id: 1, name: 'Kenya Flash Floods', country: 'Kenya', type: 'Flood', severity: 'Critical', status: 'Escalated', people: '42,800', updated: '4 min', coordinates: '0.57 N, 37.89 E', description: 'River overflow has displaced communities across three counties. Roads into Tana River are partially inaccessible.', needs: ['Water', 'Shelter', 'Medical'], coverage: 64, eta: '3h 20m', risk: 86 },
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
  ['Shipment SHP-0058 dispatched', 'Nairobi Hub to Tana River', '2 min ago', Truck],
  ['Response plan approved', 'Kenya Flash Floods · RP-0024', '8 min ago', ClipboardCheck],
  ['New situation report received', 'ReliefWeb incident feed', '14 min ago', Radio],
  ['Inventory threshold detected', 'Medical kits · Nairobi Hub', '21 min ago', AlertTriangle],
]
const navItems = [['Overview', LayoutDashboard], ['Incidents', AlertTriangle], ['Resources', Boxes], ['Logistics', Truck], ['AI decisions', Sparkles]]

export default function RescueDashboard() {
  const [activeNav, setActiveNav] = useState('Overview')
  const [selectedId, setSelectedId] = useState(1)
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
  const displayIncidents = dashboard?.incidents?.length ? dashboard.incidents : fallbackIncidents
  const displayResources = dashboard?.resources?.length ? dashboard.resources : fallbackResources
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
        setSelectedId(liveDashboard.incidents[0]?.id)
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
    setConnection('loading')
    try {
      setDashboard(await loadSalesforceDashboard())
      setConnection('live')
      showNotice('Salesforce data refreshed')
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
        {navItems.map(([label, Icon]) => <button key={label} className={activeNav === label ? 'nav-item active' : 'nav-item'} onClick={() => { setActiveNav(label); setMobileNav(false) }}><Icon size={19} /><span>{label}</span>{label === 'Incidents' && <b>6</b>}</button>)}
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
        <div className="top-actions">{connection === 'live' ? <button className="live-pill connection-button" onClick={refreshDashboard}><span className="live-dot" /> Salesforce live</button> : <button className="connect-button" onClick={() => isSalesforceConfigured() ? beginSalesforceLogin() : setConnectionError('Add your Connected App client ID to web-app/.env first.')}><span className="live-dot demo" /> Connect Salesforce</button>}<button className="icon-button notification" aria-label="Notifications"><Bell size={20} /><span>3</span></button></div>
      </header>
      <div className="content">
        <section className="page-heading"><div><p className="eyebrow">Emergency operations · September 16, 2026</p><h1>{activeNav === 'Overview' ? 'Global response overview' : activeNav}</h1><p>Live coordination across active incidents and response teams.</p></div><button className="primary-button" onClick={() => showNotice('Incident report workspace opened')}><AlertTriangle size={18} /> Report incident</button></section>
        {connectionError && <div className="connection-error"><AlertTriangle size={16} /><span>{connectionError}</span><button onClick={() => setConnectionError('')} aria-label="Dismiss connection error"><X size={15} /></button></div>}
        <section className="metrics-grid" aria-label="Operational metrics">
          <Metric icon={AlertTriangle} label="Active incidents" value={displayIncidents.length} detail={`${displayIncidents.filter((incident) => incident.severity === 'Critical').length} critical`} tone="red" />
          <Metric icon={Users} label="People affected" value={connection === 'live' ? 'Live' : '193K'} detail={connection === 'live' ? 'Salesforce records' : 'Demo dataset'} tone="amber" />
          <Metric icon={Truck} label="Resources deployed" value="78%" detail="+6% today" tone="green" />
          <Metric icon={Clock3} label="Average response" value="3h 42m" detail="24m faster" tone="blue" />
        </section>

        <section className="workspace-grid">
          <div className="panel incidents-panel">
            <PanelHeading kicker="Priority queue" title="Active incidents" action="View all" />
            <div className="filters"><label className="filter-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter incidents" /></label><div className="select-wrap"><select value={severity} onChange={(event) => setSeverity(event.target.value)} aria-label="Filter by severity"><option>All</option><option>Critical</option><option>High</option><option>Medium</option></select><ChevronDown size={15} /></div></div>
            <div className="incident-list">{filteredIncidents.map((incident) => <button key={incident.id} className={selected.id === incident.id ? 'incident-item selected' : 'incident-item'} onClick={() => selectIncident(incident.id)}><span className={`severity-mark ${incident.severity.toLowerCase()}`} /><span className="incident-main"><strong>{incident.name}</strong><small><MapPin size={13} /> {incident.country} · {incident.type}</small></span><span className="incident-meta"><b className={`severity-label ${incident.severity.toLowerCase()}`}>{incident.severity}</b><small>{incident.updated}</small></span></button>)}{!filteredIncidents.length && <div className="empty-state">No incidents match this filter.</div>}</div>
          </div>

          <article className="panel focus-panel">
            <div className="focus-top"><div><span className={`severity-label ${selected.severity.toLowerCase()}`}>{selected.severity} priority</span><h2>{selected.name}</h2><p><MapPin size={15} /> {selected.country} · {selected.coordinates}</p></div><button className="more-button" aria-label="Incident actions">•••</button></div>
            <div className="map-visual" role="img" aria-label={`Response map centered on ${selected.country}`}><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Equirectangular_projection_SW.jpg/1280px-Equirectangular_projection_SW.jpg" alt="Satellite view of the world" /><div className="map-shade" /><span className="map-pin"><MapPin size={22} /></span><span className="map-label">{selected.country}<small>Primary impact zone</small></span><div className="map-status"><Radio size={15} /> 8 field signals</div></div>
            <p className="incident-description">{selected.description}</p>
            <div className="impact-row"><div><span>People affected</span><strong>{selected.people}</strong></div><div><span>Current coverage</span><strong>{selected.coverage}%</strong></div><div><span>Response ETA</span><strong>{selected.eta}</strong></div></div>
            <div className="needs"><span>Priority needs</span>{selected.needs.map((need) => <b key={need}>{need}</b>)}</div>
          </article>

          <aside className="panel ai-panel">
            <div className="agent-heading"><span className="agent-icon"><Sparkles size={19} /></span><div><h2>AI response agent</h2><p>Recommendation ready</p></div><span className="online-dot" /></div>
            <div className="recommendation"><span className="section-kicker">Recommended allocation</span><h3>Deploy rapid response package</h3><p>Prioritize water and medical supplies from Nairobi Hub via the northern route.</p><div className="allocation-line"><span>Water</span><strong>24,000 L</strong></div><div className="allocation-line"><span>Medical kits</span><strong>1,800</strong></div><div className="allocation-line"><span>Shelter kits</span><strong>3,200</strong></div><div className="confidence"><span>Confidence</span><div><i style={{ width: `${100 - selected.risk / 3}%` }} /></div><strong>{Math.round(100 - selected.risk / 3)}%</strong></div><div className="risk-note"><ShieldCheck size={17} /><span><strong>Human approval required</strong><small>Risk score {selected.risk}% · Medium-high impact</small></span></div></div>
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