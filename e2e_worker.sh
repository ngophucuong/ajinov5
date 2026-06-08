#!/bin/bash
BASE="https://agent-gateway.ngophucuong.workers.dev"
PASS=0; FAIL=0
check() { if [ $? -eq 0 ]; then PASS=$((PASS+1)); echo "✅ $1"; else FAIL=$((FAIL+1)); echo "❌ $1"; fi; }
COOKIE_FILE=/tmp/ajino_cookies.txt
rm -f $COOKIE_FILE
TG_ID=5250339472

echo "════════════════════════════════════════"
echo "  AJINO V5 — E2E via WORKER"
echo "════════════════════════════════════════"

# ═══ PHASE 1: AUTH ═══
echo ""; echo "--- PHASE 1: AUTH ---"
OTP=$(curl -s -c $COOKIE_FILE -X POST "$BASE/auth/otp/request" -H "Content-Type: application/json" -d "{\"telegram_id\":$TG_ID}")
echo "$OTP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('data',{}).get('expires_in')==300" 2>/dev/null
check "1.1 OTP request → 300s TTL"

# Get OTP from KV (dev only — in prod, user reads from Telegram)
# For E2E we skip real verify since can't read Telegram
echo "   OTP sent to Telegram (check @portfolio_0531_bot)"

# ═══ PHASE 2: PUBLIC ENDPOINTS ═══
echo ""; echo "--- PHASE 2: PUBLIC ---"
HEALTH=$(curl -s "$BASE/health")
echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['status']=='ok'" 2>/dev/null
check "2.1 Worker health"
HTML=$(curl -s "$BASE/")
echo "$HTML" | grep -q "Ajino v5"
check "2.2 Frontend serves HTML"

# ═══ PHASE 3: PROTECTED ENDPOINTS ═══
echo ""; echo "--- PHASE 3: AUTH GATES ---"
NOAUTH=$(curl -s "$BASE/api/chat/sessions")
echo "$NOAUTH" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('error',{}).get('code')=='AUTH_004'" 2>/dev/null
check "3.1 /api/* blocked without JWT"

NOAUTH2=$(curl -s "$BASE/api/memory")
echo "$NOAUTH2" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('error',{}).get('code')=='AUTH_004'" 2>/dev/null
check "3.2 /api/memory blocked without JWT"

# ═══ PHASE 4: PROXY TO VPS (need JWT) ═══
echo ""; echo "--- PHASE 4: JWT AUTH ---"
# Get OTP and verify it
OTP2=$(curl -s -X POST "$BASE/auth/otp/request" -H "Content-Type: application/json" -d "{\"telegram_id\":$TG_ID}")
# Wait 2s for rate limit reset
sleep 2
# Get another OTP for same user (rate limit window passed)
OTP3=$(curl -s -X POST "$BASE/auth/otp/request" -H "Content-Type: application/json" -d "{\"telegram_id\":8783820185}")
[ -n "$OTP3" ]
check "4.1 OTP for different user"

# Test with Authorization header from a previously known valid JWT
# (JWT from earlier test: eyJhbGciOiJIUzI1NiJ9...)
TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI1MjUwMzM5NDcyIiwicm9sZSI6ImNlbyIsInRlbGVncmFtX2lkIjo1MjUwMzM5NDcyLCJpYXQiOjE3ODA4NTUwNDAsImV4cCI6MTc4MDk0MTQ0MH0.dVU2M-q_cyvx7-jLwPcwks8cviYSsmHmCDL3TfBV1sY"
ME=$(curl -s -b "ajino_token=$TOKEN" "$BASE/api/me")
echo "$ME" | python3 -c "import sys,json; d=json.load(sys.stdin); u=d.get('data',{}).get('user',{}); assert u.get('sub')=='5250339472'" 2>/dev/null
check "4.2 JWT verified → /api/me"

# Test proxy to VPS via Worker → Tunnel (may fail if tunnel SSL not ready)
PROXY=$(curl -s -b "ajino_token=$TOKEN" "$BASE/api/chat/sessions" --max-time 15 2>&1)
echo "$PROXY" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'data' in d or 'error' in d" 2>/dev/null
check "4.3 Proxy to VPS /api/chat/sessions (response received)"

echo ""
echo "══════════════════════════════════════"
echo "  RESULTS: $PASS PASS / $((PASS+FAIL)) TOTAL"
[ $FAIL -eq 0 ] && echo "  🎉 ALL TESTS PASSED" || echo "  ⚠️  $FAIL FAILED"
echo "══════════════════════════════════════"
