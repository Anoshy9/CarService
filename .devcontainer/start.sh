#!/bin/bash
cd /workspaces/*/ 2>/dev/null || cd "$(dirname "$0")/.."
export PYTHONPATH="$PWD:$PYTHONPATH"
echo "🚗 Démarrage du Carnet d'Entretien Citroën C2 1.4 HDi 2009..."
echo ""
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
