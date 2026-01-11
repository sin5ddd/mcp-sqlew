# Claude Code Hooks Guide

Integration guide for sqlew with Claude Code hooks.

## Overview

sqlew integrates with Claude Code through PreToolUse and PostToolUse hooks, enabling **Plan-to-ADR** (v4.3.0+): automatic Architecture Decision Record generation during AI-assisted development.

## Architecture

```
Claude Code                    sqlew
    │                            │
    ├─ PreToolUse ──────────────►│ suggest (related decisions)
    │                            │
    ├─ Tool Execution            │
    │                            │
    ├─ PostToolUse ─────────────►│ track-plan, save, check-completion
    │                            │
    └─ (Git hooks) ─────────────►│ mark-done (post-merge, post-rewrite)
```

## File Queue Architecture

Hooks use a file-based queue for async operations:

1. **Hook writes to queue** (fast, <100ms)
   - Location: `.sqlew/queue/pending.json`
2. **QueueWatcher detects change** (MCP server)
3. **Decisions registered in DB** (async)

This architecture ensures zero latency on code edits.

## Installation

As of v5.0.0, hooks are managed by the **sqlew-plugin** (Claude Code Plugin).

```bash
# 1. Add the marketplace
/plugin marketplace add sqlew-io/sqlew-plugin

# 2. Install the plugin (user-level recommended)
/plugin install sqlew-plugin

# 3. Restart Claude Code to apply changes
```

The plugin automatically configures:
- ✅ MCP server settings (`.mcp.json`)
- ✅ Claude Code Hooks (PreToolUse/PostToolUse)
- ✅ Claude Code Skills (Plan Mode guidance)

> **Note:** Global Rules are automatically created at `~/.claude/rules/sqlew/` when the MCP server starts.

## Hook Commands

### PreToolUse Hooks

| Trigger | Command | Purpose |
|---------|---------|---------|
| Task | `sqlew suggest` | Suggest related decisions before Task creation |
| Write | `sqlew track-plan` | Track plan ID during planning |

### PostToolUse Hooks

| Trigger | Command | Purpose |
|---------|---------|---------|
| Edit, Write | `sqlew save` | Enqueue decision updates |
| TodoWrite | `sqlew check-completion` | Check task completion status |
| ExitPlanMode | `sqlew save` | Save plan state on exit |

### Git Hooks

| Trigger | Command | Purpose |
|---------|---------|---------|
| post-merge | `sqlew mark-done` | Mark decisions as complete after merge |
| post-rewrite | `sqlew mark-done` | Mark decisions as complete after rebase |

## Queue File Format

`.sqlew/queue/pending.json`:

```json
{
  "items": [
    {
      "type": "decision",
      "action": "update",
      "key": "plan/my-feature",
      "timestamp": 1703404800000,
      "data": {
        "value": "in_progress",
        "layer": "planning"
      }
    }
  ]
}
```

## Troubleshooting

### Hooks not triggering

1. Verify plugin is installed: `/plugin list`
2. Check plugin status for errors
3. Restart Claude Code to reload hooks

### Queue not processing

1. Ensure MCP server is running
2. Check `.sqlew/queue/pending.json` for items
3. Verify QueueWatcher is active (check debug logs)

### Debug logging

Enable debug logging in `.sqlew/config.toml`:

```toml
[debug]
log_path = ".sqlew/debug.log"
log_level = "debug"
```

## Version History

- **v5.0.0**: Hooks managed by sqlew-plugin (Claude Code Plugin)
- **v4.3.0**: Plan-to-ADR - Automatic ADR from Plan Mode
- **v4.1.0**: Initial Claude Code Hooks integration with File Queue Architecture
