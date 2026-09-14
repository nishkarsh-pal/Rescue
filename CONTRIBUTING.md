# Contributing to Rescue

All changes use feature branches and pull requests. Direct pushes to `develop`
and `main` are prohibited once the repository Rulesets are active.

## Developer Workflow

Start from the latest integration branch:

```bash
git checkout develop
git pull origin develop
git checkout -b feature/JIRA-123-feature-name
```

Work only on the assigned ticket and inspect retrieved metadata before staging.
Use concise conventional commit messages:

```text
feat: add account validation
fix: resolve trigger recursion
refactor: optimize lead service
test: add account trigger test
```

Commit and publish the feature branch:

```bash
git status
git add .
git diff --cached
git commit -m "feat: add feature description"
git push -u origin feature/JIRA-123-feature-name
```

Open a pull request from the feature branch to `develop`. Do not target `main`
from a feature branch.

## Synchronizing a Feature Branch

```bash
git fetch origin
git checkout feature/JIRA-123-feature-name
git merge origin/develop
```

Resolve conflicts locally, run relevant tests, inspect the diff, and push the
resolution. Do not force push after review begins unless reviewers explicitly
agree, because it invalidates reviewed commits.

## Pull Request Process

```text
Developer completes feature
  -> Push feature branch
  -> Create PR to develop
  -> Reviewer checks changes
  -> Developer resolves comments
  -> Approval
  -> Merge into develop
  -> Stable develop PR to main
```

Pull requests must contain one ticket or cohesive concern. Complete the template,
identify dependencies, provide test evidence, and remove unrelated changes.
Resolve all conversations and conflicts before merging.

Squash merge is recommended for feature pull requests to keep `develop` focused.
A normal merge commit is recommended for `develop` to `main` promotions so the
integration boundary remains visible.

## Review Checklist

### Code Quality

- Apex is bulkified and avoids SOQL or DML inside loops.
- Trigger logic is delegated to handlers and recursion is controlled.
- Exceptions are handled intentionally and names communicate purpose.
- Tests cover positive, negative, bulk, and permission-sensitive behavior.
- Dead, unnecessary, and unrelated code is absent.

### Salesforce Metadata

- Required objects, fields, layouts, Flows, permissions, and dependencies exist.
- Permission Sets are updated where access is required.
- Flow and automation behavior, order, and side effects are reviewed.
- Destructive or accidental metadata changes are absent.
- Component API versions and names are appropriate.

### Security

- No credentials, tokens, passwords, certificates, or private keys are committed.
- Apex enforces sharing and CRUD/FLS where required by its execution context.
- User input is validated and output is handled safely.
- Access uses least-privilege Permission Sets where possible.

## Salesforce Metadata Conflict Management

The most conflict-prone metadata includes Flows, Profiles, Permission Sets,
Custom Objects, layouts, and Custom Metadata records. These use shared XML files
or change indirectly when edited in Salesforce Setup.

- Assign owners for shared Flows, objects, layouts, and security metadata.
- Avoid concurrent edits to the same Flow; agree on one developer and version.
- Prefer Permission Sets over Profiles to reduce broad XML conflicts.
- Announce changes to shared metadata before starting work.
- Retrieve only assigned components when practical.
- Review `git status` and `git diff` after every retrieve.
- Never include unrelated org changes merely because the CLI retrieved them.
- Keep pull requests small and synchronize with `develop` frequently.
- Resolve conflicts before requesting final approval.

Apex conflicts arise when the same methods or handler framework change. LWC
conflicts arise when the same JavaScript, template, metadata, or CSS file changes.
Coordinate ownership at the component level, not only by metadata type.

## GitHub Rulesets

Rulesets cannot be represented fully by repository files. A repository admin must
configure them in **Settings > Rules > Rulesets > New ruleset > New branch
ruleset**. Prefer Rulesets over legacy branch protection rules.

### Develop Ruleset

1. Name it `Protect develop`, set enforcement to **Active**, and target `develop`.
2. Do not add routine developers to the bypass list.
3. Enable **Restrict deletions** and **Block force pushes**.
4. Enable **Require a pull request before merging**.
5. Require 1 approval and dismiss stale approvals after new commits.
6. Require approval of the most recent reviewable push.
7. Require all review conversations to be resolved.
8. Require CODEOWNERS review after team ownership is assigned.

### Main Ruleset

1. Name it `Protect main`, set enforcement to **Active**, and target `main`.
2. Do not add routine developers to the bypass list.
3. Enable **Restrict deletions** and **Block force pushes**.
4. Enable **Require a pull request before merging**.
5. Require 2 approvals for production governance, or 1 for a very small team.
6. Dismiss stale approvals and require approval of the latest reviewable push.
7. Require all review conversations to be resolved.
8. Require CODEOWNERS review after team ownership is assigned.

GitHub ties strict "branch must be up to date" enforcement to required status
checks or a merge queue. This repository intentionally has no CI/CD checks, so
reviewers must currently require contributors to use **Update branch** or merge
current `develop` before approval. If required checks are introduced separately
later, enable **Require status checks to pass** and **Require branches to be up
to date before merging** for both protected branches.

## CODEOWNERS Setup

`.github/CODEOWNERS` uses `@nishkarsh-pal`, a valid repository owner, for every
area. Replace component entries with real GitHub users or organization teams as
responsibilities are assigned, for example:

```text
/force-app/main/default/classes/ @your-org/apex-team
/force-app/main/default/lwc/ @your-org/lightning-team
```

Teams must exist in the organization, have explicit repository access, and be
visible to CODEOWNERS. Verify the file in GitHub before requiring owner approval.

## Repository Security

- Keep `main` and `develop` protected with active Rulesets and no developer bypass.
- Require pull requests, approvals, resolved conversations, and owner review.
- Block force pushes and branch deletion.
- Store secrets in approved external secret-management systems, never Git.
- Keep local auth state and environment files ignored.
- Inspect staged content with `git diff --cached` before every commit.
- Rotate a secret immediately if committed; deleting the file does not remove it
  from Git history.

No GitHub Actions, CI/CD pipelines, automated deployments, or deployment secrets
are part of this repository setup.