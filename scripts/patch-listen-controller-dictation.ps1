# Patch ListenController.java — remove all "dictation" handling.
# Uses byte-level line scanning to bypass PowerShell's cp1252 source decoding issue.

$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot '..\src\main\java\com\englishwebapp\controller\ListenController.java'
$target = (Resolve-Path $target).Path

# Read file
$lines = [System.IO.File]::ReadAllLines($target, [System.Text.Encoding]::UTF8)
$out = New-Object System.Collections.Generic.List[string]
$removed = 0

for ($i = 0; $i -lt $lines.Length; $i++)
{
    $line = $lines[$i]
    $trim = $line.Trim()

    # Remove the dictation branch in addDauToeicLevels
    if ($trim -eq 'if ("dictation".equals(activeId)) {')
    {
        # skip this line and the next 2 (return; and closing brace)
        $i += 2
        $removed++
        Write-Host "  - Removed 'if dictation' branch (3 lines)"
        continue
    }

    # Remove "dictation" from the normalizePart case clause
    if ($trim -eq 'case "2", "3", "4", "dictation" -> part;')
    {
        $out.Add([string]::Format('            case "2", "3", "4" -> part;'))
        $removed++
        Write-Host "  - Removed dictation from normalizePart case"
        continue
    }

    # Remove the dictation ListenPartView line (and trim trailing comma on the previous line if needed)
    if ($line -match 'new ListenPartView\("dictation",')
    {
        # Also fix the previous line — remove trailing comma
        if ($out.Count -gt 0)
        {
            $prev = $out[$out.Count - 1]
            if ($prev.TrimEnd().EndsWith(','))
            {
                $out[$out.Count - 1] = $prev.TrimEnd().TrimEnd(',').TrimEnd()
            }
        }
        $removed++
        Write-Host "  - Removed dictation ListenPartView line"
        continue
    }

    # Remove the case "dictation" line in questionParts
    if ($trim -eq 'case "dictation" -> List.of(1, 2, 3, 4);')
    {
        $removed++
        Write-Host "  - Removed case dictation from questionParts"
        continue
    }

    $out.Add($line)
}

# Write back with no BOM
$enc = New-Object System.Text.UTF8Encoding($False)
$fs = [System.IO.File]::Open($target, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
try
{
    $sw = New-Object System.IO.StreamWriter($fs, $enc)
    try
    {
        for ($i = 0; $i -lt $out.Count; $i++)
        {
            $sw.WriteLine($out[$i])
        }
    }
    finally { $sw.Dispose() }
}
finally { $fs.Dispose() }

Write-Host "Done. Removed $removed block(s). File now: $((Get-Item $target).Length) bytes / $($out.Count) lines."
