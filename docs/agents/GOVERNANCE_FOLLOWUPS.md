# Governance Follow-ups

This document tracks deferred GitHub governance steps that require repository admin permissions.

## Pending Items

- `GOV-FOLLOWUP-001`: Enable branch protection and require `governance-check / governance` on the default branch.
- `GOV-FOLLOWUP-002`: Verify required status checks are enforced before merge for all protected branches.

## Execute Branch Protection

1. Create a GitHub token with repo admin rights (`repo` and `administration:write`).
2. Set token in your shell: `$env:GITHUB_TOKEN = "<token>"`.
3. Run from repo root:

```powershell
powershell -ExecutionPolicy Bypass -File tools/agents/configure-branch-protection.ps1
```

## Verify Without Applying

```powershell
powershell -ExecutionPolicy Bypass -File tools/agents/configure-branch-protection.ps1 -VerifyOnly
```

## Optional Explicit Owner/Repo

```powershell
powershell -ExecutionPolicy Bypass -File tools/agents/configure-branch-protection.ps1 -Owner onkarnirhali -Repo Auth-API
```

## Post-Run Checklist

- Confirm branch protection is enabled in GitHub settings.
- Confirm `governance-check / governance` appears under required status checks.
- Confirm pull requests cannot merge when governance check fails.
- Unset token from shell when done: `Remove-Item Env:GITHUB_TOKEN`.
