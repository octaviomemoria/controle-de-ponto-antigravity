#!/bin/bash
set -e

echo "=== Verificacao de Producao ==="
echo

echo "[1/3] Verificando typecheck..."
npm run typecheck:web || { echo "Typecheck falhou!"; exit 1; }

echo "[2/3] Executando build..."
npm run build:web || { echo "Build falhou!"; exit 1; }

echo "[3/3] Executando smoke test da API..."
npm run smoke:api || { echo "Smoke test da API falhou!"; exit 1; }

echo
echo "=== Verificacao concluida com sucesso! ==="
