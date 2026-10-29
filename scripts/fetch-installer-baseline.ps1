$ErrorActionPreference = 'Stop'
$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$package = Get-Content -LiteralPath (Join-Path $workspace 'package.json') -Raw | ConvertFrom-Json
$repository = $package.repository.url -replace '^https://github.com/', '' -replace '\.git$', ''
$headers = @{ Accept = 'application/vnd.github+json'; 'User-Agent' = 'AnelfBodied-installer-test' }
if ($env:GITHUB_TOKEN) { $headers.Authorization = "Bearer $env:GITHUB_TOKEN" }
try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repository/releases/latest" -Headers $headers -TimeoutSec 30
} catch {
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Output 'No published baseline; testing a fresh installation.'
        exit 0
    }
    throw
}
$version = $release.tag_name -replace '^v', ''
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid baseline version.' }
$name = "$($package.productName)-Setup-$version-x64.exe"
$asset = @($release.assets | Where-Object { $_.name -eq $name })
if ($asset.Count -ne 1 -or $asset[0].digest -notmatch '^sha256:[a-fA-F0-9]{64}$') { throw 'Missing baseline installer or SHA-256.' }
$asset = $asset[0]
$expectedUrl = "https://github.com/$repository/releases/download/$($release.tag_name)/$name"
if ($asset.browser_download_url -ne $expectedUrl) { throw 'Unexpected baseline download URL.' }
$directory = Join-Path $workspace '.build\installer-baseline'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$path = Join-Path $directory $name
function Test-Asset {
    if (-not (Test-Path -LiteralPath $path) -or (Get-Item -LiteralPath $path).Length -ne $asset.size) { return $false }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($path)
    try {
        $digest = [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '')
        return $digest -eq ($asset.digest -replace '^sha256:', '')
    } finally { $stream.Dispose(); $sha.Dispose() }
}
if (-not (Test-Asset)) {
    Write-Output "Downloading published installer baseline: $name"
    Invoke-WebRequest -Uri $expectedUrl -OutFile $path -TimeoutSec 180 -UseBasicParsing
    if (-not (Test-Asset)) { throw 'Baseline installer verification failed.' }
}
if ($env:GITHUB_ENV) { "ANELFBODIED_BASELINE_INSTALLER=$path" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append }
Write-Output "Verified baseline: $path"
