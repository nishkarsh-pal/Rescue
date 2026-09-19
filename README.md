# Rescue

Rescue is a Salesforce DX project based on Disaster Management.

## Prerequisites

- Git and access to this GitHub repository
- Salesforce CLI (`sf`)
- VS Code with the Salesforce Extension Pack (recommended)
- A Salesforce development org or sandbox for each developer
- Node.js and npm for LWC linting and unit tests

Verify the tools:

```bash
git --version
sf --version
node --version
npm --version
```

## Initial Setup

```bash
git clone https://github.com/nishkarsh-pal/Rescue.git
cd Rescue
npm install
git checkout develop
git pull origin develop
```

Configure your Git identity if needed:

```bash
git config user.name "Your Name"
git config user.email "your-email@example.com"
```

Never commit Salesforce authentication files, access tokens, passwords, consumer
secrets, certificates, private keys, or local environment files.

## Salesforce CLI Setup

Authorize a development org with a unique local alias:

```bash
sf org login web --alias YourDevOrg --set-default
sf org list
```

For a sandbox:

```bash
sf org login web --instance-url https://test.salesforce.com --alias YourSandbox
```

Org authentication is stored outside this repository and must never be shared
or committed.

## Branching Strategy

- `main`: stable, production-ready code
- `develop`: reviewed development and integration code
- `feature/JIRA-123-feature-name`: one ticket or focused change

```text
Developer -> feature/* -> Pull Request -> develop -> Pull Request -> main
```

Direct pushes and force pushes to `develop` and `main` are prohibited. This
workflow does not use bugfix, release, or hotfix branches.

## Start a Feature

Always branch from the latest `develop`:

```bash
git checkout develop
git pull origin develop
git checkout -b feature/JIRA-123-feature-name
```

Commit only relevant source and metadata:

```bash
git status
git add .
git diff --cached
git commit -m "feat: add feature description"
git push -u origin feature/JIRA-123-feature-name
```

Recommended commit prefixes are `feat:`, `fix:`, `refactor:`, and `test:`. Open
a pull request from the feature branch into `develop`. Stable reviewed changes
move from `develop` to `main` through a separate pull request.

Synchronize long-running feature branches frequently:

```bash
git fetch origin
git checkout feature/JIRA-123-feature-name
git merge origin/develop
```

Resolve conflicts locally, rerun tests, and push the resolution before final
review. Do not rewrite a shared branch unless the team explicitly coordinates it.

## Retrieve Metadata

Retrieve all metadata listed in the manifest:

```bash
sf project retrieve start --target-org YourDevOrg --manifest manifest/package.xml
```

Prefer focused retrieves during feature work:

```bash
sf project retrieve start --target-org YourDevOrg --metadata ApexClass:ClassName
sf project retrieve start --target-org YourDevOrg --metadata LightningComponentBundle:componentName
```

Review `git status` and `git diff` immediately after every retrieve. Remove
unrelated org changes before committing. `AiAuthoringBundle` requires a current
Salesforce CLI and source plugin; see Troubleshooting if it is not recognized.

## Deploy Metadata Manually

Preview deployment changes first:

```bash
sf project deploy preview --target-org YourDevOrg --source-dir force-app
```

Deploy the project or one component:

```bash
sf project deploy start --target-org YourDevOrg --source-dir force-app
sf project deploy start --target-org YourDevOrg --metadata ApexClass:ClassName
```

This repository intentionally contains no CI/CD workflow or automated deployment.

### Agentforce Dashboard Integration

The dashboard's Agentforce chat uses the `Agentforce_Integration__mdt` record
named `Default`. Before using the chat, replace `REPLACE_WITH_CLIENT_ID` and
`REPLACE_WITH_CLIENT_SECRET` in
`force-app/main/default/customMetadata/Agentforce_Integration.Default.md-meta.xml`
with the external client application's values. The record also contains the
Agent API, token, instance, and agent identifiers used by Apex.

The client secret is intentionally not included in this repository. For
production deployments, prefer a Named Credential or External Credential so
the secret is stored in Salesforce's encrypted credential store rather than
custom metadata.

## Run Tests

Run Apex tests in the target org:

```bash
sf apex run test --target-org YourDevOrg --test-level RunLocalTests --result-format human --wait 30
```

Run LWC tests, linting, and formatting checks locally:

```bash
npm run test:unit
npm run lint
npm run prettier:verify
```

Document commands and results in the pull request.

## Pull Request and Review Process

1. Complete and test the feature in a developer org.
2. Synchronize the feature branch with current `develop`.
3. Push the feature branch and open a pull request targeting `develop`.
4. Complete every section of the pull request template.
5. Resolve reviewer comments and merge conflicts.
6. Obtain the required approval before merging.
7. Promote stable changes through a `develop` to `main` pull request.

Reviewers verify Apex bulkification, no SOQL or DML in loops, exception handling,
meaningful names, focused changes, tests, metadata dependencies, permission
updates, CRUD/FLS handling, and the absence of credentials or accidental metadata.
See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete review process.

## Troubleshooting

### Org alias is not found

```bash
sf org list
sf org login web --alias YourDevOrg
```

### Retrieve fails without a manifest

Non-source-tracked orgs require an explicit manifest or metadata selector:

```bash
sf project retrieve start --target-org YourDevOrg --manifest manifest/package.xml
```

### Metadata type is missing from the CLI registry

Update the CLI and source plugin, restart the terminal, and retry:

```bash
sf update
sf plugins install @salesforce/plugin-source@latest
sf --version
```

### Merge conflicts after retrieving

Fetch current `develop`, merge it into the feature branch, resolve each conflict
with the component owner, rerun tests, and inspect the final diff.

### Deployment reports missing dependencies

Retrieve and commit the referenced fields, objects, classes, permission sets, or
other metadata in the same focused pull request.
