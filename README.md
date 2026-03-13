# TMA1

> *"Your agent runs. TMA1 remembers."*

Local-first observability for AI agents.
Track traces, token usage, cost, latency, errors, and conversation replay in one place.
No cloud account, no Docker, no Grafana setup.

Named after TMA-1 (Tycho Magnetic Anomaly-1) from *2001: A Space Odyssey*:
the monolith buried on the moon, silently recording everything until you dig it out.

## What You Get

- **Conversation replay**: inspect prompts and responses for each run
- **Cost and token tracking**: per model, per time window
- **Latency and error visibility**: find slow and failing calls quickly
- **Cross-signal debugging**: traces, metrics, and logs linked by `trace_id`
- **SQL access**: query raw events and rollups directly

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
# Start TMA1
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

## Supported Sources

- **Claude Code**: OTel metrics + logs
- **OpenClaw**: OTel traces + metrics
- **Any OTel-compatible GenAI app**: traces with `gen_ai.*` attributes

Send OTLP to:

```text
http://localhost:14318/v1/otlp
```

## How It Works

1. Your agent sends OTLP data to `tma1-server`.
2. TMA1 stores and aggregates data locally.
3. Dashboard is served from the same process on `http://localhost:14318`.
4. You can query data via SQL.

Implementation detail: TMA1 uses an embedded local GreptimeDB process managed by `tma1-server`.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TMA1_HOST` | `127.0.0.1` | Address tma1-server binds to |
| `TMA1_PORT` | `14318` | HTTP port for tma1-server dashboard |
| `TMA1_DATA_DIR` | `~/.tma1` | Local data and binary directory |
| `TMA1_GREPTIMEDB_VERSION` | `latest` | GreptimeDB version to download |
| `TMA1_GREPTIMEDB_HTTP_PORT` | `14000` | Embedded database HTTP API + OTLP port |
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
