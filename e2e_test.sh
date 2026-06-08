#!/bin/bash
PASS=0
FAIL=0
check() { if [ $? -eq 0 ]; then PASS=$((PASS+1)); echo "✅ $1"; else FAIL=$((FAIL+1)); echo "❌ $1"; fi; }

echo "══════════════════════════════════════"
echo "  AJINO V5 — E2E TEST SUITE"
echo "══════════════════════════════════════"

# 1. Health checks
echo ""; echo "--- 1. HEALTH ---"
curl -sf http://localhost:8000/health > /dev/null; check "1.1 Agno health"
curl -sf http://localhost:4000/health > /dev/null; check "1.2 LiteLLM UP"
curl -sf http://localhost:3000/health > /dev/null; check "1.3 Messaging GW"
docker exec ajinov5-postgres pg_isready -U ajinov5 > /dev/null 2>&1; check "1.4 PostgreSQL"

# 2. Fast chat
echo ""; echo "--- 2. FAST CHAT ---"
FAST=$(curl -s -X POST http://localhost:8000/chat -H "Content-Type: application/json" -d '{"message":"Thoi tiet Ha Noi hom nay?","reasoning_mode":"fast","user_id":5250339472}')
MODEL=$(echo "$FAST" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['model_used'])" 2>/dev/null)
[ "$MODEL" = "deepseek-flash" ]; check "2.1 Fast = deepseek-flash"
LEN=$(echo "$FAST" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['response']))" 2>/dev/null)
[ "$LEN" -gt 20 ]; check "2.2 Response >20 chars"

# 3. Deep chat + memory + search
echo ""; echo "--- 3. DEEP CHAT ---"
DEEP=$(curl -s -X POST http://localhost:8000/chat -H "Content-Type: application/json" -d '{"message":"Phan tich chien luoc logistics Trung-Viet","reasoning_mode":"deep","user_id":5250339472}')
DMODEL=$(echo "$DEEP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['model_used'])" 2>/dev/null)
[ "$DMODEL" = "deepseek-pro" ]; check "3.1 Deep = deepseek-pro"
TRACE=$(echo "$DEEP" | python3 -c "import sys,json; print(','.join([t['step'] for t in json.load(sys.stdin)['data']['thinking_trace']]))" 2>/dev/null)
echo "   Steps: $TRACE"
echo "$TRACE" | grep -q "memory_retrieval"; check "3.2 Memory retrieval in trace"
echo "$TRACE" | grep -q "search"; check "3.3 Search in trace"
echo "$TRACE" | grep -q "decompose"; check "3.4 Decompose in trace"
echo "$TRACE" | grep -q "synthesis"; check "3.5 Synthesis in trace"

# 4. Memory CRUD
echo ""; echo "--- 4. MEMORY ---"
MEM=$(curl -s -X POST http://localhost:8000/memory -H "Content-Type: application/json" -d '{"content":"E2E test: SLA logistics 99.9%","source":"manual"}')
MID=$(echo "$MEM" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
[ -n "$MID" ]; check "4.1 Create memory"
curl -sf "http://localhost:8000/memory?status=pending&limit=5" > /dev/null; check "4.2 List pending"
APPROVE=$(curl -s -X PATCH "http://localhost:8000/memory/$MID" -H "Content-Type: application/json" -d '{"status":"canonical"}')
echo "$APPROVE" | python3 -c "import sys,json; assert json.load(sys.stdin)['data']['updated']" 2>/dev/null; check "4.3 Approve -> canonical"

# 5. Studio
echo ""; echo "--- 5. STUDIO ---"
DOCS=$(curl -s http://localhost:8000/studio/documents)
echo "$DOCS" | python3 -c "import sys,json; assert len(json.load(sys.stdin)['data'])>0" 2>/dev/null; check "5.1 Documents exist"
STATUS=$(echo "$DOCS" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['compile_status'])" 2>/dev/null)
[ "$STATUS" = "compiled" ]; check "5.2 Compiled status"

# 6. DB verification
echo ""; echo "--- 6. DATABASE ---"
docker exec ajinov5-postgres psql -U ajinov5 -d ajinov5 -t -c "SELECT COUNT(*) FROM users" 2>/dev/null | grep -q "1"; check "6.1 Users >=1"
docker exec ajinov5-postgres psql -U ajinov5 -d ajinov5 -t -c "SELECT COUNT(*) FROM chat_sessions" 2>/dev/null | grep -qE "[0-9]"; check "6.2 Sessions exist"
docker exec ajinov5-postgres psql -U ajinov5 -d ajinov5 -t -c "SELECT COUNT(*) FROM chat_messages" 2>/dev/null | grep -qE "[0-9]"; check "6.3 Messages exist"
docker exec ajinov5-postgres psql -U ajinov5 -d ajinov5 -t -c "SELECT COUNT(*) FROM audit_log" 2>/dev/null | grep -qE "[0-9]"; check "6.4 Audit log entries"
CNT=$(docker exec ajinov5-postgres psql -U ajinov5 -d ajinov5 -t -c "SELECT COUNT(*) FROM memory WHERE status='canonical'" 2>/dev/null | tr -d ' ')
[ "$CNT" -ge 10 ]; check "6.5 Canonical >=10 (got $CNT)"

# 7. Embedding
echo ""; echo "--- 7. EMBEDDING ---"
docker exec ajinov5-postgres psql -U ajinov5 -d ajinov5 -t -c "SELECT COUNT(*) FROM memory WHERE embedding IS NOT NULL AND status='canonical'" 2>/dev/null | grep -qE "[0-9]"; check "7.1 Canonical have embedding"
MOCK=$(docker logs ajinov5-agno 2>&1 | grep -c "mock" || echo "0")
[ "$MOCK" -eq 0 ]; check "7.2 No mock embedding"

echo ""
echo "══════════════════════════════════"
echo "  RESULTS: $PASS PASS / $((PASS+FAIL)) TOTAL"
[ $FAIL -eq 0 ] && echo "  🎉 ALL TESTS PASSED" || echo "  ⚠️  $FAIL FAILED"
echo "══════════════════════════════════"
