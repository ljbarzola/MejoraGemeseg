# ============================================
# GEMESEG - Iniciar Docker + PostgreSQL
# Ejecutar como ADMINISTRADOR
# ============================================

Write-Host "=== GEMESEG: Iniciando Docker y PostgreSQL ===" -ForegroundColor Cyan

# 1. Iniciar servicio Docker (requiere admin)
Write-Host "[1/5] Iniciando servicio Docker..." -ForegroundColor Yellow
Start-Service com.docker.service -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5

# 2. Iniciar Docker Desktop si no esta corriendo
$dockerProcs = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
if (-not $dockerProcs) {
    Write-Host "[2/5] Abriendo Docker Desktop..." -ForegroundColor Yellow
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
} else {
    Write-Host "[2/5] Docker Desktop ya esta corriendo" -ForegroundColor Green
}

# 3. Esperar a que Docker responda
Write-Host "[3/5] Esperando a que Docker este listo (puede tardar 1-2 min)..." -ForegroundColor Yellow
$timeout = 120
$elapsed = 0
while ($elapsed -lt $timeout) {
    $test = docker ps 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Docker esta listo!" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 5
    $elapsed += 5
    Write-Host "  Esperando... ($elapsed s)" -ForegroundColor DarkGray
}

if ($elapsed -ge $timeout) {
    Write-Host "ERROR: Docker no respondio en $timeout segundos." -ForegroundColor Red
    Write-Host "Abre Docker Desktop manualmente y vuelve a ejecutar este script." -ForegroundColor Red
    exit 1
}

# 4. Levantar PostgreSQL
Write-Host "[4/5] Levantando PostgreSQL..." -ForegroundColor Yellow
Set-Location "C:\Users\leidy\Documents\GEMESEG\Gemeseg Mejora"
docker compose up -d db

# 5. Esperar a que PostgreSQL este listo
Write-Host "[5/5] Esperando a que PostgreSQL acepte conexiones..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Verificar puerto 5432
$port = netstat -ano | findstr :5432
if ($port) {
    Write-Host ""
    Write-Host "=== PostgreSQL esta corriendo en puerto 5432 ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "Ahora ejecuta:" -ForegroundColor Cyan
    Write-Host '  cd "C:\Users\leidy\Documents\GEMESEG\Gemeseg Mejora\backend"' -ForegroundColor White
    Write-Host '  npx prisma migrate dev --name add-auth-password' -ForegroundColor White
    Write-Host '  npm run start:dev' -ForegroundColor White
} else {
    Write-Host "PostgreSQL puede estar arrancando, espera 10s mas y verifica con: netstat -ano | findstr :5432" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Listo!" -ForegroundColor Green
