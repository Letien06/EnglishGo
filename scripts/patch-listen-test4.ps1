$ErrorActionPreference = "Stop"
$path = "src\test\java\com\englishwebapp\controller\ListenControllerTest.java"
$content = Get-Content -Raw -Encoding utf8 $path

# Use ASCII-safe marker: only the L at start
$old = 'Nghe & L'
if ($content.Contains($old)) {
    # Find the full line containing it and replace the whole assertion line
    $lines = $content -split "`r?`n"
    $patched = @()
    foreach ($line in $lines) {
        if ($line.Contains('Nghe & L')) {
            $patched += '                .andExpect(content().string(Matchers.containsString("Part 1")))'
            $patched += '                .andExpect(content().string(Matchers.containsString("Luyện tập")))'
        } else {
            $patched += $line
        }
    }
    $newContent = $patched -join "`r`n"
    $utf8NoBom = New-Object System.Text.UTF8Encoding $False
    [System.IO.File]::WriteAllText($path, $newContent, $utf8NoBom)
    Write-Host "STALE LINE REPLACED"
} else {
    Write-Host "stale not found"
}
