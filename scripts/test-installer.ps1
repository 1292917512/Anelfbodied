param([string]$Installer)
$ErrorActionPreference = 'Stop'
$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$package = Get-Content -LiteralPath (Join-Path $workspace 'package.json') -Raw | ConvertFrom-Json
$productName = $package.productName
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
    if (-not (Test-Path -LiteralPath $registryRoot)) { return @() }
    @(Get-ChildItem -LiteralPath $registryRoot | Get-ItemProperty | Where-Object { $_.DisplayName -in @($productName, 'Embodied') })
}
if ((Get-Installation).Count) { throw 'An installation already exists. Use a clean account for installer tests.' }
$testRoot = [System.IO.Path]::GetFullPath((Join-Path $workspace ('.local\installer-smoke\' + [guid]::NewGuid().ToString('N'))))
if (-not $testRoot.StartsWith((Join-Path $workspace '.local\installer-smoke\'), [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid test path.' }
$destination = Join-Path $testRoot "with spaces\$productName"
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$shortcuts = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) "$productName.lnk"),
    (Join-Path ([Environment]::GetFolderPath('Programs')) "$productName.lnk")
)
foreach ($shortcut in $shortcuts) { if (Test-Path -LiteralPath $shortcut) { throw "Existing shortcut: $shortcut" } }
function Run-Setup([string]$Path, [string]$Arguments) {
    $process = Start-Process -FilePath $Path -ArgumentList $Arguments -PassThru -WindowStyle Hidden -Wait
    if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
}
function Assert-Exists([string]$Path) { if (-not (Test-Path -LiteralPath $Path)) { throw "Missing: $Path" } }
function File-Digest([string]$Path) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { [Convert]::ToBase64String($sha.ComputeHash([System.IO.File]::ReadAllBytes($Path))) }
    finally { $sha.Dispose() }
}
function Assert-Clean {
    foreach ($path in @((Join-Path $destination 'data'), (Join-Path $destination $executableName)) + $shortcuts) {
        if (Test-Path -LiteralPath $path) { throw "Uninstall residue: $path" }
    }
    if ((Get-Installation).Count) { throw 'Uninstall registry entry remains.' }
    if (Test-Path -LiteralPath $installerCache) { throw 'Installer cache remains outside installation directory.' }
}
Write-Output "Installing into isolated directory: $destination"
Run-Setup $Installer "/S /currentuser /D=$destination"
if (Test-Path -LiteralPath $installerCache) { throw 'Installer cache was not cleared.' }
$installed = @(Get-Installation)
if ($installed.Count -ne 1 -or $installed[0].DisplayName -ne $productName) { throw 'Incorrect installed product name.' }
foreach ($relative in @($executableName, $uninstallerName, 'docs\skins.md', 'docs\frontends.md', 'examples\skins\example-anelf\manifest.json')) {
    Assert-Exists (Join-Path $destination $relative)
}
foreach ($shortcut in $shortcuts) { Assert-Exists $shortcut }
& node (Join-Path $PSScriptRoot 'check-installed.mjs') (Join-Path $destination $executableName)
if ($LASTEXITCODE -ne 0) { throw 'Installed runtime verification failed.' }
$sentinel = Join-Path $destination 'data\upgrade-sentinel.txt'
$token = Join-Path $destination 'data\control-token'
$tokenHash = File-Digest $token
Write-Output 'Checking upgrade preserves application data.'
Run-Setup $Installer "/S /currentuser /D=$destination"
Assert-Exists $sentinel
if ((File-Digest $token) -ne $tokenHash) { throw 'Upgrade changed control credentials.' }
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
Assert-Exists $sentinel
if ((File-Digest $token) -ne $tokenHash) { throw 'Application upgrade changed control credentials.' }
$outside = Join-Path $testRoot 'outside'
New-Item -ItemType Directory -Path $outside | Out-Null
Set-Content -LiteralPath (Join-Path $outside 'keep.txt') -Value 'outside installation'
New-Item -ItemType Junction -Path (Join-Path $destination 'data\external-link') -Target $outside | Out-Null
Write-Output 'Checking full uninstall and junction boundaries.'
Run-Setup (Join-Path $destination $uninstallerName) '/S /currentuser'
Assert-Clean
Assert-Exists (Join-Path $outside 'keep.txt')
if (Test-Path -LiteralPath $destination) { throw "Installation folder remains: $destination" }
Write-Output 'Checking unrelated files in the installation folder are not removed.'
Run-Setup $Installer "/S /currentuser /D=$destination"
$unrelated = Join-Path $destination 'user-owned.txt'
Set-Content -LiteralPath $unrelated -Value 'not application data'
Run-Setup (Join-Path $destination $uninstallerName) '/S /currentuser'
Assert-Clean
Assert-Exists $unrelated
$remaining = @(Get-ChildItem -LiteralPath $destination)
if ($remaining.Count -ne 1 -or $remaining[0].Name -ne 'user-owned.txt') { throw 'Application files remain.' }
Write-Output 'Installer, upgrade, runtime storage and complete uninstall passed.'
