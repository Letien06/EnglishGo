# Diagnostic — print exact bytes of the pill, Xem JSON, and subtitle substrings.
$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot '..\src\main\resources\templates\listen\index.html'
$target = (Resolve-Path $target).Path
$bytes = [System.IO.File]::ReadAllBytes($target)

function Show-Slice([byte[]]$data, [string]$label, [int]$ctx)
{
    $idx = -1
    $search = [System.Text.Encoding]::UTF8.GetBytes($label)
    for ($i = 0; $i -le $data.Length - $search.Length; $i++)
    {
        $ok = $true
        for ($j = 0; $j -lt $search.Length; $j++)
        {
            if ($data[$i + $j] -ne $search[$j]) { $ok = $false; break }
        }
        if ($ok) { $idx = $i; break }
    }
    if ($idx -lt 0) { Write-Host "$label - not found"; return }
    $start = [Math]::Max(0, $idx - $ctx)
    $end = [Math]::Min($data.Length, $idx + $search.Length + $ctx)
    $slice = $data[$start..($end - 1)]
    $hex = ($slice | ForEach-Object { $_.ToString('X2') }) -join '-'
    Write-Host "$label`n  at offset $idx, full slice hex: $hex"
    Write-Host "  text: $($text = [System.Text.Encoding]::UTF8.GetString($slice))"
}

Show-Slice $bytes 'Dữ liệu Đậu TOEIC API' 30
Show-Slice $bytes 'Xem JSON' 40
Show-Slice $bytes 'Dictation' 40
Show-Slice $bytes 'Listening' 20

# Also print first 16 bytes of the file to check BOM
Write-Host "`nFile header (first 16 bytes):"
$hdr = ($bytes[0..15] | ForEach-Object { $_.ToString('X2') }) -join '-'
Write-Host "  $hdr"
