$r = Invoke-WebRequest -Uri 'http://localhost:8080/listen' -UseBasicParsing -TimeoutSec 10
$html = $r.Content
Write-Host ('Status: ' + $r.StatusCode + ', Length: ' + $html.Length)
Write-Host '--- HERO PILL CHECK ---'
if ($html.Contains('Dữ liệu Đậu TOEIC API')) { Write-Host 'PILL STILL PRESENT' } else { Write-Host 'PILL REMOVED OK' }
Write-Host '--- XEM JSON CHECK ---'
if ($html.Contains('Xem JSON')) { Write-Host 'XEM JSON STILL PRESENT' } else { Write-Host 'XEM JSON REMOVED OK' }
Write-Host '--- DICTATION SIDEBAR CHECK ---'
if ($html.Contains('Nghe ch') -or $html.Contains('Dictation')) { Write-Host 'DICTATION SIDEBAR STILL PRESENT' } else { Write-Host 'DICTATION SIDEBAR REMOVED OK' }
Write-Host '--- SUBTITLE CHECK ---'
if ($html.Contains('Parts 1') -and $html.Contains('Dictation')) { Write-Host 'OLD SUBTITLE STILL PRESENT' } else { Write-Host 'SUBTITLE OK' }
Write-Host '--- SIDEBAR PARTS (expect 4) ---'
$matches = [regex]::Matches($html, 'href="/listen\?part=')
Write-Host ('Found: ' + $matches.Count)
Write-Host '--- PARTS IN SIDEBAR (labels) ---'
$labels = [regex]::Matches($html, '<strong>(Part \d|Nghe ch)[^<]*</strong>')
foreach ($l in $labels) { Write-Host ('  - ' + $l.Groups[1].Value) }
Write-Host '--- CACHE VERSION CHECK ---'
if ($html.Contains("v='quy-ngu-skin-8'") -or $html.Contains('v=quy-ngu-skin-8')) { Write-Host 'CACHE = quy-ngu-skin-8 OK' } else { Write-Host 'CACHE NOT FOUND' }
