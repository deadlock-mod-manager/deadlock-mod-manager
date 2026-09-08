$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'Package installation is restricted to a disposable GitHub-hosted runner'
}
$installerFiles = @(Get-ChildItem -LiteralPath 'apps/desktop/target/release/bundle/nsis' -Filter '*-setup.exe' -File)
if ($installerFiles.Count -ne 1) { throw 'Expected exactly one freshly built NSIS installer' }
$installRoot = Join-Path $env:RUNNER_TEMP ('dmm-e2e-installed-' + [guid]::NewGuid().ToString('N'))
$installedBinary = Join-Path $installRoot 'deadlock-mod-manager.exe'
function Invoke-Installer([string]$Executable, [string[]]$InstallerArguments) {
    $installerProcess = Start-Process -FilePath $Executable -ArgumentList $InstallerArguments -WindowStyle Hidden -PassThru
    if (!$installerProcess.WaitForExit(60000)) {
        $installerProcess.Kill($true)
        throw 'Installer exceeded its deadline'
    }
    if ($installerProcess.ExitCode -ne 0) { throw "Installer failed with exit code $($installerProcess.ExitCode)" }
}
try {
    # NSIS requires /D as the last argument; it consumes the remaining path.
    Invoke-Installer $installerFiles[0].FullName @('/S', "/D=$installRoot")
    if (!(Test-Path -LiteralPath $installedBinary)) { throw 'Installed application is missing' }
    $sourceHash = (Get-FileHash -LiteralPath 'apps/desktop/target/release/deadlock-mod-manager.exe').Hash
    if ((Get-FileHash -LiteralPath $installedBinary).Hash -ne $sourceHash) { throw 'Installed executable differs from the built release' }
    pnpm --filter @deadlock-mods/desktop e2e:doctor -- --binary $installedBinary --case local-mod-lifecycle
    if ($LASTEXITCODE) { throw 'Installed application prerequisites failed' }
    foreach ($scenario in @('about-smoke', 'local-mod-lifecycle')) {
        pnpm --filter @deadlock-mods/desktop e2e:test -- --case $scenario --binary $installedBinary --keep --allow-native-input --report "../../.e2e/reports/installed-$scenario.json"
        if ($LASTEXITCODE) { throw "Installed scenario failed: $scenario" }
    }
} finally {
    $uninstaller = Join-Path $installRoot 'uninstall.exe'
    if (Test-Path -LiteralPath $uninstaller) { Invoke-Installer $uninstaller @('/S') }
}
