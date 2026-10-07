<#
  One-time setup of PokeVerse on NexusBody (Windows + Docker Desktop).

    powershell -ExecutionPolicy Bypass -File scripts\windows\setup.ps1 -PokeverseHome D:\Pokeverse

  Creates the folder layout, writes .env for docker compose, and copies the example
  games.json. Safe to re-run: it never overwrites existing files.
#>
param(
  [string]$PokeverseHome = "D:\Pokeverse"
)
$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "..\..")

foreach ($dir in @("library\roms", "library\boxart", "library\bios", "guides", "checklists", "backups")) {
  New-Item -ItemType Directory -Force -Path (Join-Path $PokeverseHome $dir) | Out-Null
}

$gamesJson = Join-Path $PokeverseHome "library\games.json"
if (-not (Test-Path $gamesJson)) {
  Copy-Item (Join-Path $repo "data.example\library\games.json") $gamesJson
  Write-Host "Created $gamesJson - edit it to match your ROM file names."
}

$envFile = Join-Path $repo ".env"
if (-not (Test-Path $envFile)) {
  # docker compose wants forward slashes in paths.
  $homeForCompose = (Resolve-Path $PokeverseHome).Path -replace "\\", "/"
  Set-Content -Path $envFile -Encoding ascii -Value @(
    "POKEVERSE_HOME=$homeForCompose",
    "TZ=America/Los_Angeles"
  )
  Write-Host "Wrote $envFile"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Warning "docker not found on PATH. Install/start Docker Desktop before 'docker compose up'."
}

Write-Host ""
Write-Host "Next:"
Write-Host "  1. Put ROMs in $PokeverseHome\library\roms and edit games.json"
Write-Host "  2. docker compose up -d --build        (from $repo)"
Write-Host "  3. tailscale serve --bg --https=443 http://127.0.0.1:8080"
Write-Host "  4. powershell -ExecutionPolicy Bypass -File scripts\windows\register-backup-task.ps1"
