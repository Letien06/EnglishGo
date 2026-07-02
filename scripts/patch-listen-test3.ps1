$ErrorActionPreference = "Stop"
$path = "src\test\java\com\englishwebapp\controller\ListenControllerTest.java"
$lines = Get-Content -Path $path -Encoding utf8
$patched = @()
$importsTouched = $false
$staleReplaced = $false
foreach ($line in $lines) {
    if (-not $importsTouched -and $line -match '^import org\.junit\.jupiter\.api\.Test;') {
        $patched += 'import static org.mockito.ArgumentMatchers.any;'
        $patched += 'import static org.mockito.ArgumentMatchers.eq;'
        $patched += $line
        $importsTouched = $true
    } elseif ($line -match 'Nghe & L[a\u1ec7p]t t\u1eeb - 30%') {
        $patched += '                .andExpect(content().string(Matchers.containsString("Part 1")))'
        $patched += '                .andExpect(content().string(Matchers.containsString("Luy\u1ec7n t\u1eadp")))'
        $staleReplaced = $true
    } else {
        $patched += $line
    }
}
$utf8NoBom = New-Object System.Text.UTF8Encoding $False
[System.IO.File]::WriteAllLines($path, $patched, $utf8NoBom)
Write-Host ("imports: " + $importsTouched + " stale: " + $staleReplaced)
