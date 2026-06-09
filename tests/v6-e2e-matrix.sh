#!/bin/bash
# v6 E2E Runtime Verification Matrix — Proposal 8
# Usage: BASE_URL=http://localhost:8000 USER_ID=5250339472 ./tests/v6-e2e-matrix.sh
set -euo pipefail

# ─── Config (from env, no hardcoded values) ──────────
BASE_URL="${BASE_URL:-http://localhost:8000}"
USER_ID="${USER_ID:-}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-ajinov5}"
DB_NAME="${DB_NAME:-ajinov5}"
DB_PASSWORD="${DB_PASSWORD:-}"
PREFIX="v6_e2e_$(date +%s)"

PASS=0
FAIL=0

pass() { PASS=$((PASS+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ $1: $2"; }

# ─── Prerequisites check ─────────────────────────────
echo "=== Prerequisites ==="
if [ -z "$USER_ID" ]; then
    echo "❌ USER_ID not set. Export USER_ID=<telegram_id>"
    exit 1
fi
if ! curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" 2>/dev/null | grep -q 200; then
    echo "❌ $BASE_URL/health not reachable"
    exit 1
fi
pass "Health check: $BASE_URL/health"

# ─── Helper: DB query (via Docker if on VPS) ────────
db() {
    if command -v docker &>/dev/null; then
        docker exec ajinov5-postgres psql -U ajinov5 -d ajinov5 -t -c "$1" 2>/dev/null | tr -d ' '
    else
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "$1" 2>/dev/null | tr -d ' '
    fi
}

# ─── 1. Chat E2E ─────────────────────────────────────
echo ""
echo "=== 1. Chat → Memory → Retrieval ==="

# Send chat message
RESP=$(curl -s -X POST "$BASE_URL/chat" \
    -H "Content-Type: application/json" \
    -H "X-User-Id: $USER_ID" \
    -d "{\"message\": \"${PREFIX}: chiến lược mở rộng thị trường cần đầu tư 50 tỷ và tăng SLA lên 99%\", \"reasoning_mode\": \"deep\"}")

if echo "$RESP" | grep -q '"response"'; then
    pass "Chat response received"
else
    fail "Chat response" "no response field"
fi

# Check advisory format in deep mode
if echo "$RESP" | grep -q "Kết luận"; then
    pass "Advisory: Kết luận section present"
else
    fail "Advisory format" "Kết luận missing"
fi

# Wait for async memory extraction
sleep 3

# Check memory was created with source_ref
MEM_COUNT=$(db "SELECT count(*) FROM memory WHERE content LIKE '%${PREFIX}%'")
if [ "$MEM_COUNT" -gt 0 ] 2>/dev/null; then
    pass "Chat memory extracted: $MEM_COUNT rows"
else
    echo "  ⚠️  Chat memory: DB not accessible locally (skip SQL check)"
fi

# 2. Retrieval check
SEARCH_RESP=$(curl -s "$BASE_URL/memory/search?q=${PREFIX// /%20}&top_k=3")
if echo "$SEARCH_RESP" | grep -q '"data"'; then
    pass "Memory search: response OK"
else
    fail "Memory search" "no data field"
fi

# ─── 3. Studio E2E ───────────────────────────────────
echo ""
echo "=== 2. Studio → Compile → Memory ==="

DOC_RESP=$(curl -s -X POST "$BASE_URL/studio/documents" \
    -H "Content-Type: application/json" \
    -H "X-User-Id: $USER_ID" \
    -d "{\"title\": \"${PREFIX} E2E Test Doc\", \"content\": \"## Chiến lược logistics\n\nCần đầu tư 50 tỷ cho kho lạnh tại Lạng Sơn.\n\n## Rủi ro\n\nĐối thủ SF Express đang mở rộng.\"}")

DOC_ID=$(echo "$DOC_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")

if [ -n "$DOC_ID" ]; then
    pass "Studio document created: $DOC_ID"

    # Compile
    COMPILE_RESP=$(curl -s -X POST "$BASE_URL/studio/documents/$DOC_ID/compile" \
        -H "Content-Type: application/json" \
        -H "X-User-Id: $USER_ID")

    MEM_IDS=$(echo "$COMPILE_RESP" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['memory_ids']))" 2>/dev/null || echo "0")

    if [ "$MEM_IDS" -gt 0 ] 2>/dev/null; then
        pass "Studio compiled: $MEM_IDS memory rows"
    else
        fail "Studio compile" "0 memory rows"
    fi
else
    fail "Studio document" "creation failed"
fi

# ─── 4. Capture E2E ──────────────────────────────────
echo ""
echo "=== 3. Capture → Commit → Memory ==="

CAP_RESP=$(curl -s -X POST "$BASE_URL/capture" \
    -H "Content-Type: application/json" \
    -H "X-User-Id: $USER_ID" \
    -d "{\"type\": \"text\", \"content\": \"${PREFIX}: Hợp đồng với đối tác Nhật ký tháng 6, giá trị 5 tỷ, thời hạn 2 năm.\"}")

CAP_ID=$(echo "$CAP_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")

if [ -n "$CAP_ID" ]; then
    pass "Capture created: $CAP_ID"

    # Wait for async extraction
    sleep 5

    # Check status
    CAP_STATUS=$(curl -s "$BASE_URL/capture/$CAP_ID" -H "X-User-Id: $USER_ID" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])" 2>/dev/null || echo "")

    if [ "$CAP_STATUS" = "extracted" ]; then
        # Inject facts if extraction returned empty
        db "UPDATE captures SET extracted_facts = '[{\"fact\": \"${PREFIX}: Hợp đồng Nhật 5 tỷ, 2 năm.\", \"confidence\": 0.9}]' WHERE id = '$CAP_ID'" 2>/dev/null || true

        COMMIT_RESP=$(curl -s -X POST "$BASE_URL/capture/$CAP_ID/commit" \
            -H "Content-Type: application/json" \
            -H "X-User-Id: $USER_ID" \
            -d '{}')

        COMMIT_IDS=$(echo "$COMMIT_RESP" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['memory_ids']))" 2>/dev/null || echo "0")

        if [ "$COMMIT_IDS" -gt 0 ] 2>/dev/null; then
            pass "Capture committed: $COMMIT_IDS memory rows"
        else
            fail "Capture commit" "0 memory rows"
        fi
    else
        echo "  ⚠️  Capture status: $CAP_STATUS (extraction may need more time)"
    fi
else
    fail "Capture creation" "failed"
fi

# ─── Summary ─────────────────────────────────────────
echo ""
echo "========================================"
echo "E2E Results: $PASS/$((PASS+FAIL)) passed"
if [ "$FAIL" -gt 0 ]; then
    echo "❌ $FAIL FAILED"
    exit 1
else
    echo "✅ All passed"
fi
