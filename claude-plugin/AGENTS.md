## Claude Code Plugin for TMA1

This directory contains the Claude Code plugin for TMA1 observability.

### Directory structure

```
claude-plugin/
  .claude-plugin/
    plugin.json          # Plugin metadata (name, version, author)
  skills/
    tma1-setup/
      SKILL.md           # /tma1-setup — installation wizard
    tma1/
      SKILL.md           # /tma1 — inline observability queries
  README.md              # User-facing documentation
  AGENTS.md              # This file
```

### Skill conventions

- Skills use `context: fork` to avoid polluting the main conversation
- Skills use `allowed-tools: Bash` for curl commands to the local API
- No hooks — TMA1 does not need runtime hooks (OTel auto-reports)

### API endpoints used by skills

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `http://localhost:14318/health` | GET | Liveness check |
| `http://localhost:14318/status` | GET | GreptimeDB connectivity |
| `http://localhost:14318/api/query` | POST | SQL proxy to GreptimeDB |

The `/api/query` endpoint accepts `{"sql": "SELECT ..."}` and returns raw GreptimeDB JSON.

### Adding new skills

1. Create a new directory under `skills/` with a `SKILL.md` file
2. Follow the YAML frontmatter format (name, description, context, allowed-tools)
3. Keep the description field rich with trigger phrases for intent matching
4. Update `README.md` with the new skill's usage
