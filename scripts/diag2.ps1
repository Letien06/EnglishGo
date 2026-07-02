$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot '..\src\main\resources\templates\listen\index.html'
$target = (Resolve-Path $target).Path
$marker = '<span class="listen-pill">Dữ liệu Đậu TOEIC API</span>'
$markerBytes = [System.Text.Encoding]::UTF8.GetBytes($marker)
Write-Host ('Marker bytes hex: ' + ([BitConverter]::ToString($markerBytes)))
$fileBytes = [System.IO.File]::ReadAllBytes($target)
Write-Host ('File size: ' + $fileBytes.Length)
# Find
for ($i = 0; $i -le $fileBytes.Length - $markerBytes.Length; $i++)
{
    $ok = $true
    for ($j = 0; $j -lt $markerBytes.Length; $j++)
    {
        if ($fileBytes[$i + $j] -ne $markerBytes[$j]) { $ok = $false; break }
    }
    if ($ok) { Write-Host ('FOUND at offset ' + $i); break }
}
Write-Host 'done'
