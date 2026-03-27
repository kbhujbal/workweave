#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$ROOT_DIR/data"

# Load .env file if it exists
if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    source "$ROOT_DIR/.env"
    set +a
    echo "[env] Loaded .env file"
else
    echo "[env] No .env file found — using environment variables"
fi

echo "============================================"
echo "  Engineering Impact Dashboard - WorkWeave"
echo "============================================"
echo ""

# Step 1: Fetch GitHub data (Go)
echo "[1/3] Fetching GitHub data..."
cd "$ROOT_DIR/backend-go"
go run main.go
echo ""

# Step 2: Score engineers (Python)
echo "[2/3] Scoring engineers..."
cd "$ROOT_DIR/logic-python"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    source venv/bin/activate
    pip install -q -r requirements.txt
else
    source venv/bin/activate
fi
python3 scorer.py
echo ""

# Step 3: Copy data and launch frontend
echo "[3/3] Launching dashboard..."
cp "$DATA_DIR/ranked_engineers.json" "$ROOT_DIR/frontend-react/public/ranked_engineers.json"
cd "$ROOT_DIR/frontend-react"
npm run dev
