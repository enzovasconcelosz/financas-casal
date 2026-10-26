# ============================================================================
# iniciar-teste.ps1 - sobe tudo para testar o bot com WhatsApp de verdade
#
#   1. o site em http://127.0.0.1:8777
#   2. o bot em http://127.0.0.1:8080
#   3. um tunel publico (cloudflared) para o Twilio/Meta alcancarem o bot
#
# Rode pelo iniciar-teste.bat (duplo clique). Feche as janelas para parar.
# ============================================================================

$ErrorActionPreference = 'Stop'
$bot  = $PSScriptRoot
$site = Split-Path $bot -Parent

function Achar($nome, $caminhos) {
    $cmd = Get-Command $nome -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($c in $caminhos) { if (Test-Path $c) { return $c } }
    return $null
}

$node = Achar 'node' @('C:\Program Files\nodejs\node.exe')
$cf   = Achar 'cloudflared' @('C:\Program Files (x86)\cloudflared\cloudflared.exe', 'C:\Program Files\cloudflared\cloudflared.exe')
# o python.exe de WindowsApps e so um atalho da Store; parar ele nao para o servidor
$py = (Get-Command python -All -ErrorAction SilentlyContinue |
       Where-Object { $_.Source -notlike '*WindowsApps*' } | Select-Object -First 1).Source
if (-not $py) { $py = Achar 'python' @() }

if (-not $node) { Write-Host 'Node.js nao encontrado. Instale com: winget install OpenJS.NodeJS.LTS' -ForegroundColor Red; exit 1 }
if (-not $cf)   { Write-Host 'cloudflared nao encontrado. Instale com: winget install Cloudflare.cloudflared' -ForegroundColor Red; exit 1 }

$env_ = Join-Path $bot '.env'
if (-not (Test-Path $env_)) {
    Write-Host 'Falta o arquivo bot\.env. Copie o .env.example para .env e preencha.' -ForegroundColor Red
    exit 1
}
$token = ([regex]::Match((Get-Content $env_ -Raw), '(?m)^APP_TOKEN=(.+)$')).Groups[1].Value.Trim()
$numeros = ([regex]::Match((Get-Content $env_ -Raw), '(?m)^ALLOWED_NUMBERS=(.*)$')).Groups[1].Value.Trim()

# ---------------------------------------------------------------- site
$abertos = @()
if ($py) {
    $abertos += Start-Process -FilePath $py -ArgumentList '-m', 'http.server', '8777', '--bind', '127.0.0.1' `
        -WorkingDirectory $site -WindowStyle Minimized -PassThru
} else {
    Write-Host 'Python nao encontrado: abra o site por outro servidor na porta 8777.' -ForegroundColor Yellow
}

# ---------------------------------------------------------------- bot
$abertos += Start-Process -FilePath $node -ArgumentList '--env-file=.env', 'server.js' -WorkingDirectory $bot -PassThru

# ---------------------------------------------------------------- tunel
$log = Join-Path $env:TEMP 'financas-tunel.log'
if (Test-Path $log) { Remove-Item $log -Force }
$abertos += Start-Process -FilePath $cf -ArgumentList 'tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:8080' `
    -RedirectStandardError $log -WindowStyle Minimized -PassThru

Write-Host ''
Write-Host '  Abrindo o tunel publico...' -ForegroundColor Cyan
$url = $null
for ($i = 0; $i -lt 40 -and -not $url; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $log) {
        $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue |
             Select-Object -First 1
        if ($m) { $url = $m.Matches[0].Value }
    }
}

Write-Host ''
Write-Host '  ==========================================================' -ForegroundColor Green
if ($url) {
    Write-Host "  Webhook para colar no Twilio / Meta:" -ForegroundColor Green
    Write-Host "      $url/webhook" -ForegroundColor White
} else {
    Write-Host "  Nao consegui ler o endereco do tunel. Veja: $log" -ForegroundColor Yellow
}
Write-Host ''
Write-Host '  Site:  http://127.0.0.1:8777' -ForegroundColor Green
Write-Host '         Ajustes > Bot do WhatsApp:'
Write-Host '           Endereco: http://127.0.0.1:8080'
Write-Host "           Token:    $token"
Write-Host ''
Write-Host "  Numeros liberados: $numeros"
if ($numeros -match '55439999900') {
    Write-Host '  ATENCAO: sao os numeros de teste. Troque pelos de voces no bot\.env' -ForegroundColor Yellow
}
Write-Host '  ==========================================================' -ForegroundColor Green
Write-Host ''
Write-Host '  O endereco do tunel muda toda vez que este script roda.'
Write-Host ''
if ($url) { Set-Clipboard -Value "$url/webhook"; Write-Host '  (o endereco do webhook ja foi copiado)' -ForegroundColor DarkGray }
Read-Host '  Enter para desligar tudo (site, bot e tunel)'

# encerra so o que este script abriu
foreach ($p in $abertos) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }
