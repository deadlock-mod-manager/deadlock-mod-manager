param(
    [Parameter(Mandatory = $true)]
    [string]$Artifact,
    [string]$OutputPath = ".\webview2-recovery.json",
    [string]$AppPath = "$env:LOCALAPPDATA\Deadlock Mod Manager\deadlock-mod-manager.exe"
)

$ErrorActionPreference = "Stop"
$webViewCommandLineMarker = "--webview-exe-name=deadlock-mod-manager.exe"
$results = [ordered]@{
    artifact = (Resolve-Path -LiteralPath $Artifact).Path
    artifactSha256 = (Get-FileHash -LiteralPath $Artifact -Algorithm SHA256).Hash.ToLowerInvariant()
    startedUtc = [DateTime]::UtcNow.ToString("o")
    scenarios = @()
}

function Write-Results {
    $resolvedOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
    $outputDirectory = Split-Path -Parent $resolvedOutputPath
    if (!(Test-Path -LiteralPath $outputDirectory)) {
        New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    }
    $json = $results | ConvertTo-Json -Depth 10
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($resolvedOutputPath, $json, $utf8WithoutBom)
}

function Stop-Manager {
    Get-Process -Name "deadlock-mod-manager" -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
}

function Get-Manager {
    Get-Process -Name "deadlock-mod-manager" -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 -and $_.Responding } |
        Select-Object -First 1
}

function Get-ManagerWebViewProcesses {
    @(Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match [regex]::Escape($webViewCommandLineMarker) })
}

function Get-WebViewProcessType([string]$CommandLine) {
    if ($CommandLine -match "--type=([^ ]+)") {
        return $Matches[1]
    }
    return "browser"
}

function Get-WebViewProcess([string]$Type) {
    Get-ManagerWebViewProcesses |
        Where-Object { (Get-WebViewProcessType $_.CommandLine) -eq $Type } |
        Select-Object -First 1
}

function Wait-Until([scriptblock]$Condition, [string]$FailureMessage, [int]$TimeoutSeconds = 30) {
    $watch = [Diagnostics.Stopwatch]::StartNew()
    while ($watch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        $value = & $Condition
        if ($null -ne $value -and $value -ne $false) {
            return [ordered]@{ value = $value; elapsedMs = $watch.Elapsed.TotalMilliseconds }
        }
        Start-Sleep -Milliseconds 100
    }
    throw $FailureMessage
}

function Start-ManagerReady {
    Start-Process -FilePath $AppPath -ArgumentList "--disable-auto-update" | Out-Null
    $ready = Wait-Until -FailureMessage "DMM did not expose a responsive window and renderer" -Condition {
        $manager = Get-Manager
        $renderer = Get-WebViewProcess "renderer"
        if ($null -ne $manager -and $null -ne $renderer) {
            return [ordered]@{ manager = $manager; renderer = $renderer }
        }
        return $null
    }
    return [ordered]@{
        manager = $ready.value.manager
        renderer = $ready.value.renderer
        readyMs = $ready.elapsedMs
    }
}

function Invoke-GpuRecovery {
    Stop-Manager
    $ready = Start-ManagerReady
    $gpu = Get-WebViewProcess "gpu-process"
    if ($null -eq $gpu) {
        throw "No DMM WebView2 GPU process was found"
    }
    $oldGpuPid = $gpu.ProcessId
    Stop-Process -Id $oldGpuPid -Force
    $replacement = Wait-Until -FailureMessage "WebView2 did not replace the failed GPU process" -Condition {
        $candidate = Get-WebViewProcess "gpu-process"
        if ($null -ne $candidate -and $candidate.ProcessId -ne $oldGpuPid) { return $candidate }
        return $null
    }
    $manager = Get-Manager
    if ($null -eq $manager -or $manager.Id -ne $ready.manager.Id) {
        throw "GPU recovery unexpectedly restarted the manager"
    }
    return [ordered]@{
        scenario = "gpu-process"
        action = "observe-warp-recovery"
        managerPid = $manager.Id
        failedPid = $oldGpuPid
        recoveredPid = $replacement.value.ProcessId
        recoveryMs = $replacement.elapsedMs
    }
}

function Invoke-RendererRecovery {
    Stop-Manager
    $ready = Start-ManagerReady
    $oldRendererPid = $ready.renderer.ProcessId
    Stop-Process -Id $oldRendererPid -Force
    $replacement = Wait-Until -FailureMessage "Native recovery did not replace the failed renderer" -Condition {
        $candidate = Get-WebViewProcess "renderer"
        if ($null -ne $candidate -and $candidate.ProcessId -ne $oldRendererPid) { return $candidate }
        return $null
    }
    $manager = Get-Manager
    if ($null -eq $manager -or $manager.Id -ne $ready.manager.Id) {
        throw "The first renderer failure should reload without restarting the manager"
    }
    return [ordered]@{
        scenario = "renderer"
        action = "native-reload"
        managerPid = $manager.Id
        failedPid = $oldRendererPid
        recoveredPid = $replacement.value.ProcessId
        recoveryMs = $replacement.elapsedMs
    }
}

function Invoke-BrowserRecovery {
    Stop-Manager
    $ready = Start-ManagerReady
    $browser = Get-WebViewProcess "browser"
    if ($null -eq $browser) {
        throw "No DMM WebView2 browser process was found"
    }
    $oldManagerPid = $ready.manager.Id
    $oldBrowserPid = $browser.ProcessId
    Stop-Process -Id $oldBrowserPid -Force
    $replacement = Wait-Until -FailureMessage "Browser failure did not trigger a controlled manager restart" -Condition {
        $manager = Get-Manager
        $renderer = Get-WebViewProcess "renderer"
        if ($null -ne $manager -and $manager.Id -ne $oldManagerPid -and $null -ne $renderer) {
            return [ordered]@{ manager = $manager; renderer = $renderer }
        }
        return $null
    }
    return [ordered]@{
        scenario = "browser"
        action = "controlled-app-restart"
        failedManagerPid = $oldManagerPid
        recoveredManagerPid = $replacement.value.manager.Id
        failedPid = $oldBrowserPid
        recoveredRendererPid = $replacement.value.renderer.ProcessId
        recoveryMs = $replacement.elapsedMs
    }
}

try {
    Stop-Manager
    $installer = Start-Process -FilePath $Artifact -ArgumentList "/S" -PassThru -Wait
    if ($installer.ExitCode -ne 0) {
        throw "Installer exited with code $($installer.ExitCode)"
    }
    if (!(Test-Path -LiteralPath $AppPath)) {
        throw "Installed manager executable was not found at $AppPath"
    }

    $results.scenarios += Invoke-GpuRecovery
    $results.scenarios += Invoke-RendererRecovery
    $results.scenarios += Invoke-BrowserRecovery
    $results.completedUtc = [DateTime]::UtcNow.ToString("o")
    $results.passed = $true
} catch {
    $results.completedUtc = [DateTime]::UtcNow.ToString("o")
    $results.passed = $false
    $results.error = $_ | Out-String
    throw
} finally {
    Write-Results
    Stop-Manager
}

