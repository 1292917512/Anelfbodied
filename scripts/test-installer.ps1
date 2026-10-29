param([string]$Installer, [string]$BaselineInstaller = $env:ANELFBODIED_BASELINE_INSTALLER, [switch]$Isolated)
$ErrorActionPreference = 'Stop'
$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$package = Get-Content -LiteralPath (Join-Path $workspace 'package.json') -Raw | ConvertFrom-Json
$productName = $package.productName
if (@(Get-Process -Name $productName -ErrorAction SilentlyContinue).Count) { throw 'Close running copies of the application before installer tests.' }
$installationName = $productName
if ($Isolated) {
    if ($Installer -or $BaselineInstaller) { throw 'Isolated tests build their own installer and cannot use a published baseline.' }
    $installationName = "$productName Verification"
    $output = Join-Path $workspace '.build\installer-verification'
    & pnpm exec electron-builder --win nsis --x64 --publish never --prepackaged (Join-Path $workspace '.build\package\win-unpacked') "--config.directories.output=$output" "--config.appId=$($package.build.appId).verification" "--config.nsis.shortcutName=$installationName" "--config.nsis.uninstallDisplayName=$installationName"
    if ($LASTEXITCODE -ne 0) { throw 'Could not build isolated installer.' }
    $Installer = Join-Path $output "$productName-Setup-$($package.version)-x64.exe"
}
$executableName = "$productName.exe"
$uninstallerName = "Uninstall $productName.exe"
if (-not $Installer) {
    $Installer = (Get-ChildItem -LiteralPath (Join-Path $workspace 'release') -Filter "$productName-Setup-*-x64.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}
if (-not $Installer -or -not (Test-Path -LiteralPath $Installer)) { throw 'Build the installer first.' }
$Installer = (Resolve-Path -LiteralPath $Installer).Path
$registryRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$installerCache = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) "$($package.name)-updater\installer.exe"
function Get-Installation {
    @(foreach ($registryPath in @($registryRoot, $registryRoot.Replace('HKCU:', 'HKLM:'))) {
        if (Test-Path -LiteralPath $registryPath) {
            Get-ChildItem -LiteralPath $registryPath | Get-ItemProperty | Where-Object { $_.DisplayName -in @($installationName, 'Embodied') }
        }
    })
}
if (@(Get-Installation).Count) { throw 'An installation already exists. Use a clean account for installer tests.' }
if (Test-Path -LiteralPath $installerCache) { throw 'An existing installer cache must not be overwritten by tests.' }
$testRoot = [System.IO.Path]::GetFullPath((Join-Path $workspace ('.local\installer-smoke\' + [guid]::NewGuid().ToString('N'))))
if (-not $testRoot.StartsWith((Join-Path $workspace '.local\installer-smoke\'), [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid test path.' }
$destination = Join-Path $testRoot "with spaces\$productName"
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$shortcuts = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) "$installationName.lnk"),
    (Join-Path ([Environment]::GetFolderPath('Programs')) "$installationName.lnk")
)
foreach ($shortcut in $shortcuts) { if (Test-Path -LiteralPath $shortcut) { throw "Existing shortcut: $shortcut" } }
function Run-Setup([string]$Path, [string]$Arguments, [int]$ExpectedExit = 0) {
    $process = Start-Process -FilePath $Path -ArgumentList $Arguments -PassThru -WindowStyle Hidden -Wait
    if ($process.ExitCode -ne $ExpectedExit) { throw "Installer exit $($process.ExitCode), expected $ExpectedExit" }
}
function Run-Uninstall([string]$Arguments = '/S /currentuser', [int]$ExpectedExit = 0) {
    $copy = Join-Path $testRoot 'uninstaller.exe'
    Copy-Item -LiteralPath (Join-Path $destination $uninstallerName) -Destination $copy -Force
    Run-Setup $copy "$Arguments _?=$destination" $ExpectedExit
}
function Assert-Exists([string]$Path) { if (-not (Test-Path -LiteralPath $Path)) { throw "Missing: $Path" } }
function File-Digest([string]$Path) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { [Convert]::ToBase64String($sha.ComputeHash([System.IO.File]::ReadAllBytes($Path))) }
    finally { $sha.Dispose() }
}
function Assert-Uninstalled([bool]$KeepData = $false) {
    foreach ($path in @((Join-Path $destination $executableName), (Join-Path $destination $uninstallerName), (Join-Path $destination 'installation.ini')) + $shortcuts) {
        if (Test-Path -LiteralPath $path) { throw "Uninstall residue: $path" }
    }
    if ((Test-Path -LiteralPath (Join-Path $destination 'data')) -ne $KeepData) { throw 'Unexpected data retention after uninstall.' }
    if (@(Get-Installation).Count) { throw 'Uninstall registry entry remains.' }
    if (Test-Path -LiteralPath $installerCache) { throw 'Installer cache remains outside installation directory.' }
}
Write-Output "Installing into isolated directory: $destination"
$firstInstaller = if ($BaselineInstaller) { (Resolve-Path -LiteralPath $BaselineInstaller).Path } else { $Installer }
Run-Setup $firstInstaller "/S /currentuser /D=$destination"
if (Test-Path -LiteralPath $installerCache) { throw 'Installer cache was not cleared.' }
$installed = @(Get-Installation)
if ($installed.Count -ne 1 -or $installed[0].DisplayName -ne $installationName) { throw 'Incorrect installed product name.' }
$requiredFiles = @(
    $executableName,
    $uninstallerName,
    'docs\skins.md',
    'docs\frontends.md',
    'skills\anelfbodied-control\SKILL.md',
    'skills\anelfbodied-control\references\access\mcp.md',
    'skills\anelfbodied-control\references\control\execution.md',
    'data\skins\example-anelf\manifest.json',
    'data\skins\example-anelf\idle.png',
    'data\skins\example-anelf\LICENSE.txt'
)
foreach ($relative in $requiredFiles) {
    Assert-Exists (Join-Path $destination $relative)
}
foreach ($shortcut in $shortcuts) { Assert-Exists $shortcut }
if (Test-Path -LiteralPath (Join-Path $destination 'examples')) { throw 'Skin examples must only exist inside data/skins.' }
& node (Join-Path $PSScriptRoot 'check-installed.mjs') (Join-Path $destination $executableName)
if ($LASTEXITCODE -ne 0) { throw 'Installed runtime verification failed.' }
$sentinel = Join-Path $destination 'data\upgrade-sentinel.txt'
$token = Join-Path $destination 'data\control-token'
$tokenHash = File-Digest $token
$exampleFile = Join-Path $destination 'data\skins\example-anelf\manifest.json'
$example = Get-Content -LiteralPath $exampleFile -Raw | ConvertFrom-Json
$example.name = 'Edited example'
[System.IO.File]::WriteAllText($exampleFile, ($example | ConvertTo-Json -Depth 8), [System.Text.UTF8Encoding]::new($false))
$exampleHash = File-Digest $exampleFile
$settingsFile = Join-Path $destination 'data\settings.json'
$settingsHash = File-Digest $settingsFile
$appearanceFile = Join-Path $destination 'data\appearance.json'
$appearanceHash = File-Digest $appearanceFile
function Assert-Preserved {
    Assert-Exists $sentinel
    if ((File-Digest $token) -ne $tokenHash) { throw 'Control credentials changed.' }
    if ((File-Digest $settingsFile) -ne $settingsHash) { throw 'Saved settings changed.' }
    if ((File-Digest $appearanceFile) -ne $appearanceHash) { throw 'Appearance preferences changed.' }
    if ((File-Digest $exampleFile) -ne $exampleHash) { throw 'Edited skin example changed.' }
}
Write-Output 'Checking upgrade preserves application data.'
Run-Setup $Installer "/S /currentuser /D=$destination"
Assert-Preserved
Write-Output 'Checking the application upgrade launcher and restart.'
$updates = Join-Path $destination 'data\updates'
New-Item -ItemType Directory -Path $updates -Force | Out-Null
$cachedInstaller = Join-Path $updates 'installer.exe'
Copy-Item -LiteralPath $Installer -Destination $cachedInstaller
& node (Join-Path $PSScriptRoot 'check-update-launch.mjs') $cachedInstaller $destination
if ($LASTEXITCODE -ne 0) { throw 'Upgrade launcher failed.' }
$restarted = $null
for ($attempt = 0; $attempt -lt 120; $attempt++) {
    $restarted = @(Get-Process -Name $productName -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq (Join-Path $destination $executableName) })
    if ($restarted.Count) { break }
    Start-Sleep -Milliseconds 500
}
if (-not $restarted.Count) { throw 'Upgraded application did not restart.' }
Start-Sleep -Seconds 2
$restarted | Stop-Process -Force
Start-Sleep -Seconds 1
Assert-Preserved
Write-Output 'Checking locked files abort uninstall before removing application files.'
$lockedFile = [System.IO.File]::Open((Join-Path $destination 'resources\app.asar'), 'Open', 'Read', 'Read')
try {
    Run-Uninstall '/S /currentuser' 2
    foreach ($relative in $requiredFiles) { Assert-Exists (Join-Path $destination $relative) }
    if (@(Get-Installation).Count -ne 1) { throw 'Failed uninstall removed registration.' }
    Assert-Preserved
} finally { $lockedFile.Dispose() }
Write-Output 'Checking locked user data aborts explicit deletion before removing the application.'
$lockedData = [System.IO.File]::Open($sentinel, 'Open', 'Read', 'Read')
try {
    Run-Uninstall '/S /currentuser /DELETEUSERDATA' 2
    foreach ($relative in $requiredFiles) { Assert-Exists (Join-Path $destination $relative) }
    if (@(Get-Installation).Count -ne 1) { throw 'Failed data cleanup removed registration.' }
    Assert-Preserved
} finally { $lockedData.Dispose() }
Write-Output 'Checking uninstall preserves user data by default.'
Run-Uninstall
Assert-Uninstalled $true
Assert-Preserved
$remaining = @(Get-ChildItem -LiteralPath $destination)
if ($remaining.Count -ne 1 -or $remaining[0].Name -ne 'data') { throw 'Program files remain after uninstall.' }
Write-Output 'Checking reinstall restores the retained data.'
Run-Setup $Installer "/S /currentuser /D=$destination"
Assert-Preserved
& node (Join-Path $PSScriptRoot 'check-installed.mjs') (Join-Path $destination $executableName)
if ($LASTEXITCODE -ne 0) { throw 'Reinstalled runtime verification failed.' }
Assert-Preserved
$outside = Join-Path $testRoot 'outside'
New-Item -ItemType Directory -Path $outside | Out-Null
Set-Content -LiteralPath (Join-Path $outside 'keep.txt') -Value 'outside installation'
New-Item -ItemType Junction -Path (Join-Path $destination 'data\external-link') -Target $outside | Out-Null
Write-Output 'Checking full uninstall and junction boundaries.'
Run-Uninstall '/S /currentuser /DELETEUSERDATA'
Assert-Uninstalled
Assert-Exists (Join-Path $outside 'keep.txt')
if (Test-Path -LiteralPath $destination) { throw "Installation folder remains: $destination" }
Write-Output 'Checking unrelated files in the installation folder are not removed.'
Run-Setup $Installer "/S /currentuser /D=$destination"
$unrelated = Join-Path $destination 'user-owned.txt'
Set-Content -LiteralPath $unrelated -Value 'not application data'
Run-Uninstall '/S /currentuser /DELETEUSERDATA'
Assert-Uninstalled
Assert-Exists $unrelated
$remaining = @(Get-ChildItem -LiteralPath $destination)
if ($remaining.Count -ne 1 -or $remaining[0].Name -ne 'user-owned.txt') { throw 'Application files remain.' }
Write-Output 'Installer, upgrade, data retention, reinstall and explicit data deletion passed.'
