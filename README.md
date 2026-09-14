# Rescue

Rescue is a Salesforce DX project containing Apex, Lightning components, custom
objects, layouts, applications, tabs, permissions, and Agentforce metadata. The
repository uses feature branches and pull requests so developers can work in
separate Salesforce orgs while sharing one reviewed source of truth.

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

## Repository Structure

```text
force-app/main/default/
  aiAuthoringBundles/  Agentforce authoring bundles
  applications/        Lightning applications
  aura/                Aura components
  classes/             Apex classes and tests
  flexipages/           Lightning pages
  layouts/              Page layouts
  lwc/                  Lightning Web Components
  objects/              Standard and custom object metadata
  permissionsets/       Permission sets
  tabs/                 Custom tabs
  triggers/             Apex triggers
  flows/                Created when Flow metadata is added
  customMetadata/       Created when custom metadata records are added
manifest/package.xml    Metadata retrieval manifest
config/                 Scratch org definition
scripts/                Apex and SOQL utility scripts
.github/                CODEOWNERS and pull request template
sfdx-project.json       Salesforce DX project configuration
```

Salesforce metadata directories are created when their first component is
retrieved or added. Placeholder files are intentionally not stored inside the
package directory because they are not Salesforce metadata.

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

## Metadata Conflict Management

Flows, Profiles, Permission Sets, object definitions, layouts, and shared custom
metadata records are the highest-conflict files because many Setup changes modify
large shared XML documents.

- Do not have multiple developers edit the same Flow version simultaneously.
- Prefer Permission Sets over Profiles whenever possible.
- Assign owners for shared Flows, objects, layouts, and access metadata.
- Communicate before changing shared metadata.
- Keep pull requests small and omit unrelated retrieve changes.
- Synchronize from `develop` frequently and resolve conflicts before final review.
- Understand both XML changes; never choose one entire conflict side blindly.

Apex classes, triggers, and LWCs merge more predictably, but conflicts remain
likely when developers edit the same method, handler, template, or stylesheet.

## Repository Security

Protect `main` and `develop` with pull request approvals, CODEOWNERS, resolved
review conversations, and disabled force pushes. Keep secrets in approved local
or organization secret-management tools, not source code or metadata. Inspect
staged content before every commit with `git diff --cached`.

The `.gitignore` excludes Salesforce CLI state, dependencies, environment files,
logs, and operating-system artifacts without ignoring Salesforce metadata.
GitHub Rulesets require manual repository configuration; see
[CONTRIBUTING.md](CONTRIBUTING.md#github-rulesets).

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
