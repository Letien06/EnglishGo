$ErrorActionPreference = "Stop"
$path = "src\main\java\com\englishwebapp\controller\ListenController.java"
$content = Get-Content -Raw -Encoding utf8 $path

$old = "                    20));"
$new = "                    null));"

if ($content.Contains($old)) {
    $patched = $content.Replace($old, $new)
    $utf8NoBom = New-Object System.Text.UTF8Encoding $False
    [System.IO.File]::WriteAllText($path, $patched, $utf8NoBom)
    Write-Host "PATCHED: replaced 20)) with null))"
} else {
    Write-Host "OLD marker not found"
    exit 1
}
