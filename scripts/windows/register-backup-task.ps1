<#
  Registers a daily Windows scheduled task that backs up PokeVerse saves.

    powershell -ExecutionPolicy Bypass -File scripts\windows\register-backup-task.ps1 [-Time 04:00] [-Keep 30]

  The task runs `docker exec -u 0 pokeverse /app/backup.sh /data /backups <Keep>`, which writes
  a dated .tar.gz into <POKEVERSE_HOME>\backups. It runs as you (Docker Desktop needs
  your session) and catches up after a missed run if the PC was asleep or off.
#>
param(
  [string]$Time = "04:00",
  [int]$Keep = 30
)
$ErrorActionPreference = "Stop"

$docker = (Get-Command docker -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute $docker -Argument "exec -u 0 pokeverse /app/backup.sh /data /backups $Keep"
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

Register-ScheduledTask -TaskName "PokeVerse backup" -Action $action -Trigger $trigger -Settings $settings `
  -Description "Daily backup of PokeVerse saves and database (keeps $Keep)." -Force | Out-Null

Write-Host "Registered 'PokeVerse backup' daily at $Time (keeping $Keep archives)."
Write-Host "Run it now to test:  Start-ScheduledTask -TaskName 'PokeVerse backup'"
