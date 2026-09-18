# RESCUE React Command Center

Responsive React client for the Salesforce RESCUE data model. It runs with a
static demonstration dataset until a user connects an authorized Salesforce
org, then reads and mutates live data through the Apex REST API.

## Local development

```bash
npm install
npm run dev -- --host 127.0.0.1
```

## Salesforce setup

1. Deploy `RescueApi`, `RescueApiTest`, and the existing RESCUE metadata to the
	target org.
2. In Salesforce Setup, create an External Client App or Connected App with
	OAuth enabled.
3. Add `http://127.0.0.1:5173` as the callback URL.
4. Enable the `Manage user data via APIs (api)` OAuth scope and require PKCE
	with SHA-256. A client secret is not used by this browser application.
5. Add `http://127.0.0.1:5173` to Salesforce CORS Allowed Origins.
6. Give the integration users Apex class access to `RescueApi` and the RESCUE
	controller/service classes, plus the required custom-object permissions.
7. Copy `.env.example` to `.env` and set the Connected App consumer key.
8. Add a restricted Google Maps JavaScript API key as `VITE_GOOGLE_MAPS_API_KEY`.
	Enable Maps JavaScript API and restrict the key to your local and production
	HTTPS origins. The dashboard falls back to a clear configuration message when
	this variable is missing.

For local Vite development, add both of these HTTP referrers to the key:

- `http://127.0.0.1:5174/*`
- `http://localhost:5174/*`

The Google Cloud project must have billing enabled and the Maps JavaScript API
enabled. A key copied from a Google Maps network request may be restricted to a
different application and is not guaranteed to work in this React app.

For sandbox authentication, set `VITE_SF_LOGIN_URL` to
`https://test.salesforce.com`. Production deployments must register their HTTPS
origin as an additional callback URL and CORS allowed origin.

Do not put a Salesforce client secret, access token, password, or private key in
any `VITE_` variable. Vite embeds those variables in the browser bundle.

## API routes

- `GET /services/apexrest/rescue/v1/dashboard`
- `POST /services/apexrest/rescue/v1/incidents`
- `POST /services/apexrest/rescue/v1/approve`
- `POST /services/apexrest/rescue/v1/simulate`

## Validation

```bash
npm run lint
npm run build
```
