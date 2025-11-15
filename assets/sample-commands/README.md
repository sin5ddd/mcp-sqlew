# Slash Commands for sqlew

This directory contains slash command templates for Claude Code integration with mcp-sqlew.

## Documentation

**For complete installation guide and usage:**

➡️ **[docs/SLASH_COMMANDS.md](../../docs/SLASH_COMMANDS.md)**

## Command Files

- `sqw-documentor.md` - Document architectural decisions
- `sqw-secretary.md` - Record decisions (meeting minutes)
- `sqw-plan.md` - Planning workflow (architecture + tasks)
- `sqw-research.md` - Search decision/task history
- `sqw-review.md` - Validate architectural consistency
- `sqw-scrum.md` - Task management + agent coordination

## Quick Install

### Automatic (Recommended)

Commands are automatically installed when the MCP server starts. Configure in `.sqlew/config.toml`:

```toml
[commands]
documentor = true
secretary = true
plan = true
research = true
review = true
scrum = true
```

### Manual Installation

```bash
# Install all enabled commands
npx mcp-sqlew init-commands

# Install to custom location
npx mcp-sqlew init-commands --path /custom/path
```

Commands are installed to `.claude/commands/` in your project directory.

**Usage**: Invoke commands with the `/` prefix: `/sqw-plan`, `/sqw-documentor`, `/sqw-scrum`

See [docs/SLASH_COMMANDS.md](../../docs/SLASH_COMMANDS.md) for detailed usage examples and customization options.

## Links

- [Main README](../../README.md)
- [Slash Commands Documentation](../../docs/SLASH_COMMANDS.md)
- [Specialized Agents](../../docs/SPECIALIZED_AGENTS.md)
- [Project Repository](https://github.com/sin5ddd/mcp-sqlew)
