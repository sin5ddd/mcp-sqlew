# Specialized Agents for sqlew

Claude Code agents that leverage sqlew's context management for development workflows.

## Usage

Agents are **automatically invoked via slash commands**. See [SLASH_COMMANDS.md](SLASH_COMMANDS.md) for the standard workflow:

```
/sqw-plan → /sqw-scrum → /sqw-review
```

Direct invocation is also available with the `@` prefix:

```bash
@sqlew-scrum-master "Create sprint plan"
@sqlew-researcher "Find auth decisions"
@sqlew-architect "Document OAuth2 decision"
```

---

## Available Agents

| Agent | Role | Model | Slash Command |
|-------|------|-------|---------------|
| **Scrum Master** | Task coordination, sprint planning, dependency management | Sonnet | `/sqw-scrum`, `/sqw-plan` |
| **Researcher** | Query history, analyze patterns, find related decisions | Sonnet | `/sqw-research`, `/sqw-review` |
| **Architect** | Document decisions, create constraints, validate compliance | Sonnet | `/sqw-documentor`, `/sqw-secretary`, `/sqw-plan`, `/sqw-review` |

---

## Agent Roles

### Scrum Master (`sqlew-scrum-master`)

**Purpose**: Multi-agent coordination, task management, sprint planning

- Creates tasks with dependencies
- Coordinates parallel work
- Tracks sprint progress
- Detects stale tasks and blockers

### Researcher (`sqlew-researcher`)

**Purpose**: Query historical context, analyze patterns

- Searches decisions by tags, layers, keys
- Retrieves constraint rationale
- Cross-references decisions ↔ tasks ↔ files
- Tracks decision version history

### Architect (`sqlew-architect`)

**Purpose**: Document decisions, enforce constraints

- Creates rich decision records (rationale, alternatives, tradeoffs)
- Establishes constraints linked to decisions
- Validates architectural compliance
- Uses decision-making frameworks

---

## Configuration

Agents are configured in `.sqlew/config.toml`:

```toml
[agents]
scrum_master = true
researcher = true
architect = true
```

**Recommendation**: Use all three agents. They are complementary specialists designed to work together via slash commands.

---

## Related Documentation

- [SLASH_COMMANDS.md](SLASH_COMMANDS.md) - Standard workflow with slash commands
- [TASK_OVERVIEW.md](TASK_OVERVIEW.md) - Task management overview
- [DECISION_CONTEXT.md](DECISION_CONTEXT.md) - Decision documentation

---

**Version:** 4.0.0
**Last Updated:** 2025-11-27
