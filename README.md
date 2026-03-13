# TMA1

> *"Your agent runs. TMA1 remembers."*

Local-first LLM observability, powered by [GreptimeDB](https://greptime.com).
Traces, metrics, and conversations — unified in one SQL-queryable engine.
No cloud accounts, no Docker, no Grafana setup required.

Named after TMA-1 (Tycho Magnetic Anomaly-1) from *2001: A Space Odyssey*:
the monolith buried on the moon, silently recording everything until you dig it out.

## Three Pillars → One Engine

- **Traces**: OpenClaw spans (`openclaw.*`) and GenAI spans (`gen_ai.*`) carry model, tokens, latency, and status
- **Metrics**: Claude Code sends OTel metrics directly; Flow engine derives aggregations from traces; OpenClaw sends native OTel metrics (auto-creates tables)
- **Logs**: Claude Code sends structured log events (API requests, tool results, user prompts)
- **Cross-signal JOIN**: `trace_id` connects spans to conversations

## Quick Install

```bash
curl -fsSL https://tma1.ai/install.sh | sh
```

Or build from source:

```bash
git clone https://github.com/tma1-ai/tma1.git
cd tma1
make build
```

## Quick Start

```bash
# Start TMA1 (downloads GreptimeDB on first run)
tma1-server

# Configure your agent to send OTel data (protobuf required):

# Claude Code — add to ~/.claude/settings.json:
#   "env": {
#     "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:14318/v1/otlp",
#     "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
#     "OTEL_METRICS_EXPORTER": "otlp",
#     "OTEL_LOGS_EXPORTER": "otlp"
#   }

# OpenClaw (sends traces)
openclaw config set diagnostics.otel.endpoint http://localhost:14318/v1/otlp

# Any OTel SDK (sends traces)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:14318/v1/otlp \
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf \
your-agent

# Open the dashboard
open http://localhost:14318
```

## Architecture

```
Agent (Claude Code / Codex / OpenClaw / any GenAI app)
    │  OTLP/HTTP  → http://localhost:14318/v1/otlp
    ▼
tma1-server  port 14318
    │  proxies OTLP to GreptimeDB, auto-injects trace pipeline header
    ▼
GreptimeDB  (managed by tma1-server)
    │  Flow engine → continuous aggregation
    │  HTTP SQL API  port 14000
    ▼
Browser dashboard (served by tma1-server)
    ├── Claude Code view  (from OTel metrics + logs)
    │   ├── Overview, Events, Cost, Search
    │   └── Token usage, cost, tool decisions, API requests, conversation replay
    ├── OpenClaw view  (from OTel traces + metrics)
    │   ├── Overview, Traces, Cost, Search
    │   └── LLM calls, channels, cache efficiency, queue depth, session state
    └── OTel GenAI view  (from OTel traces with gen_ai.* attributes)
        ├── Overview, Traces, Cost, Security, Search
        └── Token usage, cost, latency, conversation replay, anomaly detection
```

OTel data goes through tma1-server's OTLP proxy, which forwards to GreptimeDB and auto-injects the `x-greptime-pipeline-name` header required for trace ingestion.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TMA1_HOST` | `127.0.0.1` | Address tma1-server binds to |
| `TMA1_PORT` | `14318` | HTTP port for tma1-server dashboard |
| `TMA1_DATA_DIR` | `~/.tma1` | Directory for GreptimeDB data + binaries |
| `TMA1_GREPTIMEDB_VERSION` | `latest` | GreptimeDB version to download |
| `TMA1_GREPTIMEDB_HTTP_PORT` | `14000` | GreptimeDB HTTP API + OTLP port |
| `TMA1_GREPTIMEDB_MYSQL_PORT` | `14002` | GreptimeDB MySQL protocol port |
| `TMA1_LOG_LEVEL` | `info` | Log level: debug/info/warn/error |

## Development

```bash
make build       # Build the binary
make vet         # Run go vet
make test        # Run tests with race detector
make run         # Build and run locally
```

## License

Apache-2.0
