# Patch listen/index.html — char-array approach to bypass PowerShell cp1252 source decoding.
# Each Vietnamese char is specified by its Unicode code point so the .GetBytes() call
# produces the correct UTF-8 byte sequence regardless of the script file's encoding.

$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot '..\src\main\resources\templates\listen\index.html'
$target = (Resolve-Path $target).Path

function Get-Utf8Bytes {
    param([char[]]$Chars)
    return [System.Text.Encoding]::UTF8.GetBytes($Chars)
}

# Vietnamese word: "Dữ liệu Đậu TOEIC API" — each char by code point
$vietnameseChars = [char[]]@(
    [char]0x0044,           # D
    [char]0x1EEF,           # ữ
    [char]0x0020,           # space
    [char]0x006C,           # l
    [char]0x0069,           # i
    [char]0x1EC7,           # ệ
    [char]0x0075,           # u
    [char]0x0020,           # space
    [char]0x0110,           # Đ
    [char]0x1EAD,           # ậ
    [char]0x0075,           # u
    [char]0x0020,           # space
    [char]0x0054,           # T
    [char]0x004F,           # O
    [char]0x0045,           # E
    [char]0x0049,           # I
    [char]0x0043,           # C
    [char]0x0020,           # space
    [char]0x0041,           # A
    [char]0x0050,           # P
    [char]0x0049            # I
)

# Build the full pill marker: 16 spaces + <span...>Dữ liệu Đậu TOEIC API</span>
$asciiPart = '                <span class="listen-pill">'
$pillMarker = ([char[]]$asciiPart) + $vietnameseChars + ([char[]]'</span>')
$pillMarkerBytes = Get-Utf8Bytes -Chars $pillMarker
Write-Host ('Pill marker bytes (' + $pillMarkerBytes.Length + ')')

# Build the JSON link marker
$jsonMarker = '                <a th:href="@{/api/dautoeic/difficulty/parts/{part}/levels(part=${activePart.id()})}" target="_blank" rel="noopener">Xem JSON</a>'
$jsonMarkerBytes = Get-Utf8Bytes -Chars ([char[]]$jsonMarker)
Write-Host ('JSON marker bytes (' + $jsonMarkerBytes.Length + ')')

# Build subtitle markers using char codes for "·" (U+00B7) and "→" (U+2192)
$arrow = [char]0x2192
$midDot = [char]0x00B7

$oldSubtitleChars = ([char[]]'<small>') + [char[]]@('L','i','s','t','e','n','i','n','g',' ',$midDot,' ','P','a','r','t','s',' ','1',' ',$arrow,' ','4',' ','+',' ','D','i','c','t','a','t','i','o','n') + ([char[]]'</small>')
$newSubtitleChars = ([char[]]'<small>') + [char[]]@('L','i','s','t','e','n','i','n','g',' ',$midDot,' ','P','a','r','t','s',' ','1',' ',$arrow,' ','4') + ([char[]]'</small>')
$oldSubtitleBytes = Get-Utf8Bytes -Chars $oldSubtitleChars
$newSubtitleBytes = Get-Utf8Bytes -Chars $newSubtitleChars
Write-Host ('Old subtitle bytes (' + $oldSubtitleBytes.Length + ')')

function Apply-Replace {
    param(
        [byte[]]$Haystack,
        [byte[]]$Old,
        [byte[]]$New
    )
    $result = New-Object System.Collections.Generic.List[byte] ($Haystack.Length)
    $i = 0
    $n = $Haystack.Length
    $m = $Old.Length
    $count = 0
    while ($i -lt $n)
    {
        $match = $true
        if ($i + $m -le $n)
        {
            for ($j = 0; $j -lt $m; $j++)
            {
                if ($Haystack[$i + $j] -ne $Old[$j]) { $match = $false; break }
            }
        }
        else { $match = $false }

        if ($match)
        {
            foreach ($b in $New) { $result.Add($b) }
            $i += $m
            $count++
            continue
        }
        $result.Add($Haystack[$i])
        $i++
    }
    return @{ Bytes = $result.ToArray(); Count = $count }
}

function Remove-Line-By-Marker {
    param(
        [byte[]]$Haystack,
        [byte[]]$Marker
    )
    $result = New-Object System.Collections.Generic.List[byte] ($Haystack.Length)
    $i = 0
    $n = $Haystack.Length
    $m = $Marker.Length
    $count = 0
    while ($i -lt $n)
    {
        $match = $true
        if ($i + $m -le $n)
        {
            for ($j = 0; $j -lt $m; $j++)
            {
                if ($Haystack[$i + $j] -ne $Marker[$j]) { $match = $false; break }
            }
        }
        else { $match = $false }

        if ($match)
        {
            $eol = $i + $m
            if ($eol -lt $n -and $Haystack[$eol] -eq 0x0D) { $eol++ }
            if ($eol -lt $n -and $Haystack[$eol] -eq 0x0A) { $eol++ }
            $i = $eol
            $count++
            continue
        }
        $result.Add($Haystack[$i])
        $i++
    }
    return @{ Bytes = $result.ToArray(); Count = $count }
}

function Save-NoBom {
    param([string]$Path, [byte[]]$Bytes)
    $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try
    {
        $fs.Write($Bytes, 0, $Bytes.Length)
    }
    finally { $fs.Dispose() }
}

# Read
$data = [System.IO.File]::ReadAllBytes($target)
Write-Host ('Loaded ' + $data.Length + ' bytes')

# 1) Pill
$r = Remove-Line-By-Marker -Haystack $data -Marker $pillMarkerBytes
if ($r.Count -gt 0) { Write-Host "  - Removed hero pill line ($($r.Count) occurrence(s))"; $data = $r.Bytes } else { Write-Warning "Hero pill line not found" }

# 2) JSON link
$r = Remove-Line-By-Marker -Haystack $data -Marker $jsonMarkerBytes
if ($r.Count -gt 0) { Write-Host "  - Removed Xem JSON line ($($r.Count) occurrence(s))"; $data = $r.Bytes } else { Write-Warning "Xem JSON line not found" }

# 3) Subtitle
$r = Apply-Replace -Haystack $data -Old $oldSubtitleBytes -New $newSubtitleBytes
if ($r.Count -gt 0) { Write-Host "  - Updated sidebar subtitle ($($r.Count) occurrence(s))"; $data = $r.Bytes } else { Write-Warning "Sidebar subtitle not found" }

Save-NoBom -Path $target -Bytes $data
Write-Host "Done. File size: $([System.IO.File]::ReadAllBytes($target).Length) bytes"
