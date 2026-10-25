#!/bin/bash
cd "$(dirname "$0")"
export PYTHONPATH="$PWD:$PYTHONPATH"
echo "🚗 Démarrage du Carnet d'Entretien Automobile..."
echo "   Citroën C2 · 1.4 HDi · 2009"
echo "   Interface web : http://localhost:8000"
echo ""
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
