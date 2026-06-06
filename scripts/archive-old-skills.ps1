<#
.SYNOPSIS
    Archive old novel-writing skills (novel-inspiration, novel-setting, webnovel-writer, multi-search-engine)
    Safely moves them to skills-archived/ after novel-weaver supersedes them.

.DESCRIPTION
    Moves 4 legacy skills from $env:USERPROFILE\.config\opencode\skills\
    to a backup directory skills-archived/. Supports Dry-Run / Force / logging.

.PARAMETER DryRun
    Preview what would be moved without performing the actual move.

.PARAMETER Force
    Skip confirmation prompt and execute immediately.

.PARAMETER LogPath
    Optional path to log file. If not set, output goes to console only.

.EXAMPLE
    .\archive-old-skills.ps1 -DryRun
    .\archive-old-skills.ps1 -Force
    .\archive-old-skills.ps1 -Force -LogPath "..\.omo\evidence\task-19-archive.log"
#>

param(
    [switch]$DryRun,
    [switch]$Force,
    [string]$LogPath = ""
)

$ErrorActionPreference = "Stop"

# --- Configuration ---
$oldSkills = @(
    "novel-inspiration",
    "novel-setting",
    "webnovel-writer",
    "multi-search-engine"
)

$skillsDir   = "$env:USERPROFILE\.config\opencode\skills"
$archiveDir  = "$env:USERPROFILE\.config\opencode\skills-archived"
$timestamp   = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# --- Logger ---
function Write-Log {
    param([string]$Message)
    $line = "[$timestamp] $Message"
    Write-Host $line
    if ($LogPath -ne "") {
        $line | Out-File -FilePath $LogPath -Encoding utf8 -Append
    }
}

# --- Banner ---
Write-Log "============================================"
Write-Log " novel-weaver: Archive Old Skills"
Write-Log "============================================"
Write-Log "Source: $skillsDir"
Write-Log "Target: $archiveDir"
if ($DryRun)  { Write-Log "Mode: DRY-RUN (preview only)" }
if ($Force)   { Write-Log "Mode: FORCE (skip confirmation)" }
Write-Log ""

# --- Confirmation (skip if Force or DryRun) ---
if (-not $Force -and -not $DryRun) {
    Write-Host "The following skills will be archived to $archiveDir :" -ForegroundColor Yellow
    foreach ($skill in $oldSkills) {
        $path = Join-Path $skillsDir $skill
        if (Test-Path -LiteralPath $path) {
            Write-Host "  * $skill" -ForegroundColor Cyan
        }
    }
    Write-Host ""
    $confirm = Read-Host "Proceed with archive? (y/N)"
    if ($confirm -notin @("y", "Y", "yes", "YES")) {
        Write-Log "[ABORT] Archive cancelled by user"
        exit 0
    }
}

# --- Create archive directory ---
if (-not $DryRun) {
    if (-not (Test-Path -LiteralPath $archiveDir)) {
        New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null
        Write-Log "[DIR] Created archive directory: $archiveDir"
    }
}

# --- Archive each skill ---
$archived  = @()
$notFound  = @()
$errors    = @()

foreach ($skill in $oldSkills) {
    $source = Join-Path $skillsDir $skill
    $dest   = Join-Path $archiveDir $skill

    if (Test-Path -LiteralPath $source) {
        if ($DryRun) {
            Write-Log "[DRY-RUN] Would move: $source -> $dest"
        } else {
            try {
                # Remove existing archive destination if present
                if (Test-Path -LiteralPath $dest) {
                    Remove-Item -LiteralPath $dest -Recurse -Force
                    Write-Log "[WARN] Destination existed, overwritten: $dest"
                }
                Move-Item -LiteralPath $source -Destination $dest -Force
                Write-Log "[OK] Archived: $skill"
            } catch {
                Write-Log "[ERR] Failed to archive: $skill -- $_"
                $errors += $skill
                continue
            }
        }
        $archived += $skill
    } else {
        Write-Log "[SKIP] Not found: $skill (may have been removed already)"
        $notFound += $skill
    }
}

# --- Summary ---
Write-Log ""
Write-Log "============================================"
Write-Log " Archive Summary"
Write-Log "============================================"
Write-Log "Archived: $($archived.Count) / $($oldSkills.Count) skills"
Write-Log "Not found: $($notFound.Count) skills"
if ($errors.Count -gt 0) {
    Write-Log "Failed: $($errors.Count) skills -- $($errors -join ', ')"
}
Write-Log ""

if ($DryRun) {
    Write-Log "Tip: Run with -Force to execute the archive, or run without flags for interactive confirmation."
}
