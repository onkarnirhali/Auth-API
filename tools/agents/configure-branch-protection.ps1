param(
  [string]$Owner,
  [string]$Repo,
  [string[]]$Branches = @('main', 'master'),
  [string[]]$RequiredChecks = @('governance-check / governance'),
  [string]$Token = $env:GITHUB_TOKEN,
  [switch]$VerifyOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Parse-OwnerRepoFromRemote {
  $remoteUrl = (git config --get remote.origin.url).Trim()
  if (-not $remoteUrl) {
    throw 'Unable to determine remote.origin.url. Provide -Owner and -Repo.'
  }

  $match = [regex]::Match($remoteUrl, 'github\.com[:/](?<owner>[^/]+)/(?<repo>[^/.]+)(\.git)?$')
  if (-not $match.Success) {
    throw "Unsupported remote URL format: $remoteUrl"
  }

  return @{
    Owner = $match.Groups['owner'].Value
    Repo = $match.Groups['repo'].Value
  }
}

function Invoke-GitHubApi {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Url,
    [object]$Body
  )

  $headers = @{
    Authorization = "Bearer $Token"
    Accept = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
  }

  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers
  }

  $json = $Body | ConvertTo-Json -Depth 10 -Compress
  return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers -Body $json -ContentType 'application/json'
}

if (-not $Token) {
  throw 'Missing GitHub token. Set GITHUB_TOKEN or pass -Token.'
}

if (-not $Owner -or -not $Repo) {
  $parsed = Parse-OwnerRepoFromRemote
  if (-not $Owner) { $Owner = $parsed.Owner }
  if (-not $Repo) { $Repo = $parsed.Repo }
}

$baseUrl = "https://api.github.com/repos/$Owner/$Repo"
$repoInfo = Invoke-GitHubApi -Method GET -Url $baseUrl

$targetBranches = @()
foreach ($branch in $Branches) {
  if (-not $branch) { continue }
  try {
    $null = Invoke-GitHubApi -Method GET -Url "$baseUrl/branches/$branch"
    $targetBranches += $branch
  } catch {
    Write-Warning "Branch '$branch' does not exist in $Owner/$Repo. Skipping."
  }
}

if ($targetBranches.Count -eq 0) {
  $targetBranches = @($repoInfo.default_branch)
}

$protectionPayload = @{
  required_status_checks = @{
    strict = $true
    contexts = $RequiredChecks
  }
  enforce_admins = $true
  required_pull_request_reviews = @{
    dismiss_stale_reviews = $true
    require_code_owner_reviews = $false
    required_approving_review_count = 1
  }
  restrictions = $null
}

foreach ($branch in $targetBranches) {
  if (-not $VerifyOnly) {
    $null = Invoke-GitHubApi -Method PUT -Url "$baseUrl/branches/$branch/protection" -Body $protectionPayload
    Write-Host "Applied branch protection on $Owner/${Repo}:$branch"
  }

  $protection = Invoke-GitHubApi -Method GET -Url "$baseUrl/branches/$branch/protection"
  $contexts = @()
  if ($null -ne $protection.required_status_checks -and $null -ne $protection.required_status_checks.contexts) {
    $contexts = @($protection.required_status_checks.contexts)
  }

  $missing = @($RequiredChecks | Where-Object { $_ -notin $contexts })
  if ($missing.Count -gt 0) {
    throw "Branch '$branch' is missing required status checks: $($missing -join ', ')"
  }

  Write-Host "Verified required checks on $Owner/${Repo}:$branch -> $($RequiredChecks -join ', ')"
}

$protectedBranches = Invoke-GitHubApi -Method GET -Url "$baseUrl/branches?protected=true&per_page=100"
foreach ($protectedBranch in $protectedBranches) {
  $branchName = $protectedBranch.name
  $protection = Invoke-GitHubApi -Method GET -Url "$baseUrl/branches/$branchName/protection"
  $contexts = @()
  if ($null -ne $protection.required_status_checks -and $null -ne $protection.required_status_checks.contexts) {
    $contexts = @($protection.required_status_checks.contexts)
  }

  $missing = @($RequiredChecks | Where-Object { $_ -notin $contexts })
  if ($missing.Count -gt 0) {
    throw "Protected branch '$branchName' is missing required status checks: $($missing -join ', ')"
  }
}

Write-Host "Done. Branch protection is configured and verified for $Owner/$Repo."

