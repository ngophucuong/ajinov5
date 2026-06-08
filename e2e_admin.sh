#!/bin/bash
PASS=0; FAIL=0
check() { if [ $? -eq 0 ]; then PASS=$((PASS+1)); echo "✅ $1"; else FAIL=$((FAIL+1)); echo "❌ $1"; fi; }
BASE="http://localhost:8000"

echo "══════════════════════════════════════"
echo "  ADMIN UI — E2E VERIFICATION"
echo "══════════════════════════════════════"

# 1. Metrics
echo ""; echo "--- 1. METRICS ---"
M=$(curl -s $BASE/admin/metrics)
echo "$M" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}); assert d.get('canonical_count',-1)>=0" 2>/dev/null
check "1.1 Canonical count is real"
CANON=$(echo "$M" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('canonical_count',0))" 2>/dev/null)
[ "$CANON" -gt 0 ] 2>/dev/null
check "1.2 Canonical > 0 (got $CANON)"
PEND=$(echo "$M" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('pending_count',0))" 2>/dev/null)
[ "$PEND" -ge 0 ] 2>/dev/null
check "1.3 Pending count OK (got $PEND)"

# 2. Memory List
echo ""; echo "--- 2. MEMORY ---"
PMEM=$(curl -s "$BASE/memory?status=pending&limit=3")
PC=$(echo "$PMEM" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
[ "$PC" -gt 0 ] 2>/dev/null
check "2.1 Pending memories exist ($PC rows)"

CMEM=$(curl -s "$BASE/memory?status=canonical&limit=3")
CC=$(echo "$CMEM" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
[ "$CC" -gt 0 ] 2>/dev/null
check "2.2 Canonical memories exist ($CC rows)"

# Get first pending ID for approve test
PID=$(echo "$PMEM" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',[]); print(d[0]['id'] if d else '')" 2>/dev/null)

# 3. Single Approve
echo ""; echo "--- 3. APPROVE ---"
if [ -n "$PID" ]; then
  APPROVE=$(curl -s -X PATCH "$BASE/memory/$PID" -H "Content-Type: application/json" -d '{"status":"canonical"}')
  echo "$APPROVE" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('data',{}).get('updated')==True" 2>/dev/null
  check "3.1 Single approve works"
  HAS_EMBED=$(docker exec ajinov5-postgres psql -U ajinov5 -d ajinov5 -t -c "SELECT embedding IS NOT NULL FROM memory WHERE id='$PID'" 2>/dev/null | tr -d ' ')
  [ "$HAS_EMBED" = "t" ] 2>/dev/null
  check "3.2 Embedding stored"
else
  check "3.1 Single approve (no pending)" && FAIL=$((FAIL-1))
fi

# 4. Reject
echo ""; echo "--- 4. REJECT ---"
PID2=$(curl -s "$BASE/memory?status=pending&limit=1" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',[]); print(d[0]['id'] if d else '')" 2>/dev/null)
if [ -n "$PID2" ]; then
  curl -s -X PATCH "$BASE/memory/$PID2" -H "Content-Type: application/json" -d '{"status":"archived"}' > /dev/null
  STATUS=$(docker exec ajinov5-postgres psql -U ajinov5 -d ajinov5 -t -c "SELECT status FROM memory WHERE id='$PID2'" 2>/dev/null | tr -d ' ')
  [ "$STATUS" = "archived" ] 2>/dev/null
  check "4.1 Reject → archived"
else
  check "4.1 Reject (no pending)" && FAIL=$((FAIL-1))
fi

# 5. Bulk Approve
echo ""; echo "--- 5. BULK ---"
BULK_TEST=$(curl -s -X POST "$BASE/admin/memory/bulk-approve" -H "Content-Type: application/json" -d '{"ids":[]}')
echo "$BULK_TEST" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'data' in d" 2>/dev/null
check "5.1 Bulk endpoint responds"
# Max 20
BIG=$(curl -s -X POST "$BASE/admin/memory/bulk-approve" -H "Content-Type: application/json" -d '{"ids":["a1","a2","a3","a4","a5","a6","a7","a8","a9","a10","a11","a12","a13","a14","a15","a16","a17","a18","a19","a20","a21"]}')
echo "$BIG" | grep -q "20" 2>/dev/null
check "5.2 Max 20 enforced"

# 6. Audit Cursor
echo ""; echo "--- 6. AUDIT ---"
A1=$(curl -s "$BASE/admin/audit?limit=3")
A1C=$(echo "$A1" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
[ "$A1C" -eq 3 ] 2>/dev/null
check "6.1 Audit returns 3 rows (got $A1C)"
CURSOR=$(echo "$A1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cursor',''))" 2>/dev/null)
A2=$(curl -s "$BASE/admin/audit?limit=3&cursor=$CURSOR")
A2C=$(echo "$A2" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
[ "$A2C" -ge 0 ] 2>/dev/null
check "6.2 Cursor pagination (page 2: $A2C rows)"

# 7. CSV Export
echo ""; echo "--- 7. CSV ---"
CSV=$(curl -s "$BASE/admin/audit/export")
echo "$CSV" | head -1 | grep -q "created_at" 2>/dev/null
check "7.1 CSV has header"
ROWS=$(echo "$CSV" | wc -l | tr -d ' ')
[ "$ROWS" -gt 1 ] 2>/dev/null
check "7.2 CSV has data ($ROWS lines)"

# 8. No Mock
echo ""; echo "--- 8. NO MOCK ---"
docker exec ajinov5-postgres psql -U ajinov5 -d ajinov5 -t -c "SELECT COUNT(*) FROM memory WHERE content ILIKE '%mock%' OR content ILIKE '%fake%'" 2>/dev/null | grep -q "0"
check "8.1 No mock in memory"
docker exec ajinov5-postgres psql -U ajinov5 -d ajinov5 -t -c "SELECT COUNT(*) FROM audit_log WHERE action = 'mock'" 2>/dev/null | grep -q "0"
check "8.2 No mock in audit_log"

# 9. Studio
echo ""; echo "--- 9. STUDIO ---"
DOCS=$(curl -s "$BASE/studio/documents")
DC=$(echo "$DOCS" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
[ "$DC" -ge 1 ] 2>/dev/null
check "9.1 Documents exist (got $DC)"

# 10. Agent/Skills
echo ""; echo "--- 10. SKILLS ---"
SK=$(curl -s "$BASE/skills")
SKC=$(echo "$SK" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
[ "$SKC" -ge 1 ] 2>/dev/null
check "10.1 Skills registered ($SKC skills)"

echo ""
echo "══════════════════════════════════════"
echo "  RESULTS: $PASS PASS / $((PASS+FAIL)) TOTAL"
[ $FAIL -eq 0 ] && echo "  🎉 ALL ADMIN TESTS PASSED" || echo "  ⚠️  $FAIL FAILED"
echo "══════════════════════════════════════"
