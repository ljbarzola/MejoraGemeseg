#!/usr/bin/env bash
# Despliega el frontend a un canal de PREVIEW de Firebase Hosting.
# Genera una URL publica temporal, ideal para probar en el celular sin tocar produccion.
#
# Uso:
#   ./scripts/deploy-preview.sh                 # canal "movil", 7 dias
#   ./scripts/deploy-preview.sh qa 30d          # canal y caducidad a medida
#
# Requisitos (se ejecuta desde TU maquina, no desde el contenedor del agente):
#   1. Node 18+ instalado.
#   2. Estar autenticado:  npx firebase-tools login
#      (o exportar FIREBASE_TOKEN=... si usas un token de CI)
#
# Variable opcional:
#   VITE_API_URL  backend contra el que apunta el preview.
#                 Por defecto usa frontend/.env.production (backend de PRODUCCION).

set -euo pipefail

CHANNEL="${1:-movil}"
EXPIRES="${2:-7d}"
PROJECT="mejora-gemeseg"

cd "$(dirname "$0")/.."

echo "▶ Compilando frontend…"
if [ -n "${VITE_API_URL:-}" ]; then
  echo "  API: $VITE_API_URL (override)"
  ( cd frontend && VITE_API_URL="$VITE_API_URL" npm run build )
else
  echo "  API: la de frontend/.env.production (backend de PRODUCCION)"
  ( cd frontend && npm run build )
fi

echo "▶ Publicando en el canal de preview '$CHANNEL' (caduca en $EXPIRES)…"
npx --yes firebase-tools hosting:channel:deploy "$CHANNEL" \
  --project "$PROJECT" \
  --expires "$EXPIRES"

echo
echo "✅ Listo. Abre en el celular la URL 'Channel URL' que aparece arriba."
echo "   Para retirarlo antes de tiempo:"
echo "   npx firebase-tools hosting:channel:delete $CHANNEL --project $PROJECT"
