<#
.SYNOPSIS
  Private prompt-regression harness for Jev Said So.

.DESCRIPTION
  Sends the 100 fixed questions below to the live /api/ask endpoint, sequentially,
  and writes every Jev output to benchmarks/ as CSV + JSON.

  The question set is hard-coded on purpose: future runs must ask the exact same
  questions so results are comparable.

  Requests carry an 'x-benchmark-token' header so the server's private bypass
  skips the public rate limit (10 requests / 60 s / IP). The token is read from
  $env:JEV_BENCHMARK_TOKEN and is NEVER hard-coded here. Without it, the run will
  hit the public limit after 10 requests and most rows will be HTTP 429.

  This is a prompt regression suite, not a scientific accuracy benchmark. The
  'Expected' column is our own annotation, is never sent to Jev, and only exists
  to spot obvious regressions.

.EXAMPLE
  $env:JEV_BENCHMARK_TOKEN = "the-secret-token"
  .\scripts\benchmark.ps1

.EXAMPLE
  # Local run against the dev server, no token needed if Upstash is unconfigured.
  .\scripts\benchmark.ps1 -Endpoint "http://localhost:5173/api/ask" -Tag "local"
#>

[CmdletBinding()]
param(
  # Endpoint to call. Override for local runs.
  [string]$Endpoint = 'https://jevsaidso.com/api/ask',

  # Optional label appended to the output filenames.
  [string]$Tag = '',

  # How long to wait for a single request, in seconds.
  [int]$TimeoutSec = 60,

  # Pause between requests, in milliseconds.
  [int]$DelayMs = 0,

  # Output directory, relative to the repository root.
  [string]$OutputDir = 'benchmarks'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

<#
  Read a property without tripping StrictMode.
  Under 'Set-StrictMode -Version Latest', accessing a missing property throws,
  so every field we read off an API response goes through here.
#>
function Get-SafeProperty {
  param(
    [Parameter(Mandatory = $false)] [object]$InputObject,
    [Parameter(Mandatory = $true)] [string]$Name
  )

  if ($null -eq $InputObject) { return $null }
  if (-not $InputObject.PSObject.Properties[$Name]) { return $null }

  return $InputObject.$Name
}

# --- dataset -----------------------------------------------------------------
# Format: 'category|expected|question'. 'expected' is our annotation only and is
# never sent to the API. The '|' delimiter is safe: no question contains one.

$Dataset = @(
  'common-sense|YES|I''m hungry. Should I eat?',
  'common-sense|YES|I am thirsty. Should I drink some water?',
  'common-sense|YES|It is raining and I have an umbrella. Should I open it?',
  'common-sense|YES|I have a job interview tomorrow morning. Should I set an alarm?',
  'common-sense|YES|My phone battery is at 2% and I have a long trip ahead. Should I charge it?',
  'common-sense|YES|I am tired and it is past midnight. Should I go to sleep?',
  'common-sense|YES|I am hungry and there is a fresh sandwich in the fridge. Should I eat it?',
  'common-sense|YES|I have an exam in eight hours and I have not studied. Should I start studying now?',
  'common-sense|YES|I am cold and there is a blanket next to me. Should I use it?',
  'common-sense|YES|I feel a headache coming on and I have been staring at a screen for hours. Should I take a break?',
  'common-sense|NO|I am completely full after a huge dinner. Should I eat another full meal?',
  'common-sense|NO|My phone works perfectly and I do not need a new one. Should I smash it?',
  'common-sense|NO|I have an important meeting in five minutes. Should I start a three hour movie?',
  'common-sense|NO|I am allergic to peanuts. Should I eat this peanut butter sandwich?',
  'common-sense|NO|It is 3am and I have work at 7am. Should I start cleaning the entire house?',
  'common-sense|NO|I just finished a 10km run and my legs are shaking. Should I run another 10km right now?',
  'common-sense|NO|My car has no brakes and I need to drive to another city. Should I drive it?',
  'common-sense|NO|I am on a strict diet and just ate a full meal. Should I eat a whole cake?',
  'common-sense|NO|I have no money in my account and rent is due tomorrow. Should I buy a new TV today?',
  'common-sense|NO|I am very sick with a fever. Should I go to a loud party tonight?',
  'short-context|AMBIGUOUS|Should I go out tonight?',
  'short-context|AMBIGUOUS|Should I text my ex?',
  'short-context|AMBIGUOUS|Should I order pizza?',
  'short-context|AMBIGUOUS|Should I skip the gym?',
  'short-context|AMBIGUOUS|Should I buy a new laptop?',
  'short-context|AMBIGUOUS|Should I move to another city?',
  'short-context|AMBIGUOUS|Should I get a haircut?',
  'short-context|AMBIGUOUS|Should I call my friend?',
  'strong-context|YES|I have been exhausted for weeks and my doctor told me to take time off. Should I take a vacation?',
  'strong-context|NO|I am allergic to shellfish and this dish is full of shrimp. Should I eat it?',
  'strong-context|YES|I love pizza and I am starving. Should I order pizza?',
  'strong-context|YES|I want to get fitter and my doctor says my back is fine. Should I start going to the gym?',
  'strong-context|YES|I have been unhappy for six months, we repeatedly fail to resolve the same problems, and I no longer want the relationship. Should I break up with my girlfriend?',
  'strong-context|YES|I need the money for rent next week but I already have a signed offer starting Monday. Should I accept the new job?',
  'strong-context|YES|I have studied for months and feel prepared. Should I take the exam tomorrow?',
  'strong-context|YES|My tooth has ached for a week and I have dental coverage. Should I see a dentist?',
  'strong-context|YES|I have been saving for two years and the roof is leaking badly. Should I fix the roof?',
  'strong-context|NO|I am happy, communicate well, and want to stay together. Should I break up with my girlfriend?',
  'strong-context|NO|I have no savings, no alternative income, and I need the money for rent next week. Should I quit my job?',
  'strong-context|YES|My doctor said I am dehydrated and I have not drunk water all day. Should I drink water?',
  'strong-context|NO|I am severely allergic to cats and my throat swells up around them. Should I adopt three cats?',
  'strong-context|NO|My friend lied to me repeatedly and never apologized. Should I lend him my life savings?',
  'paired|AMBIGUOUS|Should I start going to the gym?',
  'paired|NO|I have a broken leg and my doctor told me not to exercise yet. Should I go lift weights today?',
  'paired|AMBIGUOUS|Should I quit my job?',
  'paired|YES|I have another job confirmed with better pay and conditions. Should I quit my current job?',
  'paired|NO|I have no savings, no alternative income, and rent is due next week. Should I quit my current job?',
  'paired|YES|I love pizza. Should I order pizza?',
  'paired|NO|I hate pizza. Should I order pizza?',
  'paired|YES|I slept eight hours and feel great. Should I go for a run?',
  'paired|NO|I have not slept and my chest hurts. Should I go for a hard run?',
  'paired|AMBIGUOUS|Should I go to the party?',
  'opposites|YES|I really want to go out tonight and I have nothing important tomorrow. Should I go?',
  'opposites|NO|I hate crowded places and I am exhausted. Should I go to a crowded party tonight?',
  'opposites|YES|My phone is broken and I need it for work. Should I buy a new phone?',
  'opposites|NO|My phone works perfectly and I do not need another one. Should I buy a new phone?',
  'opposites|YES|I have plenty of savings and this trip has been planned for a year. Should I go on the trip?',
  'opposites|NO|I have no savings and would need a high-interest loan. Should I go on an expensive trip?',
  'opposites|YES|I finished all my work early and have the evening free. Should I relax?',
  'opposites|NO|I have a deadline in three hours and nothing written yet. Should I relax?',
  'turkish|AMBIGUOUS|Eski sevgilime yazmalı mıyım?',
  'turkish|NO|Eski sevgilimle ayrılalı iki yıl oldu, ikimiz de başka ilişkilerdeyiz. Ona gece 3''te yazmalı mıyım?',
  'turkish|YES|Spora başlamak istiyorum ve doktorum bir engelim olmadığını söyledi. Spora başlamalı mıyım?',
  'turkish|NO|Bacağım kırık ve doktorum egzersiz yapmamamı söyledi. Bugün ağırlık kaldırmaya gitmeli miyim?',
  'turkish|YES|Çok açım ve evde taze yemek var. Yemek yemeli miyim?',
  'turkish|NO|Çok tokum ve saat gece yarısı. Bir tepsi baklava yemeli miyim?',
  'turkish|YES|Yarın sabah mülakatım var. Erken yatmalı mıyım?',
  'turkish|AMBIGUOUS|İşimden ayrılmalı mıyım?',
  'turkish-no-chars|AMBIGUOUS|spora baslasam mi',
  'turkish-no-chars|NO|bugun cok yorgunum yarin erken kalkicam disari ciksam mi',
  'turkish-no-chars|YES|cok acim yemek yemelimiyim',
  'turkish-no-chars|NO|cok tokum gece yarisi bir tepsi baklava yemelimiyim',
  'turkish-no-chars|AMBIGUOUS|eski sevgilime yazsam mi',
  'turkish-no-chars|YES|yeni bir is buldum maasim daha iyi simdi istifa etmelimiyim',
  'turkish-no-chars|NO|hic param yok kira gunu yarin yeni telefon alsam mi',
  'turkish-no-chars|YES|kafam cok karisik biraz yuruyuse ciksam mi',
  'mixed|YES|Gym e gitmek istiyorum, 3 aydir planliyorum. Should I start today?',
  'mixed|NO|Bugun cok yorgunum ve yarin sinavim var. Should I go out tonight?',
  'mixed|AMBIGUOUS|Should I text my ex? Ya da bosver mi?',
  'mixed|NO|I am alerjik to peanuts. Should I eat this?',
  'mixed|YES|Yarin mulakatim var, alarm kurmali miyim? Should I set an alarm?',
  'mixed|AMBIGUOUS|Iki secenegim var, hangisi bilmiyorum. Should I just pick one?',
  'slang-typos|AMBIGUOUS|should i go gym or nah',
  'slang-typos|NO|im stuffed lol should i smash another pizza',
  'slang-typos|YES|im starving should i grab food',
  'slang-typos|NO|phone is dead btw i have no charger should i keep scrolling',
  'slang-typos|YES|shud i start going to the gym',
  'slang-typos|AMBIGUOUS|shud i txt my ex',
  'slang-typos|NO|i havnt slept at all n i feel dizzy shud i go for a run',
  'slang-typos|YES|im realy hungy shud i order food',
  'food|YES|I skipped lunch and I am starving now. Should I order food?',
  'food|NO|I just ate two full meals and feel sick. Should I order dessert?',
  'food|YES|I am on a diet but it is my birthday and I planned this meal. Should I eat the cake?',
  'exercise|YES|I feel healthy, rested, and want to get stronger. Should I start lifting weights?',
  'exercise|NO|I pulled a muscle yesterday and it still hurts sharply. Should I lift heavy weights today?',
  'spending|YES|My laptop died and I need it for work. Should I buy a replacement?',
  'spending|NO|My laptop works fine and I have no savings. Should I buy a new one just for fun?',
  'relationships|NO|We are both in other relationships and it has been two years. Should I text my ex at 3am?',
  'work-school|YES|I have a final exam tomorrow and I have not studied at all. Should I study tonight?',
  'social|AMBIGUOUS|My friend invited me to a party but I feel like staying home. Should I go?'
)

# --- setup -------------------------------------------------------------------

$token = $env:JEV_BENCHMARK_TOKEN
$hasToken = -not [string]::IsNullOrWhiteSpace($token)

$repoRoot = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $repoRoot $OutputDir
if (-not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$stamp = Get-Date -Format 'yyyy-MM-dd-HHmmss'
$baseName = if ([string]::IsNullOrWhiteSpace($Tag)) { "jev-$stamp" } else { "jev-$stamp-$Tag" }
$csvPath = Join-Path $outDir "$baseName.csv"
$jsonPath = Join-Path $outDir "$baseName.json"

Write-Host ''
Write-Host '  Jev Said So - benchmark harness' -ForegroundColor Cyan
Write-Host "  Endpoint : $Endpoint"
Write-Host "  Questions: $($Dataset.Count)"
Write-Host "  Bypass   : $(if ($hasToken) { 'token present' } else { 'NO TOKEN - public rate limit will apply' })" -ForegroundColor $(if ($hasToken) { 'Gray' } else { 'Yellow' })
Write-Host "  Output   : benchmarks/$baseName.{csv,json}"
Write-Host ''

if (-not $hasToken) {
  Write-Warning 'JEV_BENCHMARK_TOKEN is not set. After 10 requests the public rate limit (10/min) will return HTTP 429. Set it, or pass -Endpoint for a local run.'
}

# --- header ------------------------------------------------------------------

$headers = @{ 'Content-Type' = 'application/json' }
if ($hasToken) {
  # Server-side only; never printed, never written to the output files.
  $headers['x-benchmark-token'] = $token
}

# --- run ---------------------------------------------------------------------

$results = [System.Collections.Generic.List[object]]::new()
$runStarted = Get-Date
$index = 0

foreach ($row in $Dataset) {
  $index++

  $parts = $row -split '\|', 3
  $category = $parts[0]
  $expected = $parts[1]
  $question = $parts[2]

  $body = @{ question = $question } | ConvertTo-Json -Compress
  $status = $null
  $answer = ''
  $probability = $null
  $errorMessage = ''
  $elapsedMs = $null

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $response = Invoke-RestMethod -Uri $Endpoint -Method Post -Headers $headers -Body $body -TimeoutSec $TimeoutSec
    $sw.Stop()
    $elapsedMs = [math]::Round($sw.Elapsed.TotalMilliseconds)

    $answerValue = Get-SafeProperty -InputObject $response -Name 'answer'
    $probabilityValue = Get-SafeProperty -InputObject $response -Name 'probability'

    if ($null -eq $answerValue) {
      throw "Unexpected response shape: no 'answer' field returned."
    }

    $answer = [string]$answerValue
    if ($null -ne $probabilityValue) { $probability = [double]$probabilityValue }
    $status = 200
  }
  catch {
    $sw.Stop()
    $elapsedMs = [math]::Round($sw.Elapsed.TotalMilliseconds)
    $errorMessage = $_.Exception.Message

    # StrictMode makes missing properties throw, so probe defensively: a
    # timeout or DNS failure has no HTTP response at all.
    $httpResponse = $null
    if ($_.Exception.PSObject.Properties['Response']) {
      $httpResponse = $_.Exception.Response
    }

    if ($null -ne $httpResponse) {
      $status = [int]$httpResponse.StatusCode

      # Read the JSON error body for a cleaner message when there is one.
      try {
        $reader = New-Object System.IO.StreamReader($httpResponse.GetResponseStream())
        $errorBody = $reader.ReadToEnd()
        $reader.Dispose()

        if (-not [string]::IsNullOrWhiteSpace($errorBody)) {
          $parsed = $errorBody | ConvertFrom-Json
          $apiError = Get-SafeProperty -InputObject $parsed -Name 'error'
          if ($null -ne $apiError) { $errorMessage = [string]$apiError }
        }
      }
      catch {
        # Keep the original exception message.
      }
    }
  }

  if ($null -ne $probability) {
    $confidencePct = [math]::Round($probability * 100)
  }
  else {
    $confidencePct = $null
  }

  $results.Add([pscustomobject]@{
    index       = $index
    category    = $category
    expected    = $expected
    question    = $question
    answer      = $answer
    probability = $probability
    confidence  = $confidencePct
    status      = $status
    elapsed_ms  = $elapsedMs
    error       = $errorMessage
  })

  $colour = 'Gray'
  if ($status -eq 200) { $colour = if ($answer -eq 'YES') { 'Green' } elseif ($answer -eq 'NO') { 'Red' } else { 'Gray' } }
  elseif ($null -ne $status) { $colour = 'Yellow' }

  $displayConfidence = if ($null -ne $confidencePct) { "$confidencePct%" } else { '-' }
  $displayStatus = if ($null -ne $status) { $status } else { 'ERR' }
  $displayAnswer = if ([string]::IsNullOrWhiteSpace($answer)) { $displayStatus } else { $answer }

  Write-Host ("{0,3}  {1,-5}  {2,-7}  {3,7}ms  {4}" -f $index, $displayAnswer, $displayConfidence, $elapsedMs, $question) -ForegroundColor $colour

  if ($DelayMs -gt 0) { Start-Sleep -Milliseconds $DelayMs }
}

$runEnded = Get-Date
$totalElapsed = $runEnded - $runStarted

# --- summary -----------------------------------------------------------------

$ok = @($results | Where-Object { $_.status -eq 200 })
$yes = @($ok | Where-Object { $_.answer -eq 'YES' })
$no = @($ok | Where-Object { $_.answer -eq 'NO' })
$errors = @($results | Where-Object { $_.status -ne 200 })

$confidences = @($ok | Where-Object { $null -ne $_.confidence } | ForEach-Object { $_.confidence })
$meanConfidence = $null
$medianConfidence = $null
if ($confidences.Count -gt 0) {
  $meanConfidence = [math]::Round(($confidences | Measure-Object -Average).Average, 1)
  $sorted = $confidences | Sort-Object
  $mid = [int][math]::Floor($sorted.Count / 2)
  $medianConfidence = if ($sorted.Count % 2 -eq 1) { $sorted[$mid] } else { [math]::Round(($sorted[$mid - 1] + $sorted[$mid]) / 2, 1) }
}

$nearFifty = @($confidences | Where-Object { $_ -ge 45 -and $_ -le 55 }).Count
$highConfidence = @($confidences | Where-Object { $_ -ge 80 }).Count

$latencies = @($ok | Where-Object { $null -ne $_.elapsed_ms } | ForEach-Object { $_.elapsed_ms })
$meanLatency = $null
if ($latencies.Count -gt 0) {
  $meanLatency = [math]::Round(($latencies | Measure-Object -Average).Average)
}

# Directional agreement: did an expected YES/NO land on the right side of 50%?
$directional = @($ok | Where-Object { $_.expected -in @('YES', 'NO') })
$directionalHits = @($directional | Where-Object { $_.answer -eq $_.expected })
$directionalPct = if ($directional.Count -gt 0) { [math]::Round(($directionalHits.Count / $directional.Count) * 100, 1) } else { $null }

# Ambiguous cases should hover near 50% rather than committing hard.
$ambiguous = @($ok | Where-Object { $_.expected -eq 'AMBIGUOUS' })
$ambiguousNearFifty = @($ambiguous | Where-Object { $_.confidence -ge 45 -and $_.confidence -le 55 })
$ambiguousPct = if ($ambiguous.Count -gt 0) { [math]::Round(($ambiguousNearFifty.Count / $ambiguous.Count) * 100, 1) } else { $null }

# Obvious-answer failures: a clearly expected YES/NO that came back decisive and wrong.
$obviousFailures = @($directional | Where-Object { $_.answer -ne $_.expected -and $_.confidence -ge 60 })

Write-Host ''
Write-Host '  Summary' -ForegroundColor Cyan
Write-Host '  -------'
Write-Host ("  Total requests          : {0}" -f $results.Count)
Write-Host ("  YES                     : {0}" -f $yes.Count)
Write-Host ("  NO                      : {0}" -f $no.Count)
Write-Host ("  Mean confidence         : {0}" -f $(if ($null -ne $meanConfidence) { "$meanConfidence%" } else { '-' }))
Write-Host ("  Median confidence       : {0}" -f $(if ($null -ne $medianConfidence) { "$medianConfidence%" } else { '-' }))
Write-Host ("  Between 45%-55%         : {0}" -f $nearFifty)
Write-Host ("  >= 80%                  : {0}" -f $highConfidence)
Write-Host ("  Errors                  : {0}" -f $errors.Count)
Write-Host ("  Mean latency            : {0}" -f $(if ($null -ne $meanLatency) { "${meanLatency}ms" } else { '-' }))
Write-Host ("  Total elapsed           : {0:hh\:mm\:ss}" -f $totalElapsed)

Write-Host ''
Write-Host '  Expectation analysis (our annotations, not sent to Jev)' -ForegroundColor Cyan
Write-Host '  ------------------------------------------------------'
Write-Host ("  Directional agreement   : {0} of {1} ({2}%)" -f $directionalHits.Count, $directional.Count, $(if ($null -ne $directionalPct) { $directionalPct } else { '-' }))
Write-Host ("  AMBIGUOUS near 45-55%   : {0} of {1} ({2}%)" -f $ambiguousNearFifty.Count, $ambiguous.Count, $(if ($null -ne $ambiguousPct) { $ambiguousPct } else { '-' }))
Write-Host ("  Obvious-answer failures : {0}" -f $obviousFailures.Count) -ForegroundColor $(if ($obviousFailures.Count -gt 0) { 'Yellow' } else { 'Gray' })

if ($obviousFailures.Count -gt 0) {
  Write-Host ''
  foreach ($failure in $obviousFailures) {
    Write-Host ("    #{0} expected {1}, got {2} at {3}%  -  {4}" -f $failure.index, $failure.expected, $failure.answer, $failure.confidence, $failure.question) -ForegroundColor Yellow
  }
}

# --- output ------------------------------------------------------------------

# Export-Csv writes UTF-8 with a BOM, which is what makes Excel read the
# Turkish characters correctly on a double-click.
$results | Export-Csv -LiteralPath $csvPath -NoTypeInformation -Encoding UTF8

$metadata = [ordered]@{
  generated_at      = $runEnded.ToString('o')
  endpoint          = $Endpoint
  model             = 'jev-latest'
  bypass_used       = $hasToken
  question_count    = $results.Count
  summary           = [ordered]@{
    yes                  = $yes.Count
    no                   = $no.Count
    errors               = $errors.Count
    mean_confidence      = $meanConfidence
    median_confidence    = $medianConfidence
    between_45_55        = $nearFifty
    at_or_above_80       = $highConfidence
    mean_latency_ms      = $meanLatency
    total_elapsed        = $totalElapsed.ToString()
    directional_agreement = $directionalPct
    directional_cases     = $directional.Count
    ambiguous_near_fifty  = $ambiguousPct
    ambiguous_cases       = $ambiguous.Count
    obvious_failures      = $obviousFailures.Count
  }
  results           = $results
}

# JSON is written without a BOM: strict parsers reject a leading U+FEFF.
$jsonText = $metadata | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($jsonPath, $jsonText, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
Write-Host "  CSV  : benchmarks/$baseName.csv"
Write-Host "  JSON : benchmarks/$baseName.json"
Write-Host ''
Write-Host '  Reminder: this is a prompt regression suite, not a scientific'
Write-Host '  accuracy benchmark. Treat the Expected column as a smoke test.'
Write-Host ''
