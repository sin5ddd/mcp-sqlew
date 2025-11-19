# Slash Commands Guide

**🎯 Recommended for Human Users**

Slash commands are the PRIMARY way to interact with sqlew. They provide guided workflows that are easier than raw MCP tool calls or direct agent invocation. Commands are installed automatically to `.claude/commands/` and can be invoked with the `/` prefix in Claude Code.

## Why Use Slash Commands?

✅ **Guided workflows** - Commands prompt you through the process
✅ **Agent coordination** - Automatically invokes the right agents
✅ **Error handling** - Built-in validation and helpful error messages
✅ **Mode detection** - `/sqw-scrum plan` manages tasks, `/sqw-scrum implement` builds code
✅ **No MCP knowledge needed** - Just describe what you want in plain English

## Quick Start

```bash
# Most common commands
/sqw-plan "Implement user authentication"
/sqw-secretary "Use PostgreSQL 15 for production database"
/sqw-scrum implement JWT authentication
/sqw-research "Why did we choose Knex for migrations?"

# All commands work with or without arguments (will prompt if needed)
/sqw-documentor "Document API versioning strategy"
/sqw-review "authentication implementation"
```

## Available Commands

| Command | What It Does | Perfect For |
|---------|--------------|-------------|
| **`/sqw-plan`** | Complete feature planning (architecture + tasks) | Starting new features, planning sprints |
| **`/sqw-secretary`** | Record decisions like meeting minutes | Documenting team decisions, capturing context |
| **`/sqw-scrum`** | Create tasks AND coordinate agents to implement them | Actually building features end-to-end |
| **`/sqw-documentor`** | Document architectural decisions with full context | Design reviews, architecture documentation |
| **`/sqw-research`** | Search past decisions and analyze patterns | Onboarding, understanding past choices |
| **`/sqw-review`** | Validate code/design against decisions & constraints | Code reviews, ensuring consistency |

---

### /sqw-plan
**Purpose**: Comprehensive planning workflow combining architectural consideration and task breakdown

**Agent Flow**:
1. Invokes `@sqlew-architect` for architectural documentation
2. Invokes `@sqlew-scrum-master` for task creation and dependency management

**Best For**:
- Planning new features
- Breaking down large initiatives
- Architectural decisions + task tracking

**Example Usage**:
```bash
/sqw-plan "Implement OAuth2 social login with Google and GitHub"
```

**What It Does**:
- Checks existing decisions for related context
- Documents architectural choices
- Creates actionable tasks with proper layers
- Sets up task dependencies
- Provides complete implementation roadmap

---

### /sqw-secretary
**Purpose**: Record decisions like meeting minutes

**Agent**: `@sqlew-architect` (focused mode)

**Best For**:
- Quick decisions without full planning
- Recording choices made during development
- Building institutional knowledge
- Capturing team meeting decisions

**Example Usage**:
```bash
/sqw-secretary "Use PostgreSQL 15 for production database"
```

**What It Does**:
- Simplified architect workflow
- Focuses on decision capture
- Minimal task creation (only if needed)
- Saves decision with context for future reference

---

### /sqw-scrum
**Purpose**: Task management AND agent coordination for implementation

**Agent**: `@sqlew-scrum-master`

**Best For**:
- Creating tasks with dependencies
- Reviewing sprint progress
- Managing task states (todo → in_progress → done)
- **Actually implementing features** (not just planning)

**Two Modes**:

**Mode A: Task Planning Only**
```bash
/sqw-scrum "Create tasks for database migration feature"
```

**Mode B: Task Planning + Execution** (NEW)
```bash
/sqw-scrum implement JWT authentication
# → Creates tasks, coordinates agents, writes code, updates status
```

**What It Does**:
- Uses `mcp__sqlew__task` (action: list) to check current work
- Breaks down goals into concrete tasks
- Creates tasks with proper layers and file_actions
- Sets up dependencies between related tasks
- **Coordinates agents to implement tasks** (Mode B)
- Tracks progress and updates task status

---

### /sqw-documentor
**Purpose**: Document architectural decisions with rationale, alternatives, and tradeoffs

**Agent**: `@sqlew-architect`

**Best For**:
- Recording design decisions
- Establishing constraints
- Documenting rationale for future reference
- Creating comprehensive architecture documentation

**Example Usage**:
```bash
/sqw-documentor "Choose between REST and GraphQL for API design"
```

**What It Does**:
- Uses `mcp__sqlew__suggest` to find related decisions
- Documents decision with full context (rationale, alternatives, tradeoffs)
- Uses `mcp__sqlew__decision` to record permanently
- Uses `mcp__sqlew__constraint` to establish rules if needed

---

### /sqw-research
**Purpose**: Query historical context and analyze patterns

**Agent**: `@sqlew-researcher`

**Best For**:
- Understanding past decisions
- Finding related work
- Avoiding duplicate efforts
- Onboarding new team members

**Example Usage**:
```bash
/sqw-research "Why did we choose Knex for database migrations?"
```

**What It Does**:
- Uses `mcp__sqlew__suggest` to find related context
- Uses `mcp__sqlew__decision` (search_*) to query decisions
- Uses `mcp__sqlew__task` (list) to find related tasks
- Analyzes patterns and presents findings

---

### /sqw-review
**Purpose**: Review code/design against architectural decisions and constraints

**Agent Flow**:
1. Invokes `@sqlew-researcher` to gather context
2. Invokes `@sqlew-architect` to validate against constraints

**Best For**:
- Code review with architectural consistency
- Validating implementation matches decisions
- Ensuring constraints are followed

**Example Usage**:
```bash
/sqw-review "API endpoint implementation for user service"
```

**What It Does**:
- Researches relevant decisions and constraints
- Checks implementation consistency
- Identifies deviations from architectural patterns
- Suggests corrections if needed

---

## Installation

### Automatic Installation (Default)

Slash commands are **automatically installed** when the MCP server starts:

```bash
# Commands sync on every server startup
# Based on .sqlew/config.toml [commands] section
```

**First Startup**:
```
✓ Installed slash commands: Architect, Decide, Plan, Research, Review, Scrum
  Location: /path/to/project/.claude/commands
  Use commands with / prefix: /sqlew-plan, /sqlew-architect, /sqlew-scrum
```

### Manual Installation

If you need to manually trigger installation:

```bash
# Install all enabled commands
npx sqlew-init-commands

# Install to custom location
npx sqlew-init-commands --path /custom/path
```

---

## Configuration

Edit `.sqlew/config.toml` to customize which commands are installed:

```toml
[commands]
# Enable/disable individual commands (default: true)

documentor = true  # /sqw-documentor: Document architectural decisions
secretary = true   # /sqw-secretary: Record decisions (meeting minutes)
plan = true        # /sqw-plan: Complete planning workflow
research = true    # /sqw-research: Search and analyze history
review = true      # /sqw-review: Validate architectural consistency
scrum = true       # /sqw-scrum: Task management + execution
```

### Configuration Examples

**Minimal Configuration** (only essential workflows):
```toml
[commands]
plan = true        # Keep comprehensive planning
secretary = true   # Keep quick decisions/meeting minutes
documentor = false # Disable (can use via /sqw-plan)
scrum = false      # Disable (can use via /sqw-plan)
research = false   # Disable if not needed
review = false     # Disable if not needed
```

**Development Team** (all workflows):
```toml
[commands]
documentor = true
secretary = true
plan = true
research = true
review = true
scrum = true
```

**Solo Developer** (focused set):
```toml
[commands]
plan = true        # Main workflow
secretary = true   # Quick decisions
research = true    # Context lookup
documentor = false # Handled by /sqw-plan
scrum = false      # Handled by /sqw-plan
review = false     # Manual reviews
```

---

## Auto-Sync Behavior

On every MCP server startup:
- **Enabled commands** (true/default) → Installed if missing
- **Disabled commands** (false) → Removed if present

**Example Workflow**:
1. Edit `.sqlew/config.toml`: Set `research = false`
2. Restart MCP server
3. Result: `sqw-research.md` deleted from `.claude/commands/`

**Reverting**:
1. Edit `.sqlew/config.toml`: Set `research = true`
2. Restart MCP server
3. Result: `sqw-research.md` restored to `.claude/commands/`

---

## Customizing Commands

Commands are markdown files in `.claude/commands/`. You can:

### 1. Edit Existing Commands

Modify `.claude/commands/sqw-*.md` to change agent behavior.

**⚠️ Warning**: Enabled commands will be **overwritten** on next server startup.

**To preserve customizations**:
- Set command to `false` in config.toml to prevent auto-sync
- Rename file (e.g., `my-custom-plan.md`) to avoid conflicts

### 2. Create New Commands

Add custom `.md` files to `.claude/commands/`:

```markdown
<!-- File: .claude/commands/my-workflow.md -->

You are a specialized agent for my custom workflow.

Process:
1. Use mcp__sqlew__task to list current tasks
2. Use mcp__sqlew__decision to check context
3. Perform custom logic
4. Report results
```

Usage: `/my-workflow "Task description"`

### 3. Command File Format

Slash command files are simple markdown with agent instructions:

```markdown
You are the [agent-name] agent. Use sqlew MCP tools to [purpose].

If the user provided a specific [input], address it. Otherwise, ask for clarification.

Process:
1. Step 1 description (tool: action)
2. Step 2 description (tool: action)
3. Step 3 description (tool: action)

Return: [what to return]
```

---

## Best Practices

### 1. Start with Defaults

Use all commands initially to understand workflows:
- `/sqw-plan` for features
- `/sqw-secretary` for quick decisions
- `/sqw-research` to explore history

### 2. Disable Unused Commands

After 1-2 weeks, identify unused commands and set to `false`:
- Reduces clutter in command palette
- Prevents accidental invocation
- Can always re-enable later

### 3. Combine Commands

Use commands in sequence for complex workflows:

```bash
# 1. Research existing context
/sqw-research "authentication implementation"

# 2. Document new decision
/sqw-secretary "Use JWT with refresh tokens"

# 3. Plan implementation
/sqw-plan "Implement JWT authentication"

# 4. Review after implementation
/sqw-review "authentication middleware implementation"
```

### 4. Use Arguments Effectively

**With Arguments** (faster):
```bash
/sqw-documentor "Choose between monolith and microservices"
```

**Without Arguments** (interactive):
```bash
/sqw-documentor
# Agent will prompt: "What architectural decision needs to be made?"
```

### 5. Version Control

**Recommended**: Add `.claude/commands/` to `.gitignore` if heavily customized

```gitignore
# .gitignore
.claude/commands/
```

**Alternative**: Commit default commands, customize per developer

```bash
# Commit defaults
git add .claude/commands/sqw-*.md

# Customize locally
# Changes won't be overwritten (files already exist)
```

---

## Troubleshooting

### Commands not appearing in Claude Code

**Symptoms**: Typing `/sqw-` shows no commands

**Solutions**:
1. Restart Claude Code after installation
2. Check `.claude/commands/` directory exists:
   ```bash
   ls .claude/commands/
   ```
3. Verify config.toml has commands enabled:
   ```bash
   cat .sqlew/config.toml | grep -A 10 "\[commands\]"
   ```
4. Manually run installer:
   ```bash
   npx sqlew-init-commands
   ```

---

### Commands being overwritten

**Symptoms**: Customizations lost after server restart

**Cause**: Enabled commands sync from `assets/sample-commands/` on startup

**Solutions**:

**Option 1**: Disable auto-sync for that command
```toml
[commands]
plan = false  # Prevent overwriting custom sqlew-plan.md
```

**Option 2**: Rename custom file
```bash
mv .claude/commands/sqlew-plan.md .claude/commands/my-custom-plan.md
# Use with: /my-custom-plan
```

**Option 3**: Edit source file
```bash
# Edit the source that gets synced
vim node_modules/sqlew/assets/sample-commands/sqw-plan.md
```
⚠️ Not recommended: Lost on npm update

---

### Commands not syncing

**Symptoms**: Changes to config.toml don't take effect

**Solutions**:
1. Check source files exist:
   ```bash
   ls node_modules/sqlew/assets/sample-commands/
   ```
2. Check console output for sync errors
3. Manually run installer:
   ```bash
   npx sqlew-init-commands
   ```
4. Check file permissions:
   ```bash
   ls -la .claude/commands/
   ```

---

### Wrong agent invoked

**Symptoms**: `/sqw-plan` invokes wrong agent

**Cause**: Command file edited with different agent reference

**Solution**: Restore default or fix agent reference:
```bash
# Restore default
rm .claude/commands/sqw-plan.md
# Restart MCP server (auto-reinstalls)

# Or fix manually
vim .claude/commands/sqw-plan.md
# Ensure correct agent is referenced
```

---

## Comparison: Commands vs Direct Agent Invocation

### Use Slash Commands When:
- You want guided workflows (commands have built-in logic)
- You need multi-agent coordination (`/sqlew-plan` = architect + scrum)
- You prefer quick shortcuts (less typing)

### Use Direct Agent Invocation When:
- You need more control over agent behavior
- You want custom instructions per invocation
- You're debugging agent interactions

**Example Comparison**:

```bash
# Slash command (guided workflow)
/sqw-plan "Implement feature X"
# → Architect considers architecture
# → Scrum creates tasks
# → Both record in sqlew

# Direct agent (custom control)
@sqlew-architect "Consider feature X architecture, focus on scalability, ignore cost"
# → Full control over architect instructions
```

---

## Integration with Other Tools

### Claude Code Features

**Slash Commands + File Context**:
```bash
# Open relevant files first
# Then invoke command
/sqw-review "authentication implementation"
# Agent sees open files in context
```

**Slash Commands + Selection**:
```bash
# Select code block
# Then invoke command
/sqw-documentor "Document this pattern as a constraint"
```

### Git Integration

Commands work well with git workflows:
```bash
# 1. Feature branch
git checkout -b feature/oauth

# 2. Plan work
/sqw-plan "Implement OAuth2 login"

# 3. Develop with decisions
/sqw-secretary "Use Passport.js library"

# 4. Review before commit
/sqw-review "OAuth implementation"

# 5. Commit with context
git commit -m "feat: Add OAuth2 login

Implements: task-485
Decision: slash-commands-oauth-library (Passport.js)
"
```

---

## Performance Considerations

### Token Usage

Each command invokes agents that consume tokens:

| Command | Agent(s) | Approx Token Cost |
|---------|----------|-------------------|
| `/sqw-documentor` | architect | ~20KB per invocation |
| `/sqw-scrum` | scrum-master | ~12KB per invocation |
| `/sqw-research` | researcher | ~14KB per invocation |
| `/sqw-secretary` | architect | ~20KB per invocation |
| `/sqw-plan` | architect + scrum | ~32KB per invocation |
| `/sqw-review` | researcher + architect | ~34KB per invocation |

**Optimization**:
- Use `/sqw-secretary` instead of `/sqw-plan` for simple decisions (saves ~12KB)
- Use `/sqw-research` before `/sqw-documentor` to avoid duplicate context lookups
- Disable unused commands to prevent accidental invocation

### Response Time

**Typical Response Times** (AI time, not wall-clock):
- `/sqw-secretary`: 5-10 minutes
- `/sqw-documentor`: 10-15 minutes
- `/sqw-scrum`: 8-12 minutes (planning) / 20-40 minutes (execution)
- `/sqw-plan`: 18-27 minutes (sequential agents)
- `/sqw-research`: 5-8 minutes
- `/sqw-review`: 15-23 minutes (sequential agents)

---

## See Also

- [Specialized Agents](SPECIALIZED_AGENTS.md) - Agent-based workflows
- [Task System](TASK_SYSTEM.md) - Task management details
- [Decision Context](DECISION_CONTEXT.md) - Decision documentation
- [Best Practices](BEST_PRACTICES.md) - General usage patterns
- [Architecture](ARCHITECTURE.md) - System design overview

---

## Changelog

### v3.9.0 (Current)
- Command renaming for clarity: `/sqw-*` prefix, feature-based names
- 6 commands: documentor, secretary, plan, research, review, scrum
- Scrum executor feature: Mode B for task implementation
- Updated documentation to position slash commands as primary interface

### v3.8.0
- Initial release of slash commands system
- Auto-sync on server startup
- Configuration via `.sqlew/config.toml`
- Manual installer: `npx sqlew-init-commands`

---

## Contributing

Found a bug or have a suggestion? Please report at:
https://github.com/sin5ddd/mcp-sqlew/issues

**Common Requests**:
- New command ideas
- Command workflow improvements
- Documentation clarifications
