# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TMA1 is local-first LLM agent observability, powered by GreptimeDB.
- **Traces** are the core: GenAI / OpenClaw spans carry model, tokens, latency, status
- **Metrics** are derived from traces via Flow engine (no double-writing)
- **Logs** carry conversation content (conversation replay)
- **Cross-signal JOIN**: `trace_id` connects spans to conversations

Named after TMA-1 (Tycho Magnetic Anomaly-1) from *2001: A Space Odyssey*: the monolith silently recording everything until you dig it out.

## Build & Test Commands

```bash
# Build
make build           # Build binary → server/bin/tma1-server
make build-linux     # Cross-compile for Linux amd64
make build-windows   # Cross-compile for Windows amd64

# Development
make run             # Build and run locally
make dev             # Watch mode: rebuild + restart on file changes (requires fswatch)

# Testing & Linting
make vet             # Run go vet
make lint            # Run golangci-lint (requires golangci-lint v2)
make lint-js         # Run ESLint on dashboard JS
make test            # Run all tests with race detector

# Run single test file
cd server && go test -race -v ./internal/handler/handler_test.go
cd server && go test -race -run TestSpecificName ./internal/config/

# Full verification (before commit)
cd server && go vet ./... && go test -race -count=1 ./... && CGO_ENABLED=0 go build -o /dev/null ./cmd/tma1-server
```

## Architecture

```
Agent (Claude Code / Codex / OpenClaw / any GenAI app)
    │  OTLP/HTTP → http://localhost:14318/v1/otlp
    │  Hook events → http://localhost:14318/api/hooks (Claude Code)
    │  JSONL transcripts → ~/.claude/projects/ (CC) / ~/.codex/sessions/ (Codex)
    ▼
tma1-server  port 14318
    │  reverse-proxies OTLP to GreptimeDB (port 14000)
    │  auto-injects x-greptime-pipeline-name header for trace requests
    │  receives hook events → tma1_hook_events + SSE broadcast
    │  watches JSONL transcripts → tma1_messages
    ▼
GreptimeDB  (managed by tma1-server)
    │  Flow engine → tma1_*_1m aggregation tables
    │  HTTP SQL API  port 14000
    ▼
Browser dashboard (embedded single HTML file)
```

## Key Design Decisions

1. **No Docker required** — GreptimeDB downloaded as static binary to `~/.tma1/bin/`
2. **No Grafana** — Dashboard is single HTML file embedded via `embed.FS`
3. **Thin OTLP proxy** — tma1-server proxies `/v1/otlp/*` to GreptimeDB with header injection
4. **No cloud** — All data stays on user's machine
5. **No double-writing** — Flow engine derives metrics from traces
6. **Wide events** — `trace_id` joins spans + conversations

## Module Map

| Path | Role |
|------|------|
| `server/cmd/tma1-server/` | Entry point + embedded FS mount |
| `server/internal/config/` | Env var config + settings persistence |
| `server/internal/install/` | Download and verify GreptimeDB binary |
| `server/internal/greptimedb/` | Process manager + Flow init + session tables |
| `server/internal/handler/` | HTTP handlers: /health, /status, /api/query, /api/hooks, /v1/otlp/* |
| `server/internal/hooks/` | Hook script installer for Claude Code |
| `server/internal/transcript/` | JSONL watcher (CC) + Codex session parser |
| `server/web/` | Embedded dashboard (HTML + JS + CSS) |
| `server/web/js/` | View-specific JS: claude-code.js, codex.js, openclaw.js, sessions.js, prompts.js |

## Go Conventions

- **Layering**: Strict `handler → service` (no ORM, raw HTTP)
- **Formatting**: `gofmt` only
- **Imports**: Three groups — stdlib, external, internal
- **Naming**: `PascalCase` exported, `camelCase` unexported. Acronyms all-caps: `apiURL`, `greptimeDB`
- **Errors**: Wrap with `fmt.Errorf("context: %w", err)`
- **Shutdown**: Graceful via `context.WithCancel` + `signal.Notify`

## Important Tables

**From Claude Code OTel metrics** (auto-created):
- `claude_code_token_usage_tokens_total`, `claude_code_cost_usage_USD_total`
- `claude_code_active_time_seconds_total`, `claude_code_session_count_total`
- `opentelemetry_logs` (api_request, tool_result, user_prompt events)
- `opentelemetry_traces` (when enhanced telemetry enabled)

**From hooks + JSONL transcripts**:
- `tma1_hook_events` — All 27 CC hook types + Codex parsing. Columns: `conversation_id`, `permission_mode`, `metadata` (JSON)
- `tma1_messages` — Conversation content with token usage. FULLTEXT INDEX on `content`

**Flow aggregations** (derived from traces):
- `tma1_token_usage_1m`, `tma1_cost_1m`, `tma1_latency_1m`, `tma1_status_1m`

**Important**: Trace attributes auto-created as columns with double-quoted names: `"span_attributes.ttft_ms"`, `"span_attributes.gen_ai.usage.input_tokens"`.

Log attributes are JSON — use `json_get_string(log_attributes, 'model')`, not `->` operator.

## Config (Env Vars)

| Variable | Default | Description |
|----------|---------|-------------|
| `TMA1_HOST` | `127.0.0.1` | Bind address |
| `TMA1_PORT` | `14318` | HTTP port |
| `TMA1_DATA_DIR` | `~/.tma1` | Data + binaries directory |
| `TMA1_GREPTIMEDB_VERSION` | `latest` | GreptimeDB version |
| `TMA1_GREPTIMEDB_HTTP_PORT` | `14000` | GreptimeDB HTTP port |
| `TMA1_LOG_LEVEL` | `info` | Log level: debug/info/warn/error |
| `TMA1_DATA_TTL` | `60d` | Default TTL for auto-created tables |
| `TMA1_LLM_API_KEY` | (empty) | Enables prompt evaluation (LLM-as-judge) |
| `TMA1_LLM_PROVIDER` | `anthropic` | LLM provider: anthropic/openai |

Settings in dashboard saved to `~/.tma1/settings.json`. Env vars always override settings file.

## Startup Sequence (main.go)

1. Load config → apply persisted settings (env vars take priority)
2. Ensure GreptimeDB binary present (download if missing)
3. Start GreptimeDB child process
4. Set database TTL, create session tables
5. Seed pricing table, init Flow aggregations (background retry)
6. Install hook script, start transcript watcher + Codex scanner
7. Start HTTP server (dashboard + API proxy)

## Where to Look

| Task | File |
|------|------|
| Entry point / startup | `server/cmd/tma1-server/main.go:27` |
| HTTP routes | `server/internal/handler/handler.go:69` |
| Hook event handler | `server/internal/handler/hooks.go` |
| OTLP proxy with header injection | `server/internal/handler/handler.go:226` |
| Flow SQL definitions | `server/internal/greptimedb/flows.sql` |
| Flow init logic | `server/internal/greptimedb/flows.go` |
| Session tables | `server/internal/greptimedb/process.go:InitSessionTables` |
| Transcript watcher | `server/internal/transcript/watcher.go` |
| Codex parser | `server/internal/transcript/codex.go` |
| Dashboard UI | `server/web/index.html` |
| Sessions view | `server/web/js/sessions.js` (orchestrator) + sessions-{stats,detail,insights,waterfall,timeline}.js |
| Prompt evaluation | `server/web/js/prompts.js` + `server/internal/handler/evaluate.go` |

## What's NOT Here (By Design)

- No memory / RAG features (separate concern)
- No OTel Collector (direct OTLP to GreptimeDB)
- No authentication (local-only tool)
- No multi-tenant support
