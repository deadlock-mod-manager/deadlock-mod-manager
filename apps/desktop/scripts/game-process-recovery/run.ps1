param(
    [Parameter(Mandatory = $true)]
    [string]$Artifact,
    [Parameter(Mandatory = $true)]
    [string]$Label,
    [string]$OutputRoot = "\\tsclient\DMM"
)

$ErrorActionPreference = "Stop"
$eventsPath = Join-Path $OutputRoot "$Label-events.ndjson"
$donePath = Join-Path $OutputRoot "$Label-done.json"
$errorPath = Join-Path $OutputRoot "$Label-error.txt"
$fixtureRoot = Join-Path $env:TEMP "dmm-game-process-recovery"
$fixturePath = Join-Path $fixtureRoot "deadlock.exe"
$gameRoot = "C:\DMMFakeDeadlock"

function Write-Event([string]$Name, [hashtable]$Data = @{}) {
    [ordered]@{
        utc = [DateTime]::UtcNow.ToString("o")
        name = $Name
        data = $Data
    } | ConvertTo-Json -Compress -Depth 6 |
        Add-Content -Path $eventsPath -Encoding utf8
}

function Stop-Dmm {
    Get-Process -Name "deadlock-mod-manager" -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
}

function Find-DmmExecutable {
    $roots = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    $entry = $roots | ForEach-Object {
        Get-ItemProperty $_ -ErrorAction SilentlyContinue
    } | Where-Object { $_.DisplayName -like "*Deadlock*Mod*Manager*" } |
        Select-Object -First 1
    if ($null -eq $entry) {
        throw "Deadlock Mod Manager uninstall entry was not found"
    }

    $candidate = Join-Path ([string]$entry.InstallLocation).Trim('"') "deadlock-mod-manager.exe"
    if (!(Test-Path $candidate)) {
        throw "Deadlock Mod Manager executable was not found at $candidate"
    }
    return $candidate
}

function Start-Dmm([string]$Executable) {
    Start-Process -FilePath $Executable -ArgumentList "--disable-auto-update" | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ([DateTime]::UtcNow -lt $deadline) {
        $window = Get-Process -Name "deadlock-mod-manager" -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowHandle -ne 0 -and $_.Responding } |
            Select-Object -First 1
        if ($null -ne $window) {
            return $window
        }
        Start-Sleep -Milliseconds 100
    }
    throw "Deadlock Mod Manager did not expose a responsive window"
}

function Build-Fixture {
    New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
    Remove-Item $fixturePath -Force -ErrorAction SilentlyContinue
    $source = @"
using System;
using System.Threading;

public static class Program
{
    public static int Main(string[] args)
    {
        string mode = args.Length > 0 ? args[0] : "hang";
        int delayMs = args.Length > 1 ? int.Parse(args[1]) : 2000;
        Thread.Sleep(delayMs);
        if (mode == "crash")
        {
            Environment.FailFast("Deterministic game-process recovery fixture");
        }
        if (mode == "hang")
        {
            Thread.Sleep(Timeout.Infinite);
        }
        return 0;
    }
}
"@
    Add-Type -TypeDefinition $source -Language CSharp -OutputAssembly $fixturePath -OutputType ConsoleApplication
}

function Write-DmmState {
    $stateRoot = Join-Path $env:APPDATA "dev.stormix.deadlock-mod-manager"
    $citadel = Join-Path $gameRoot "game\citadel"
    New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $citadel -Force | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $citadel "gameinfo.gi"), "")

    $persisted = [ordered]@{
        state = [ordered]@{
            gamePath = $gameRoot
            hasCompletedOnboarding = $true
            autoUpdateEnabled = $false
            telemetrySettings = [ordered]@{
                analyticsEnabled = $false
                hasSeenTelemetryPrompt = $true
            }
        }
        version = 24
    } | ConvertTo-Json -Compress -Depth 8
    $storeJson = [ordered]@{ "local-config" = $persisted } | ConvertTo-Json -Depth 8
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText(
        (Join-Path $stateRoot "state.json"),
        $storeJson,
        $utf8WithoutBom
    )
}

function Run-Natural([string]$Mode) {
    $fixture = Start-Process -FilePath $fixturePath -ArgumentList "$Mode 8000" -WindowStyle Hidden -PassThru
    Write-Event "$Mode-start" @{ pid = $fixture.Id }
    Start-Sleep -Seconds 6
    Write-Event "$Mode-running-settled" @{ pid = $fixture.Id }
    $fixture.WaitForExit()
    Write-Event "$Mode-exit" @{ pid = $fixture.Id; exitCode = $fixture.ExitCode }
    Start-Sleep -Seconds 6
    Write-Event "$Mode-exited-settled" @{ pid = $fixture.Id }
}

function Run-Forced {
    $fixture = Start-Process -FilePath $fixturePath -ArgumentList "hang 0" -WindowStyle Hidden -PassThru
    Write-Event "forced-start" @{ pid = $fixture.Id }
    Start-Sleep -Seconds 6
    Write-Event "forced-running-settled" @{ pid = $fixture.Id }
    Stop-Process -Id $fixture.Id -Force
    $fixture.WaitForExit()
    Write-Event "forced-exit" @{ pid = $fixture.Id; exitCode = $fixture.ExitCode }
    Start-Sleep -Seconds 6
    Write-Event "forced-exited-settled" @{ pid = $fixture.Id }
}

try {
    Remove-Item $eventsPath, $donePath, $errorPath -Force -ErrorAction SilentlyContinue
    Stop-Dmm
    Build-Fixture

    $installer = Start-Process -FilePath $Artifact -ArgumentList "/S" -PassThru -Wait
    if ($installer.ExitCode -ne 0) {
        throw "Installer exited with code $($installer.ExitCode)"
    }
    $executable = Find-DmmExecutable
    Write-DmmState
    Write-Event "installed" @{
        artifact = Split-Path $Artifact -Leaf
        sha256 = (Get-FileHash $Artifact -Algorithm SHA256).Hash.ToLowerInvariant()
    }

    $manager = Start-Dmm $executable
    Start-Sleep -Seconds 3
    Write-Event "manager-ready" @{ pid = $manager.Id }

    Run-Natural "normal"
    Run-Natural "crash"
    Run-Forced

    $fixture = Start-Process -FilePath $fixturePath -ArgumentList "hang 0" -WindowStyle Hidden -PassThru
    Write-Event "restart-start" @{ pid = $fixture.Id }
    Start-Sleep -Seconds 6
    Write-Event "restart-running-settled" @{ pid = $fixture.Id }
    Stop-Dmm
    $manager = Start-Dmm $executable
    Start-Sleep -Seconds 6
    Write-Event "restart-manager-settled" @{ managerPid = $manager.Id; fixturePid = $fixture.Id }
    Stop-Process -Id $fixture.Id -Force
    $fixture.WaitForExit()
    Write-Event "restart-exit" @{ pid = $fixture.Id; exitCode = $fixture.ExitCode }
    Start-Sleep -Seconds 6
    Write-Event "restart-exited-settled" @{ pid = $fixture.Id }
    Start-Sleep -Seconds 3

    [ordered]@{
        label = $Label
        completedUtc = [DateTime]::UtcNow.ToString("o")
    } | ConvertTo-Json | Set-Content $donePath -Encoding utf8
} catch {
    $_ | Out-String | Set-Content $errorPath -Encoding utf8
    Write-Event "error" @{ message = $_.Exception.Message }
    throw
} finally {
    Get-Process -Name "deadlock" -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Stop-Dmm
}
