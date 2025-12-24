# Unified /sqlew Command Guide

**🎯 Recommended Interface**

The `/sqlew` command is the PRIMARY way to interact with sqlew. It provides a natural language interface with automatic intent detection that is easier than raw MCP tool calls.

## Why Use /sqlew?

✅ **Natural language input** - Describe what you want, it figures out the intent
✅ **Single command** - `/sqlew` handles all operations (search, record, list, execute, plan)
✅ **Automatic intent detection** - Recognizes search, record, update, execute, task creation
✅ **Error handling** - Built-in validation and helpful error messages
✅ **No MCP knowledge needed** - Just describe what you want in plain English

## Quick Start

```bash
# Show current status and suggested next actions
/sqlew

# Search for decisions
/sqlew search why we chose Knex for migrations

# Record a decision
/sqlew record we use PostgreSQL 15 for production database

# List remaining tasks
/sqlew show remaining tasks

# Create tasks from a plan
/sqlew plan implementing user authentication
```

---

## Intent Detection System

The `/sqlew` command analyzes your input and executes in this priority order:

### 1. List/Status Intent (Highest Priority)

**Keywords**: list, show, status, remaining, current, pending, what, overview, existing, left, 確認, 見せて, 表示, 一覧

**Use when you want to**:
- See all decisions
- Check remaining tasks
- Get current status
- View what exists in the database

**Examples**:
```bash
/sqlew
/sqlew show remaining tasks
/sqlew what decisions do we have
/sqlew list all constraints
```

**Actions executed**:
- Lists recent decisions
- Shows task status summary
- Provides suggestions for next steps

---

### 2. Search Intent

**Keywords**: search, find, look for, about, related, explore, 検索, 探して, 調べて

**Use when you want to**:
- Find related decisions
- Search for past context
- Understand why something was decided
- Explore related patterns

**Examples**:
```bash
/sqlew search why we chose PostgreSQL
/sqlew find authentication decisions
/sqlew look for API design decisions
```

**Actions executed**:
- Queries decision tags and keys
- Shows related context
- Displays decision rationale

---

### 3. Record Intent

**Keywords**: record, add, save, register, decide, decided, decision, 記録, 登録, 保存

**Use when you want to**:
- Capture a new decision
- Record meeting minutes
- Document a choice made during development
- Add a new constraint

**Examples**:
```bash
/sqlew record we decided to use JWT for authentication
/sqlew add PostgreSQL 15 as our production database
/sqlew save that we use async/await pattern
```

**Actions executed**:
- Checks for duplicates
- Records decision with context
- Suggests related decisions

---

### 4. Update Intent

**Keywords**: update, change, modify, revise, 更新, 変更, 修正

**Use when you want to**:
- Modify an existing decision
- Change a constraint
- Revise previous context

**Examples**:
```bash
/sqlew update authentication to use OAuth2 instead
/sqlew modify database choice to PostgreSQL 14
/sqlew revise API response format
```

**Actions executed**:
- Retrieves existing decision
- Updates with new information
- Shows before/after changes

---

### 5. Execute Intent

**Keywords**: execute, run, do, proceed, continue, finish, 実行, 進めて, 続けて, やって

**Use when you want to**:
- Start implementing pending tasks
- Continue work from previous session
- Execute next steps

**Examples**:
```bash
/sqlew execute
/sqlew run pending tasks
/sqlew proceed with implementation
/sqlew continue from where we left off
```

**Actions executed**:
- Lists pending tasks
- Coordinates implementation
- Updates task status

---

### 6. Task Creation Intent (Lowest Priority - Explicit Only)

**Keywords**: create task, make task, breakdown, plan tasks, generate tasks, タスク作成, タスクを作って, 洗い出し

**IMPORTANT**: Only triggers for EXPLICIT creation verbs. Does NOT trigger for:
- "remaining tasks" → List/Status intent instead
- "task list" → List/Status intent instead
- "show tasks" → List/Status intent instead

**Use when you want to**:
- Break down a feature into tasks
- Create an implementation plan
- Generate task breakdown

**Examples**:
```bash
/sqlew create tasks for user authentication feature
/sqlew breakdown OAuth2 implementation into tasks
/sqlew plan implementing password reset feature
```

**Actions executed**:
- Parses input into tasks
- Creates task records with dependencies
- Provides task summary

---

## Common Use Cases

### Planning a Feature

```bash
# Step 1: Get current status
/sqlew

# Step 2: Record architectural decision
/sqlew record we will use JWT for authentication with 24h expiry

# Step 3: Create implementation tasks
/sqlew plan implementing JWT authentication
```

### Onboarding to a Project

```bash
# Get overview
/sqlew

# Explore decisions
/sqlew search authentication decisions
/sqlew search database architecture

# Check current work
/sqlew show remaining tasks
```

### During Implementation

```bash
# Record decisions made
/sqlew record we added Redis cache for performance

# Check related past decisions
/sqlew search caching decisions

# Update status
/sqlew continue with next task
```

---

## Advanced: Direct MCP Tool Access

**Note**: For most use cases, the `/sqlew` command is sufficient and preferred.

Power users can still call MCP tools directly via the tool interface:

```
mcp__sqlew__decision action="list"
mcp__sqlew__task action="list"
mcp__sqlew__decision action="search_tags" tags=["authentication"]
```


---

## Configuration

The `/sqlew` command is configured in `.sqlew/config.toml`:

```toml
[sqlew]
# Default enabled - no configuration needed
```

---

## Troubleshooting

### Command not recognized

**Symptom**: `/sqlew` appears as unrecognized command

**Solution**:
1. Restart Claude Code after installation
2. Verify `.claude/commands/sqlew.md` exists
3. Check MCP server is running (check console for errors)

### Wrong intent detected

**Symptom**: Command executes wrong action

**Solution**:
- Use more explicit keywords
- Example: Instead of `/sqlew tasks`, use `/sqlew show remaining tasks`

### Need more details

**Symptom**: Result seems incomplete

**Solution**:
- Try searching directly: `/sqlew search <topic>`
- Or list all: `/sqlew show what we have`

---

## Performance Considerations

### Token Usage

The `/sqlew` command is designed for token efficiency:
- **List/Status**: ~2-5KB (minimal queries)
- **Search**: ~3-8KB (depending on results)
- **Record**: ~2-6KB (single write operation)
- **Execute**: ~5-15KB (task coordination)

---

## Related Documentation


---

## Version History

### v4.1.0 (Current)

- **Major Change**: Unified `/sqlew` command replaces multiple slash commands
- **New**: Automatic intent detection (6 intent types)
- **New**: Natural language interface
- **Removed**: Legacy slash commands (`/sqw-plan`, `/sqw-scrum`, `/sqw-secretary`, etc.)
- **Removed**: Custom agent definitions (replaced with unified command)

### v4.0.0

- Slash commands released (`/sqw-plan`, `/sqw-secretary`, `/sqw-scrum`, etc.)
- Agent system refactored (agents completely removed from database in v4.0)

---

## See Also


---

## Contributing

Found a bug or have a suggestion? Please report at:
https://github.com/sin5ddd/mcp-sqlew/issues
