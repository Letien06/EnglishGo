$ErrorActionPreference = "Stop"
$path = "src\main\java\com\englishwebapp\service\DauToeicClientService.java"
$content = Get-Content -Raw -Encoding utf8 $path

$old = "        int maxItems = limit == null || limit < 1 ? DEFAULT_PRACTICE_LIMIT : Math.min(limit, 100);"
$new = "        int effectiveLimit = limit == null || limit < 1 ? Integer.MAX_VALUE : limit;"

if ($content.Contains($old)) {
    $patched = $content.Replace($old, $new)
    $old2 = "                .limit(maxItems)"
    $new2 = "                .limit(effectiveLimit)"
    $patched2 = $patched.Replace($old2, $new2)
    $utf8NoBom = New-Object System.Text.UTF8Encoding $False
    [System.IO.File]::WriteAllText($path, $patched2, $utf8NoBom)
    Write-Host "PATCHED"
} else {
    Write-Host "OLD not found"
    exit 1
}
