param([string]$Old = "quy-ngu-skin-2", [string]$New = "quy-ngu-skin-3")

Get-ChildItem -Path "src\main\resources\templates" -Filter "*.html" -Recurse | ForEach-Object {
    $path = $_.FullName
    $content = Get-Content -Path $path -Raw -Encoding utf8
    if ($content -match "v='$Old'" -or $content -match 'v="' + $Old + '"') {
        $newContent = $content -replace [regex]::Escape("v='$Old'"), "v='$New'"
        $newContent = $newContent -replace [regex]::Escape('v="' + $Old + '"'), 'v="' + $New + '"'
        Set-Content -Path $path -Value $newContent -Encoding utf8 -NoNewline
        Write-Host "bumped: $($_.Name)"
    }
}
