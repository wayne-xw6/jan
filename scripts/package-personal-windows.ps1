param([string]$Version = '0.8.5', [string]$OutputDirectory = 'dist-personal')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$release = Join-Path $projectRoot 'src-tauri/target/release'
$output = [IO.Path]::GetFullPath((Join-Path $projectRoot $OutputDirectory))
if (-not $output.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Output must be inside this project.'
}
$portable = Join-Path $output "Isle-$Version-portable"
if (Test-Path -LiteralPath $portable) { throw "Output already exists: $portable. Choose a new output directory." }
$binary = Join-Path $release 'Isle.exe'
$resources = Join-Path $projectRoot 'src-tauri/resources'
foreach ($required in @($binary, (Join-Path $resources 'bin/jan-llama-worker.exe'))) {
    if (-not (Test-Path -LiteralPath $required) -or (Get-Item -LiteralPath $required).Length -lt 1024) { throw "Missing or stub build output: $required" }
}
$installers = @(Get-ChildItem -LiteralPath (Join-Path $release 'bundle/nsis') -Filter '*.exe')
if ($installers.Count -eq 0) { throw 'NSIS installer is missing.' }
New-Item -ItemType Directory -Path $portable -Force | Out-Null
Copy-Item -LiteralPath $binary -Destination $portable
Copy-Item -LiteralPath $resources -Destination (Join-Path $portable 'resources') -Recurse
# externalBin sidecars are installed alongside the app, without target suffix.
foreach ($sidecar in @('bun', 'uv')) {
    $source = Join-Path $resources "bin/$sidecar-x86_64-pc-windows-msvc.exe"
    if (-not (Test-Path -LiteralPath $source) -or (Get-Item -LiteralPath $source).Length -lt 1024) { throw "Missing or stub sidecar: $source" }
    Copy-Item -LiteralPath $source -Destination (Join-Path $portable "$sidecar.exe")
}
Set-Content -LiteralPath (Join-Path $portable 'portable.flag') -Value 'Isle portable profile v1'
Copy-Item -LiteralPath (Join-Path $projectRoot 'LICENSE') -Destination $portable
Copy-Item -LiteralPath (Join-Path $projectRoot 'PERSONAL-README.md') -Destination (Join-Path $portable 'README.md')
foreach ($installer in $installers) { Copy-Item -LiteralPath $installer.FullName -Destination $output }
Compress-Archive -LiteralPath $portable -DestinationPath "$portable.zip"
Get-ChildItem -LiteralPath $output -File | Get-FileHash -Algorithm SHA256 |
    ForEach-Object { "$($_.Hash)  $([IO.Path]::GetFileName($_.Path))" } |
    Set-Content -LiteralPath (Join-Path $output 'SHA256SUMS.txt')
Write-Output "Packaged installer and portable ZIP in $output"
