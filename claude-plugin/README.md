# TMA1 Claude Code Plugin

Local-first LLM agent observability for [Claude Code](https://claude.ai/claude-code).

## Installation

### From Claude Code Marketplace (recommended)

```
/install-plugin tma1
```

### Manual

Clone this repository and add the plugin path to your Claude Code configuration:

```bash
git clone https://github.com/tma1-ai/tma1.git
```

Add to `~/.claude/settings.json`:

```json
{
  "plugins": ["path/to/tma1/claude-plugin"]
}
```

## Skills

### `/tma1-setup` — Install and configure TMA1

Installs the tma1-server binary, starts it, and configures your OTel exporter endpoint.

```
/tma1-setup
```

### `/tma1` — Query observability data

Ask questions about your agent's behavior without opening the dashboard.

```
/tma1 how much did I spend today?
/tma1 show me recent traces
/tma1 any errors in the last hour?
/tma1 compare model costs this week
```

## How it works

TMA1 captures OpenTelemetry metrics and logs emitted by Claude Code (and traces from other agents) and stores them in a local GreptimeDB instance. The plugin provides two skills:

1. **tma1-setup** handles the one-time installation and configuration
2. **tma1** queries the collected data via SQL and presents results inline

All data stays on your machine. No cloud, no accounts, no API keys.

## OTel Configuration

Claude Code exports metrics and logs (not traces). Add to `~/.claude/settings.json`:

```json
{
  "env": {
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:14318/v1/otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp"
  }
}
```

## Requirements

- Claude Code with OTel support enabled
- macOS (arm64/amd64) or Linux (amd64/arm64)
- ~200 MB disk space for GreptimeDB

## Links

- [TMA1 website](https://tma1.ai)
- [GitHub repository](https://github.com/tma1-ai/tma1)
- [Dashboard documentation](https://github.com/tma1-ai/tma1#dashboard)
