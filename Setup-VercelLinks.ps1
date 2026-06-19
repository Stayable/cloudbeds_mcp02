# Setup-VercelLinks.ps1
# Links the Stayable repo folders to their Vercel projects, then pulls the
# middleware env and pushes the Prisma schema to Neon.
# Safe to paste straight into PowerShell from any directory — it cd's itself.

$ErrorActionPreference = 'Continue'

# --- EDIT this if your repo lives elsewhere ---
$repo  = 'C:\Users\Kyle Estocapio\Git-Claude\cloudbeds_mcp02'
$scope = 'stayable-admins-projects'

if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
  Write-Host 'Vercel CLI not found. Install with:  npm i -g vercel' -ForegroundColor Red
  return
}
if (-not (Test-Path $repo)) {
  Write-Host "Repo not found at: $repo  (edit `$repo at the top of this script)" -ForegroundColor Red
  return
}

Write-Host '=== Vercel account ===' -ForegroundColor Cyan
vercel whoami

# folder -> Vercel project name
$links = @(
  @{ Dir = 'middleware';           Project = 'lock-middleware' },
  @{ Dir = 'cloudbeds-mcp-server'; Project = 'cloudbeds-mcp02' },
  @{ Dir = 'client-portal';        Project = 'investor-portal' }
)

foreach ($l in $links) {
  $path = Join-Path $repo $l.Dir
  if (-not (Test-Path $path)) {
    Write-Host "SKIP $($l.Dir) - folder not found" -ForegroundColor Yellow
    continue
  }
  Write-Host "`n=== Linking $($l.Dir) -> $($l.Project) ===" -ForegroundColor Cyan
  Push-Location $path
  vercel link --yes --project $l.Project --scope $scope
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  linked OK" -ForegroundColor Green
  } else {
    Write-Host "  link FAILED (check the project name/scope)" -ForegroundColor Red
  }
  Pop-Location
}

# --- middleware: pull env from Vercel + push Prisma schema to Neon ---
# Pull PRODUCTION env: Neon + secrets live there, not in the (near-empty)
# development environment that `vercel env pull` uses by default.
# Pull into .env (NOT .env.local): the Prisma CLI only auto-loads .env, so
# `prisma db push` can't see DATABASE_URL/_UNPOOLED from .env.local. Next reads
# .env too, so this one file covers both. (.env is gitignored.)
Write-Host "`n=== middleware: env pull (production) + prisma db push ===" -ForegroundColor Cyan
Push-Location (Join-Path $repo 'middleware')
vercel env pull .env --environment=production --yes
if ($LASTEXITCODE -eq 0) {
  if (Select-String -Path .env -Pattern '^DATABASE_URL=' -Quiet) {
    Write-Host "  pulled .env (DATABASE_URL present); pushing schema..." -ForegroundColor Green
    npx prisma db push
  } else {
    Write-Host "  pulled .env but DATABASE_URL is missing - is Neon connected to lock-middleware? Skipping db push." -ForegroundColor Red
  }
} else {
  Write-Host "  env pull failed; skipping db push" -ForegroundColor Red
}
Pop-Location

Write-Host "`nDone." -ForegroundColor Green
Write-Host "Note: lock-app has no Vercel project yet - create it (Root Directory 'lock-app') and connect the SAME Neon DB when we build that app." -ForegroundColor Yellow
