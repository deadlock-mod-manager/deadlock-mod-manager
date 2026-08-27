param(
    [Parameter(Mandatory = $true)]
    [string]$Artifact,
    [Parameter(Mandatory = $true)]
    [string]$Label,
    [string]$OutputRoot = "\\tsclient\DMM",
    [int]$Iterations = 20
)

$ErrorActionPreference = "Stop"
$resultRoot = Join-Path $OutputRoot $Label
$appPath = "$env:LOCALAPPDATA\Deadlock Mod Manager\deadlock-mod-manager.exe"
$runtimeClientKey = "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
$missingRuntimePath = "C:\DMM-Intentionally-Missing-WebView2"
New-Item -ItemType Directory -Path $resultRoot -Force | Out-Null

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class DmmWebViewNative
{
    [StructLayout(LayoutKind.Sequential)]
    public struct Rect { public int Left; public int Top; public int Right; public int Bottom; }

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr window, out Rect rect);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr window);
}
"@

function Write-Json([string]$Path, [object]$Value) {
    $json = $Value | ConvertTo-Json -Depth 10
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $json, $utf8WithoutBom)
}

function Stop-Dmm {
    Get-Process -Name "deadlock-mod-manager" -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
}

function Get-DmmWebViewProcesses {
    @(Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -match "--webview-exe-name=deadlock-mod-manager.exe"
    })
}

function Get-WebViewProcessType([string]$CommandLine) {
    if ($CommandLine -match "--type=([^ ]+)") {
        return $Matches[1]
    }
    return "browser"
}

function Get-DmmRenderer {
    Get-DmmWebViewProcesses | Where-Object {
        (Get-WebViewProcessType $_.CommandLine) -eq "renderer"
    } | Select-Object -First 1
}

function Wait-DmmReady([Diagnostics.Stopwatch]$Stopwatch) {
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ([DateTime]::UtcNow -lt $deadline) {
        $manager = Get-Process -Name "deadlock-mod-manager" -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowHandle -ne 0 -and $_.Responding } |
            Select-Object -First 1
        $renderer = Get-DmmRenderer
        if ($null -ne $manager -and $null -ne $renderer) {
            return [ordered]@{
                manager = $manager
                renderer = $renderer
                readyMs = $Stopwatch.Elapsed.TotalMilliseconds
            }
        }
        Start-Sleep -Milliseconds 50
    }
    throw "DMM did not expose a responsive window and renderer within 30 seconds"
}

function Start-DmmReady {
    $watch = [Diagnostics.Stopwatch]::StartNew()
    Start-Process -FilePath $appPath -ArgumentList "--disable-auto-update" | Out-Null
    $ready = Wait-DmmReady $watch
    Start-Sleep -Seconds 2
    return $ready
}

function Save-DesktopScreenshot([string]$Name) {
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
        $bitmap.Save((Join-Path $resultRoot "$Name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

function Measure-DmmWindow([System.Diagnostics.Process]$Manager, [string]$ScreenshotName = "") {
    $rect = New-Object DmmWebViewNative+Rect
    if (![DmmWebViewNative]::GetWindowRect($Manager.MainWindowHandle, [ref]$rect)) {
        throw "GetWindowRect failed for process $($Manager.Id)"
    }
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    $bitmap = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
        if ($ScreenshotName) {
            $bitmap.Save(
                (Join-Path $resultRoot "$ScreenshotName.png"),
                [System.Drawing.Imaging.ImageFormat]::Png
            )
        }

        [double]$sum = 0
        [double]$sumSquares = 0
        $nearBlack = 0
        $nearWhite = 0
        $count = 0
        for ($x = 0; $x -lt $width; $x += 8) {
            for ($y = 0; $y -lt $height; $y += 8) {
                $pixel = $bitmap.GetPixel($x, $y)
                $luma = ($pixel.R + $pixel.G + $pixel.B) / 3.0
                $sum += $luma
                $sumSquares += $luma * $luma
                if ($luma -le 8) { $nearBlack++ }
                if ($luma -ge 247) { $nearWhite++ }
                $count++
            }
        }
        $mean = $sum / $count
        $variance = [Math]::Max(0, ($sumSquares / $count) - ($mean * $mean))
        return [ordered]@{
            width = $width
            height = $height
            sampledPixels = $count
            meanLuma = $mean
            lumaStdDev = [Math]::Sqrt($variance)
            nearBlackFraction = $nearBlack / [double]$count
            nearWhiteFraction = $nearWhite / [double]$count
        }
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

function Save-DmmState([string]$Name, [System.Diagnostics.Process]$Manager) {
    $freshManager = Get-Process -Id $Manager.Id -ErrorAction SilentlyContinue
    $webview = Get-DmmWebViewProcesses
    $state = [ordered]@{
        capturedUtc = [DateTime]::UtcNow.ToString("o")
        manager = if ($null -eq $freshManager) { $null } else { [ordered]@{
            id = $freshManager.Id
            responding = $freshManager.Responding
            mainWindowHandle = $freshManager.MainWindowHandle
            workingSet64 = $freshManager.WorkingSet64
        }}
        webview = @($webview | ForEach-Object {
            [ordered]@{
                id = $_.ProcessId
                parentId = $_.ParentProcessId
                type = Get-WebViewProcessType $_.CommandLine
                commandLine = $_.CommandLine
            }
        })
    }
    Write-Json (Join-Path $resultRoot "$Name.json") $state
    if ($null -ne $freshManager) {
        Measure-DmmWindow $freshManager $Name | Out-Null
    } else {
        Save-DesktopScreenshot $Name
    }
}

function Kill-DmmWebViewProcess([string]$Type) {
    $process = Get-DmmWebViewProcesses | Where-Object {
        (Get-WebViewProcessType $_.CommandLine) -eq $Type
    } | Select-Object -First 1
    if ($null -eq $process) {
        throw "No DMM WebView2 $Type process was found"
    }
    Stop-Process -Id $process.ProcessId -Force
    return $process.ProcessId
}

function Send-Refresh([System.Diagnostics.Process]$Manager) {
    [DmmWebViewNative]::SetForegroundWindow($Manager.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait("^r")
}

function Run-FaultScenario([string]$Type) {
    Stop-Dmm
    $ready = Start-DmmReady
    Save-DmmState "$Type-00-baseline" $ready.manager
    $killedPid = Kill-DmmWebViewProcess $Type
    Start-Sleep -Milliseconds 300
    Save-DmmState "$Type-01-immediate" $ready.manager
    Start-Sleep -Seconds 6
    Save-DmmState "$Type-02-settled" $ready.manager

    if ($Type -eq "renderer" -or $Type -eq "browser") {
        Send-Refresh $ready.manager
        Start-Sleep -Seconds 6
        Save-DmmState "$Type-03-after-refresh" $ready.manager
    }
    if ($Type -eq "browser") {
        Stop-Dmm
        $restarted = Start-DmmReady
        Save-DmmState "$Type-04-after-manager-restart" $restarted.manager
    }
    Stop-Dmm
    return [ordered]@{ type = $Type; killedPid = $killedPid }
}

function Get-EnvironmentInventory {
    $client = Get-ItemProperty $runtimeClientKey -ErrorAction SilentlyContinue
    $runtimeFiles = @(Get-Item "${env:ProgramFiles(x86)}\Microsoft\EdgeWebView\Application\*\msedgewebview2.exe" -ErrorAction SilentlyContinue | ForEach-Object {
        [ordered]@{
            path = $_.FullName
            version = $_.VersionInfo.ProductVersion
            sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    })
    return [ordered]@{
        capturedUtc = [DateTime]::UtcNow.ToString("o")
        os = Get-CimInstance Win32_OperatingSystem |
            Select-Object Caption, Version, BuildNumber, OSArchitecture
        computer = Get-CimInstance Win32_ComputerSystem |
            Select-Object Manufacturer, Model, TotalPhysicalMemory, NumberOfLogicalProcessors
        gpu = @(Get-CimInstance Win32_VideoController |
            Select-Object Name, DriverVersion, DriverDate, AdapterRAM, Status)
        webview2 = [ordered]@{
            registryPresent = $null -ne $client
            registryVersion = if ($null -eq $client) { $null } else { $client.pv }
            registryLocation = if ($null -eq $client) { $null } else { $client.location }
            runtimeFiles = $runtimeFiles
        }
    }
}

try {
    Stop-Dmm
    $installerWatch = [Diagnostics.Stopwatch]::StartNew()
    $installer = Start-Process -FilePath $Artifact -ArgumentList "/S" -PassThru -Wait
    $installerWatch.Stop()
    if ($installer.ExitCode -ne 0) {
        throw "Installer exited with code $($installer.ExitCode)"
    }
    Write-Json (Join-Path $resultRoot "environment.json") (Get-EnvironmentInventory)

    $startupRuns = for ($iteration = 1; $iteration -le $Iterations; $iteration++) {
        $watch = [Diagnostics.Stopwatch]::StartNew()
        Start-Process -FilePath $appPath -ArgumentList "--disable-auto-update" | Out-Null
        $ready = Wait-DmmReady $watch
        Start-Sleep -Seconds 2
        $screenshotName = if ($iteration -eq 1 -or $iteration -eq $Iterations) {
            "startup-{0:d2}" -f $iteration
        } else {
            ""
        }
        $pixels = Measure-DmmWindow $ready.manager $screenshotName
        [ordered]@{
            iteration = $iteration
            readyMs = $ready.readyMs
            managerPid = $ready.manager.Id
            rendererPid = $ready.renderer.ProcessId
            responding = $ready.manager.Responding
            pixels = $pixels
        }
        Stop-Dmm
    }

    $faults = @(
        Run-FaultScenario "gpu-process"
        Run-FaultScenario "renderer"
        Run-FaultScenario "browser"
    )

    Stop-Dmm
    $env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER = $missingRuntimePath
    $missingRuntime = Start-Process -FilePath $appPath -ArgumentList "--disable-auto-update" -PassThru
    Remove-Item Env:\WEBVIEW2_BROWSER_EXECUTABLE_FOLDER -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 8
    $missingRuntimeState = [ordered]@{
        launchedPid = $missingRuntime.Id
        exited = $missingRuntime.HasExited
        dmmWebviewProcessCount = (Get-DmmWebViewProcesses).Count
    }
    Write-Json (Join-Path $resultRoot "missing-runtime.json") $missingRuntimeState
    Save-DesktopScreenshot "missing-runtime"
    Stop-Dmm

    $normalRuntime = Start-DmmReady
    Save-DmmState "normal-runtime" $normalRuntime.manager
    Stop-Dmm

    Write-Json (Join-Path $resultRoot "results.json") ([ordered]@{
        label = $Label
        artifact = Split-Path $Artifact -Leaf
        sha256 = (Get-FileHash $Artifact -Algorithm SHA256).Hash.ToLowerInvariant()
        installerMs = $installerWatch.Elapsed.TotalMilliseconds
        completedUtc = [DateTime]::UtcNow.ToString("o")
        startupRuns = @($startupRuns)
        faults = $faults
        missingRuntime = $missingRuntimeState
    })
    "complete" | Set-Content (Join-Path $resultRoot "done.txt")
} catch {
    $_ | Out-String | Set-Content (Join-Path $resultRoot "error.txt") -Encoding utf8
    throw
} finally {
    Remove-Item Env:\WEBVIEW2_BROWSER_EXECUTABLE_FOLDER -ErrorAction SilentlyContinue
    Stop-Dmm
}
