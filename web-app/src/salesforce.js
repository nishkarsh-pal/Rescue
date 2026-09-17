const SESSION_KEY = 'rescue.salesforce.session'
const VERIFIER_KEY = 'rescue.salesforce.verifier'
const STATE_KEY = 'rescue.salesforce.state'

const config = {
  clientId: import.meta.env.VITE_SF_CLIENT_ID,
  loginUrl: import.meta.env.VITE_SF_LOGIN_URL || 'https://login.salesforce.com',
  redirectUri: import.meta.env.VITE_SF_REDIRECT_URI || window.location.origin,
}

export function isSalesforceConfigured() {
  return Boolean(config.clientId)
}

export function getSalesforceSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY))
  } catch {
    return null
  }
}

export function signOutSalesforce() {
  sessionStorage.removeItem(SESSION_KEY)
}

export async function beginSalesforceLogin() {
  if (!isSalesforceConfigured()) {
    throw new Error('Set VITE_SF_CLIENT_ID before connecting Salesforce.')
  }

  const verifier = randomUrlSafeValue(64)
  const state = randomUrlSafeValue(24)
  const challenge = await sha256Challenge(verifier)
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)

  const parameters = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  })
  window.location.assign(`${config.loginUrl}/services/oauth2/authorize?${parameters}`)
}

export async function completeSalesforceLogin() {
  const parameters = new URLSearchParams(window.location.search)
  const code = parameters.get('code')
  if (!code) return null

  const expectedState = sessionStorage.getItem(STATE_KEY)
  if (!expectedState || parameters.get('state') !== expectedState) {
    throw new Error('Salesforce login state did not match. Please try again.')
  }

  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code,
    code_verifier: verifier,
  })
  const response = await fetch(`${config.loginUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) throw new Error(await readError(response))

  const session = await response.json()
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)
  window.history.replaceState({}, document.title, window.location.pathname)
  return session
}

export async function loadSalesforceDashboard() {
  const data = await salesforceRequest('/services/apexrest/rescue/v1/dashboard')
  return mapSalesforceDashboard(data)
}

export async function approveSalesforcePlan(responsePlanId) {
  return salesforceRequest('/services/apexrest/rescue/v1/approve', {
    method: 'POST',
    body: JSON.stringify({ responsePlanId }),
  })
}

export async function simulateSalesforcePlan(incidentId, scenario) {
  const response = await salesforceRequest('/services/apexrest/rescue/v1/simulate', {
    method: 'POST',
    body: JSON.stringify({ incidentId, scenario }),
  })
  return response.simulation
}

async function salesforceRequest(path, options = {}) {
  const session = getSalesforceSession()
  if (!session?.access_token || !session?.instance_url) {
    throw new Error('Connect Salesforce to load live command center data.')
  }
  const response = await fetch(`${session.instance_url}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (response.status === 401) {
    signOutSalesforce()
    throw new Error('Your Salesforce session expired. Connect again.')
  }
  if (!response.ok) throw new Error(await readError(response))
  return response.status === 204 ? null : response.json()
}

export function mapSalesforceDashboard(data) {
  const plansByIncident = new Map((data.plans || []).map((plan) => [plan.Incident__c, plan]))
  const requestsByIncident = (data.requests || []).reduce((groups, request) => {
    const current = groups.get(request.Incident__c) || []
    current.push(request.Resource_Type__c)
    groups.set(request.Incident__c, current)
    return groups
  }, new Map())

  return {
    incidents: (data.incidents || []).map((incident) => {
      const plan = plansByIncident.get(incident.Id)
      return {
        id: incident.Id,
        planId: plan?.Id,
        name: incident.Name,
        country: incident.Country__c || incident.Location__c || 'Unknown location',
        type: incident.Disaster_Type__c || 'Emergency',
        severity: incident.Severity__c || 'Medium',
        status: incident.Status__c || 'Detected',
        people: formatNumber(incident.Population_Affected__c),
        updated: formatRelativeTime(incident.Detected_Date__c || incident.Start_Date__c),
        coordinates: formatCoordinates(incident.Latitude__c, incident.Longitude__c),
        description: incident.Situation_Summary__c || incident.Profile_Overview__c || 'Situation assessment is in progress.',
        needs: [...new Set(requestsByIncident.get(incident.Id) || [])].slice(0, 4),
        coverage: Number(plan?.Estimated_Coverage__c || 0),
        eta: plan?.Estimated_ETA_Hours__c ? `${plan.Estimated_ETA_Hours__c}h` : 'Assessing',
        risk: Number(plan?.Risk_Score__c || 0),
      }
    }),
    resources: mapResources(data.resources || []),
    plans: data.plans || [],
    shipments: data.shipments || [],
    decisions: data.decisions || [],
    evaluations: data.evaluations || [],
    requests: data.requests || [],
  }
}

function mapResources(records) {
  const grouped = records.reduce((result, record) => {
    const type = record.Resource_Type__c || 'Other'
    result[type] = (result[type] || 0) + Number(record.Quantity_Available__c || 0)
    return result
  }, {})
  return Object.entries(grouped).map(([name, quantity]) => ({
    name,
    icon: name.charAt(0).toUpperCase(),
    available: `${formatNumber(quantity)} available`,
    allocated: Math.min(92, Math.max(18, Math.round(quantity / 400))),
    trend: 'Live',
  }))
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0))
}

function formatCoordinates(latitude, longitude) {
  if (latitude == null || longitude == null) return 'Coordinates pending'
  return `${Number(latitude).toFixed(2)}, ${Number(longitude).toFixed(2)}`
}

function formatRelativeTime(value) {
  if (!value) return 'Recently'
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 60) return `${minutes} min`
  if (minutes < 1440) return `${Math.round(minutes / 60)} hr`
  return `${Math.round(minutes / 1440)} d`
}

function randomUrlSafeValue(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return toBase64Url(bytes)
}

async function sha256Challenge(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return toBase64Url(new Uint8Array(digest))
}

function toBase64Url(bytes) {
  return btoa(String.fromCodePoint(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

async function readError(response) {
  const text = await response.text()
  try {
    const value = JSON.parse(text)
    return value[0]?.message || value.message || `Salesforce request failed (${response.status}).`
  } catch {
    return text || `Salesforce request failed (${response.status}).`
  }
}