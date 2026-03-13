---
name: tma1-setup
description: "Install and configure TMA1 local observability. Use when the user says: install tma1, setup observability, monitor my agent, track token usage, set up telemetry."
context: fork
allowed-tools: Bash
---

# TMA1 Setup

You are helping the user install and configure TMA1, a local-first LLM agent observability tool.

## Step 1: Check if TMA1 is already running

```bash
curl -sf http://localhost:14318/health
```

If this returns `{"status":"ok"}`, TMA1 is already running. Skip to Step 4.

## Step 2: Install TMA1

Download and install the tma1-server binary:

```bash
curl -fsSL https://tma1.ai/install.sh | sh
```

This installs the binary to `~/.tma1/bin/tma1-server`.

## Step 3: Start TMA1

```bash
~/.tma1/bin/tma1-server &
```

Wait for GreptimeDB to become healthy:

```bash
for i in $(seq 1 30); do
  if curl -sf http://localhost:14318/health > /dev/null 2>&1; then
    echo "TMA1 is ready."
    break
  fi
  sleep 1
done
```

If it does not become healthy after 30 seconds, check the logs and report the error.

## Step 4: Verify OTel endpoint

Confirm GreptimeDB is accepting OTLP data:

```bash
curl -sf http://localhost:14318/status
```

This should return `{"status":"ok","greptimedb":"running",...}`.

## Step 5: Configure the agent

Tell the user to set the OTel exporter endpoint. The exact method depends on their agent:

**Claude Code** — add to `~/.claude/settings.json`:
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

Claude Code exports metrics and logs (not traces). The metrics/logs exporters must be explicitly enabled.

**Other OTel-compatible agents** (standard GenAI SDK) — typically export traces:
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:14318/v1/otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

## Step 6: Verify data flow

After the user runs at least one agent interaction with the endpoint configured:

```bash
curl -s -X POST http://localhost:14318/api/query \
  -H 'Content-Type: application/json' \
  -d '{"sql": "SELECT COUNT(*) AS span_count FROM opentelemetry_traces"}' 2>/dev/null | python3 -m json.tool
```

If `span_count > 0`, data is flowing correctly.

## Handoff

Tell the user:
- Dashboard: http://localhost:14318
- OTel base endpoint: http://localhost:14318/v1/otlp (SDK auto-appends /v1/traces etc.)
- Use `/tma1` to query observability data inline without opening the dashboard.
