# Convert hardcoded Quy Ngu palette values into themeable CSS variables
$path = 'src/main/resources/static/css/app.css'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$c = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# Overlays first (multi-token strings)
$c = $c -replace 'rgba\(21,\s*18,\s*23,\s*0?\.9[24]\)', 'var(--glass)'
$c = $c -replace 'rgba\(21,\s*18,\s*23,\s*0?\.80\)', 'var(--glass-soft)'

$map = [ordered]@{
    '#0B0A0C' = 'var(--s0)'
    '#151217' = 'var(--s1)'
    '#1B171D' = 'var(--s2)'
    '#100D12' = 'var(--s3)'
    '#17131A' = 'var(--s3)'
    '#ECE4D3' = 'var(--ink)'
    '#D6CCB8' = 'var(--ink2)'
    '#C4BAA4' = 'var(--ink3)'
    '#8F8676' = 'var(--mut)'
    '#E8C876' = 'var(--gold2)'
    '#C6A15B' = 'var(--gold)'
    '#8A6A2F' = 'var(--gold-deep)'
    '#7FBFA0' = 'var(--jade2)'
    '#9BD4B8' = 'var(--jade3)'
    '#3E7A63' = 'var(--jade)'
    '#9C2E3F' = 'var(--crimson)'
    '#E08A96' = 'var(--crimson2)'
    '#EBB9C0' = 'var(--crimson2)'
    '#C25B69' = 'var(--crimson3)'
}
foreach ($key in $map.Keys) {
    $c = [regex]::Replace($c, [regex]::Escape($key), $map[$key], 'IgnoreCase')
}

[System.IO.File]::WriteAllText($path, $c, $utf8)
Write-Host 'Tokenize done.'
