# Competitive Intelligence

> Ongoing notes on competing solutions in the OpenClaw / AI Agent observability space.
> Use these to sharpen TMA1's positioning, dashboard design, and SKILL.md copy.

---

## SelectDB / AI Observe Stack

**Article**: https://www.selectdb.com/blog/1635  
**Repo**: https://github.com/velodb/ai-observe-stack  
**Published**: 2026-03-04  
**Stack**: OTel Collector + Apache Doris + Grafana + custom Doris App Grafana plugin

### What they built

An OpenClaw observability system with three pre-built Grafana dashboards:

| Dashboard | What it shows |
|-----------|---------------|
| Security & Audit | Dangerous shell commands, prompt injection detection, outbound data flow, sensitive file access |
| Cost & Efficiency | Token usage over time, context window growth per session, per-question cost breakdown |
| Agent Behavior | Tool call distribution, P95 latency, complete conversation flow log |

Also includes: Doris App Discover (Kibana-style log exploration), Doris App Trace (waterfall view).

### Their actual findings from a real OpenClaw instance (7-day audit)

These numbers are compelling marketing material — and also validate TMA1's security angle:

- **31 shell command executions** (`exec` tool), including file ops and network requests
- **40 external website visits**, some containing prompt injection markers
- **One user question → 19 LLM calls → 7.84M tokens** (context window snowball effect)
- Detected `"ignore previous instructions"` patterns in content returned from external pages
- `browser` tool: most-called tool (40 calls); `web_fetch`: largest share of total calls

### Their technical setup (important gaps TMA1 avoids)

They use the **community OTel plugin** (`henrikrexed/openclaw-observability-plugin`), NOT
OpenClaw's built-in `diagnostics-otel`. This means:
- Requires `npm install` of a third-party plugin
- Requires a **separate Docker container** for log collection (filelog receiver)
- Their endpoint is `http://127.0.0.1:4318` (standard OTel HTTP port)

TMA1 uses OpenClaw's **built-in** `diagnostics-otel` (v2026.2+):
- Zero extra dependencies
- No Docker container for logs
- Endpoint: `http://localhost:14000/v1/otlp` (confirmed in AGENTS.md)

### Why TMA1 wins on distribution

| | SelectDB AI Observe Stack | TMA1 |
|---|---|---|
| Install | `git clone` + `docker compose up -d` (3+ minutes) | `curl install.sh \| sh` |
| Dependencies | Docker, OTel Collector, Doris, Grafana | Nothing (GreptimeDB bundled) |
| Login | Grafana admin/admin | None |
| Cloud push | Upsells to SelectDB Cloud / Aliyun SelectDB | Local only, no upsell |
| OpenClaw integration | Community plugin (npm) + Docker log collector | Built-in `diagnostics-otel` |
| Data ownership | Local or cloud (their choice) | Always local |

---

## Lessons for TMA1

### 1. Add security narrative to SKILL.md and landing page

Current TMA1 triggers: "how much am I spending", "track token usage", "local observability"  
**Missing triggers**: "what is my agent executing", "did my agent access sensitive files",
"prompt injection risk", "what commands did my agent run"

The security angle ("you have no idea what your agent is doing with your permissions")
is a stronger emotional hook than cost tracking for many OpenClaw users.

### 2. Dashboard three-panel structure to adopt

SelectDB's three-panel framework maps well to TMA1's planned panels:

**Panel A — Security & Audit** (add this; TMA1 doesn't have it yet)
- Dangerous command count (detect `exec` calls with `rm`, `sudo`, `curl | sh`, etc.)
- Prompt injection events (scan log content for injection patterns)
- Outbound action log (emails sent, messages sent, external API calls)
- Sensitive file access (`.ssh/`, `.env`, `credentials.*`)

**Panel B — Cost & Efficiency** (TMA1 already has this planned)
- Token usage over time
- Context window growth per session → the "snowball" chart is highly shareable
- Per-question cost breakdown (most impactful: show cost per individual user message)

**Panel C — Agent Behavior** (TMA1 already has this planned)
- Tool call distribution (which tools, how often, error rate per tool)
- P95 / P99 latency
- Conversation flow log (full message thread, color-coded by role)

### 3. "Per-question cost" is the most intuitive cost visualization

Rather than aggregated totals, show: for each user question, how many LLM calls
it triggered, and what the total token cost was. The discovery that one question
= 19 LLM calls = 7.84M tokens is what makes people actually care.

SQL sketch for TMA1:
```sql
SELECT
    trace_id,
    COUNT(*) AS llm_calls,
    SUM("span_attributes.gen_ai.usage.input_tokens") AS input_tokens,
    SUM("span_attributes.gen_ai.usage.output_tokens") AS output_tokens,
    MAX(timestamp) - MIN(timestamp) AS duration
FROM opentelemetry_traces
WHERE "span_attributes.gen_ai.system" IS NOT NULL
GROUP BY trace_id
ORDER BY input_tokens DESC
LIMIT 20;
```

### 4. Context window snowball chart is highly shareable

A line chart where each line = one session, X axis = turn number, Y axis = input tokens.
Users instantly understand why their bill is so high when they see tokens doubling each turn.
This is a natural social share / screenshot moment.

### 5. Their security risk taxonomy is worth reusing

They classify dangerous commands into:
- `DESTRUCTIVE` — `rm -rf`, `dd`, etc.
- `PRIVILEGE_ESCALATION` — `sudo`, `chmod 777`
- `DATA_EXFIL` — `scp`, `rsync` to remote
- `CREDENTIAL_ACCESS` — reading `.ssh/`, `.env`, `credentials.*`

And injection patterns:
- `INJECTION_PATTERN` — "ignore previous instructions"
- `ROLE_HIJACK` — "you are now", "act as"
- `HIDDEN_INSTRUCTION` — encoded/hidden text
- `JAILBREAK` — "DAN mode", "developer mode"

These could become columns in a TMA1 security events table derived from log content.

---

## Other competitors (from earlier research)

| Competitor | Approach | Gap vs TMA1 |
|---|---|---|
| SigNoz | Full OTel tutorial → SigNoz Cloud | Cloud account required, complex setup |
| Opik (Comet) | Native `opik-openclaw` plugin, full lifecycle capture | Cloud, proprietary |
| LangWatch | OTel → LangWatch | Cloud |
| henrikrexed/openclaw-observability-plugin | Open-source OTel plugin (span tree) | Requires OTel Collector + separate storage |
| knostic/openclaw-telemetry | JSONL + tamper-proof hash chains | Security-focused but no dashboard |
| Orq.ai | Proxy-based (OpenAI-compatible router) | Changes network path |

**Common pattern**: all require either a cloud account, Docker, or complex self-hosted stack.
TMA1 is the only option that is: one command + local + SQL-queryable + no login.

---

## What to watch

- `github.com/velodb/ai-observe-stack` — track their dashboard panel evolution
- Whether SelectDB publishes more OpenClaw-specific content (they're actively investing here)
- Whether OpenClaw team officially endorses any observability solution
- New OTel semantic conventions for AI agents (beyond `gen_ai.*`)
