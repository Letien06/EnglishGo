# Fix ListenController.java: the previous patch over-trimmed the closing ");" from
# the last ListenPartView line, leaving a syntax error.
# Broken state on line 126: ends with "4".equals(activeId))" (missing semicolon)
# and the next line "    }" should be the method's closing brace.

$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot '..\src\main\java\com\englishwebapp\controller\ListenController.java'
$target = (Resolve-Path $target).Path

$lines = [System.IO.File]::ReadAllLines($target, [System.Text.Encoding]::UTF8)
$out = New-Object System.Collections.Generic.List[string]
$fixed = $false

for ($i = 0; $i -lt $lines.Length; $i++)
{
    $line = $lines[$i]
    if (-not $fixed -and $line -match '^\s*new ListenPartView\("4",.*"4"\.equals\(activeId\)\)\s*$')
    {
        # Replace ending )) with ));
        $repaired = $line.Substring(0, $line.LastIndexOf(')')) + '));'
        $out.Add($repaired)
        $fixed = $true
        Write-Host '  - Repaired last ListenPartView line (added ; and moved closer)'
        continue
    }
    $out.Add($line)
}

$enc = New-Object System.Text.UTF8Encoding($False)
$fs = [System.IO.File]::Open($target, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
try
{
    $sw = New-Object System.IO.StreamWriter($fs, $enc)
    try
    {
        for ($i = 0; $i -lt $out.Count; $i++) { $sw.WriteLine($out[$i]) }
    }
    finally { $sw.Dispose() }
}
finally { $fs.Dispose() }

if ($fixed) { Write-Host "Done. File: $((Get-Item $target).Length) bytes / $($out.Count) lines." }
else { Write-Warning 'Broken pattern not found - file not modified' }
