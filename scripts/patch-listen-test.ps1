$ErrorActionPreference = "Stop"
$path = "src\test\java\com\englishwebapp\controller\ListenControllerTest.java"
$content = Get-Content -Raw -Encoding utf8 $path

# Fix 1: match any Integer for limit (controller now passes null/Integer.MAX_VALUE)
$old1 = "        when(dauToeicClientService.getDifficultySession(1, 1, 20))"
$new1 = "        when(dauToeicClientService.getDifficultySession(eq(1), eq(1), any()))"
$content = $content.Replace($old1, $new1)

# Fix 2: replace stale "Nghe & Lật từ - 30%" with a current UI string the
# practice topbar actually emits ("Part 1 · Cấp độ 1 · Luyện tập")
$old2 = "                .andExpect(content().string(Matchers.containsString(""Nghe & Lật từ - 30%"")))"
$new2 = "                .andExpect(content().string(Matchers.containsString(""Part 1"")))" + "`r`n" + "                .andExpect(content().string(Matchers.containsString(""Luyện tập"")))"
$content = $content.Replace($old2, $new2)

# Fix 3: ensure Mockito `any()` and `eq()` are imported
if (-not $content.Contains("import static org.mockito.ArgumentMatchers.any;")) {
    $content = $content.Replace("import org.junit.jupiter.api.Test;",
        "import org.junit.jupiter.api.Test;" + "`r`n" + "import static org.mockito.ArgumentMatchers.any;" + "`r`n" + "import static org.mockito.ArgumentMatchers.eq;")
}

$utf8NoBom = New-Object System.Text.UTF8Encoding $False
[System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
Write-Host "PATCHED test"
