$ErrorActionPreference = "Stop"
$path = "src\test\java\com\englishwebapp\controller\ListenControllerTest.java"
$lines = Get-Content -Path $path -Encoding utf8
$patched = @()
foreach ($line in $lines) {
    if ($line -match 'Nghe & L[a\u1ec7p]t t\u1eeb - 30%') {
        # replace stale "Nghe & Lật từ - 30%" assertion with two current UI strings
        $patched += '                .andExpect(content().string(Matchers.containsString("Part 1")))'
        $patched += '                .andExpect(content().string(Matchers.containsString("Luy\u1ec7n t\u1eadp")))'
        Write-Host "replaced stale line"
    } else {
        $patched += $line
    }
}
$utf8NoBom = New-Object System.Text.UTF8Encoding $False
[System.IO.File]::WriteAllLines($path, $patched, $utf8NoBom)
Write-Host "DONE"
