# Specialized Agents for sqlew

This directory contains specialized agent files for efficient multi-agent coordination using mcp-sqlew.

## Documentation

**For complete installation guide, usage examples, and customization:**

➡️ **[docs/SPECIALIZED_AGENTS.md](../../docs/SPECIALIZED_AGENTS.md)**

## Agent Files

- `sqlew-scrum-master.md` - Multi-agent coordination, task management, sprint planning (12KB tokens)
- `sqlew-researcher.md` - Query decisions, analyze patterns, investigate context (14KB tokens)
- `sqlew-architect.md` - Document decisions, enforce constraints, maintain standards (20KB tokens)

## Quick Install

Configure which agents to install in `.sqlew/config.toml`:

```toml
[agents]
scrum_master = true
researcher = true
architect = true
```

Agents configured as `true` are automatically installed to your project's `.claude/agents/` directory.

**Usage**: Invoke agents with the `@` prefix: `@sqlew-scrum-master`, `@sqlew-researcher`, `@sqlew-architect`

See [docs/SPECIALIZED_AGENTS.md](../../docs/SPECIALIZED_AGENTS.md) for detailed installation instructions and configuration options.

## Links

- [Main README](../../README.md#specialized-agents)
- [Complete Documentation](../../docs/SPECIALIZED_AGENTS.md)
- [Project Repository](https://github.com/sin5ddd/mcp-sqlew)
