# Specialized Agents (Deprecated)

**Status**: Deprecated as of v4.1.0 - Replaced by unified `/sqlew` command

This document is kept for reference. For current usage, see [SLASH_COMMANDS.md](SLASH_COMMANDS.md).

---

## Migration to /sqlew Command

As of v4.1.0, the custom agent system has been superseded by the unified `/sqlew` command with automatic intent detection.

### Old Approach (v4.0 and earlier)

```bash
# Custom agents
@sqlew-scrum-master "Create sprint plan"
@sqlew-researcher "Find auth decisions"
@sqlew-architect "Document OAuth2 decision"
```

### New Approach (v4.1.0+)

```bash
# Unified command with intent detection
/sqlew plan sprint implementation
/sqlew search for auth decisions
/sqlew record OAuth2 decision for authentication
```

---

## Historical Agent System

For reference, the v4.0.0 system included:

| Agent | Role | Purpose |
|-------|------|---------|
| **Scrum Master** | Task coordination, sprint planning | Multi-agent task coordination |
| **Researcher** | Query history, analyze patterns | Decision and constraint queries |
| **Architect** | Document decisions, enforce constraints | Architectural decision documentation |

### Why the Change?

1. **Unified Interface**: Single `/sqlew` command instead of remembering three agent names
2. **Automatic Intent Detection**: Command analyzes input and selects appropriate MCP tool
3. **Natural Language**: No need to know about "agents" - just describe what you want
4. **Better Discoverability**: One command in autocomplete instead of three agent references
5. **Token Efficiency**: Reduced context overhead from agent system

---

## Current Architecture (v4.1.0+)

The `/sqlew` command provides all the functionality of the previous agent system:

- **Intent Analysis** (replaces agent role selection)
- **MCP Tool Invocation** (replaces direct agent calls)
- **Automatic Routing** (replaces manual agent selection)

See [SLASH_COMMANDS.md](SLASH_COMMANDS.md) for current usage patterns.

---

## Configuration (Legacy - Not Used in v4.1.0+)

The following configuration was used in v4.0 and is no longer applicable:

```toml
# DEPRECATED - v4.0.0 and earlier
[agents]
scrum_master = true
researcher = true
architect = true
```

All agent functionality is now handled by the `/sqlew` command with no additional configuration needed.

---

## Related Documentation

- [SLASH_COMMANDS.md](SLASH_COMMANDS.md) - Current `/sqlew` command documentation
- [TOOL_REFERENCE.md](TOOL_REFERENCE.md) - MCP tools (underlying infrastructure)
- [AI_AGENT_GUIDE.md](AI_AGENT_GUIDE.md) - Guidelines for AI agents using sqlew

---

## Legacy Reference

### Scrum Master (Historical)

**Purpose**: Multi-agent coordination, task management, sprint planning

Provided by `/sqlew` commands:
```bash
/sqlew plan <feature>        # Replace: /sqw-scrum plan
/sqlew execute              # Replace: /sqw-scrum implement
```

### Researcher (Historical)

**Purpose**: Query historical context, analyze patterns

Provided by `/sqlew` commands:
```bash
/sqlew search <topic>       # Replace: /sqw-research
```

### Architect (Historical)

**Purpose**: Document decisions, enforce constraints

Provided by `/sqlew` commands:
```bash
/sqlew record <decision>    # Replace: /sqw-secretary
/sqlew update <decision>    # Replaces modifications
```

---

**Version**: 4.1.0
**Status**: Deprecated
**Last Updated**: 2025-12-04

See [SLASH_COMMANDS.md](SLASH_COMMANDS.md) for current documentation.
