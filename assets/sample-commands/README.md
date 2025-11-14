# Slash Commands for sqlew

This directory contains slash command templates for Claude Code integration with mcp-sqlew.

## Documentation

**For complete installation guide and usage:**

➡️ **[docs/SLASH_COMMANDS.md](../../docs/SLASH_COMMANDS.md)**

## Command Files

- `sqlew-architect.md` - Architectural documentation workflow
- `sqlew-decide.md` - Decision-making workflow
- `sqlew-plan.md` - Planning workflow (architect + scrum master)
- `sqlew-research.md` - Research workflow
- `sqlew-review.md` - Review workflow
- `sqlew-scrum.md` - Scrum/task management workflow

## Quick Install

### Automatic (Recommended)

Commands are automatically installed when the MCP server starts. Configure in `.sqlew/config.toml`:

```toml
[commands]
architect = true
decide = true
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

**Usage**: Invoke commands with the `/` prefix: `/sqlew-plan`, `/sqlew-architect`, `/sqlew-scrum`

See [docs/SLASH_COMMANDS.md](../../docs/SLASH_COMMANDS.md) for detailed usage examples and customization options.

## Links

- [Main README](../../README.md)
- [Slash Commands Documentation](../../docs/SLASH_COMMANDS.md)
- [Specialized Agents](../../docs/SPECIALIZED_AGENTS.md)
- [Project Repository](https://github.com/sin5ddd/mcp-sqlew)
