<#
.SYNOPSIS
  Cadence enterprise policy installer — Windows.

.DESCRIPTION
  Drops a `policy.json` into the highest-precedence non-MDM path on
  Windows (`%ProgramData%\Cadence\policy.json`), restricts write access to
  Administrators, and validates the source JSON before installing.

  After install, Cadence on this machine reads the policy on every launch
  and hides the gated features (sync, AI assistant, JSON export, update
  check) from end-users. The mechanism mirrors how Chrome / Edge enterprise
  policies behave and requires no Cadence-operated server.

.PARAMETER Source
  Path to the policy file to install. Must be valid JSON containing at
  least a `preset` field OR a non-empty `features` object.

.PARAMETER Validate
  Validate the source file without installing. Useful in CI to fail
  early on a malformed admin-supplied JSON.

.PARAMETER Uninstall
  Remove the currently-installed policy from `%ProgramData%\Cadence`.
  Requires Administrator. Cadence falls back to the user's onboarding
  preset (or the personal default) on the next launch.

.EXAMPLE
  # Install (must be run from an elevated PowerShell)
  .\scripts\install-policy.ps1 -Source .\policy.example.json

.EXAMPLE
  # Pre-flight validate during PR / CI:
  .\scripts\install-policy.ps1 -Source .\policy.json -Validate

.EXAMPLE
  # Remove:
  .\scripts\install-policy.ps1 -Uninstall

.NOTES
  Exit codes:
    0  installed / validated successfully
    1  invalid arguments or source file missing
    2  source JSON is malformed or fails the schema check
    3  destination is not writable (re-run from an elevated prompt)
    4  atomic install failed mid-flight (existing file is unchanged)
#>

[CmdletBinding(DefaultParameterSetName = 'Install')]
param(
  [Parameter(ParameterSetName = 'Install', Mandatory = $true, Position = 0)]
  [Parameter(ParameterSetName = 'ValidateOnly', Mandatory = $true, Position = 0)]
  [string]$Source,

  [Parameter(ParameterSetName = 'ValidateOnly')]
  [switch]$Validate,

  [Parameter(ParameterSetName = 'Uninstall')]
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$DestDir  = Join-Path $env:ProgramData 'Cadence'
$DestFile = Join-Path $DestDir 'policy.json'

function Test-IsElevated {
  # Robust elevation check that works in Windows PowerShell 5.x and
  # PowerShell 7+, including on a non-domain machine.
  try {
    $identity  = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
  } catch {
    return $false
  }
}

function Invoke-Validation {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Write-Error "Source file not found: $Path"
    exit 1
  }

  try {
    $raw = Get-Content -Raw -LiteralPath $Path
    $obj = $raw | ConvertFrom-Json -ErrorAction Stop
  } catch {
    Write-Error "Source policy is not valid JSON: $($_.Exception.Message)"
    exit 2
  }

  if ($obj -isnot [pscustomobject] -and $obj -isnot [hashtable]) {
    Write-Error "Policy must be a JSON object."
    exit 2
  }

  $preset   = $obj.preset
  $features = $obj.features
  $managedBy = $obj.managedBy
  $validPresets = @('personal', 'work-standard', 'work-strict')

  if (-not $preset -and -not $features) {
    Write-Error "Policy must specify a 'preset' OR a non-empty 'features' object."
    exit 2
  }
  if ($preset -and ($validPresets -notcontains $preset)) {
    Write-Error "Unknown preset '$preset'; valid presets are: $($validPresets -join ', ')"
    exit 2
  }
  if ($managedBy -and ($managedBy -isnot [string])) {
    Write-Error "'managedBy' must be a string."
    exit 2
  }
  if ($features -and ($features -isnot [pscustomobject])) {
    Write-Error "'features' must be a JSON object."
    exit 2
  }

  Write-Host "OK: policy is valid (preset=$($preset ?? '—'), features=$(if ($features) {'yes'} else {'no'}), managedBy=$($managedBy ?? '—'))"
}

if ($Uninstall) {
  if (-not (Test-Path -LiteralPath $DestFile -PathType Leaf)) {
    Write-Host "Nothing to do: $DestFile does not exist."
    exit 0
  }
  if (-not (Test-IsElevated)) {
    Write-Error "Uninstall requires Administrator. Re-run this from an elevated PowerShell."
    exit 3
  }
  try {
    Remove-Item -LiteralPath $DestFile -Force -ErrorAction Stop
  } catch {
    Write-Error "Could not remove $DestFile : $($_.Exception.Message)"
    exit 3
  }
  Write-Host "Removed: $DestFile"
  Write-Host "Restart Cadence on this device to apply."
  exit 0
}

Invoke-Validation -Path $Source

if ($Validate) {
  exit 0
}

if (-not (Test-IsElevated)) {
  Write-Error @"
Install requires Administrator (the destination is under %ProgramData%
which is intentionally write-protected for regular users).

Re-run from an elevated PowerShell, e.g.:
  Start-Process powershell -Verb RunAs -ArgumentList '-File','$PSCommandPath','-Source','$Source'
"@
  exit 3
}

Write-Host "Installing policy to: $DestFile"

try {
  New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
} catch {
  Write-Error "Could not create $DestDir : $($_.Exception.Message)"
  exit 3
}

# Atomic install via temp-and-move within the same directory. PowerShell's
# Move-Item across the same volume invokes ReplaceFileW under the hood
# (atomic on NTFS), so a power loss mid-install leaves either the old
# file or the new file — never a torn one.
$tmp = Join-Path $DestDir ('.policy.json.{0}' -f ([Guid]::NewGuid().ToString('N')))
try {
  Copy-Item -LiteralPath $Source -Destination $tmp -Force -ErrorAction Stop
  Move-Item -LiteralPath $tmp -Destination $DestFile -Force -ErrorAction Stop
} catch {
  if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
  Write-Error "Atomic install failed; original $DestFile (if any) is intact. $($_.Exception.Message)"
  exit 4
}

# Lock down the ACL: SYSTEM and Administrators get full control, everyone
# else gets read-only. This matches the locked-down behaviour you'd get
# from a GPO-deployed file.
try {
  $acl = Get-Acl -LiteralPath $DestFile
  $acl.SetAccessRuleProtection($true, $false)  # disable inheritance, no copy
  $rules = @(
    (New-Object System.Security.AccessControl.FileSystemAccessRule('SYSTEM',         'FullControl',    'Allow')),
    (New-Object System.Security.AccessControl.FileSystemAccessRule('Administrators', 'FullControl',    'Allow')),
    (New-Object System.Security.AccessControl.FileSystemAccessRule('Users',          'ReadAndExecute', 'Allow'))
  )
  foreach ($r in $rules) { $acl.AddAccessRule($r) }
  Set-Acl -LiteralPath $DestFile -AclObject $acl
} catch {
  Write-Warning "Installed, but could not harden ACL (file is still in place): $($_.Exception.Message)"
}

Write-Host "OK Installed."
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Quit Cadence (close all windows + ensure the tray icon is gone)."
Write-Host "  2. Reopen Cadence."
Write-Host "  3. Open Settings -> App profile."
Write-Host "  4. Confirm the badge reads 'Managed by organization' and the"
Write-Host "     policy path matches: $DestFile"
Write-Host ""
Write-Host "Higher-precedence paths (if you ever need MDM-grade enforcement):"
Write-Host "  %ProgramFiles%\Cadence\policy.json    (deploy via Group Policy Files)"
Write-Host "  Cadence\resources\policy.json         (bake into the installer)"
