param(
    [string]$Path = ".env"
)

if (-not (Test-Path -LiteralPath $Path)) {
    throw "Env file not found: $Path"
}

Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
        return
    }

    $parts = $line -split "=", 2
    if ($parts.Count -ne 2) {
        return
    }

    $name = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    if ($name) {
        Set-Item -Path "Env:$name" -Value $value
    }
}

Write-Host "Loaded environment variables from $Path"
