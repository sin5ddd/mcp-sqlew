# Migration Guide: v1.x → v2.0.0

This guide helps you migrate from sqlew v1.x to v2.0.0. The v2.0 release consolidates 20 individual tools into 6 action-based tools for 96% token reduction.

## Breaking Changes Summary

### What Changed
- **Tool Names:** All 20 tool names changed
- **API Structure:** All tools now use action-based routing with an `action` parameter
- **Tool Count:** 20 → 6 tools

### What Didn't Change
- **Database Schema:** 100% compatible - no migration needed ✅
- **Functionality:** All 20 original functions preserved
- **Parameters:** Same parameter names and types (except `action` is now required)
- **Return Values:** Identical response structures

## Database Compatibility

**Good news:** Your v1.x database works with v2.0 without any changes!

- ✅ v1.x database → v2.0 server (works immediately)
- ✅ v2.0 database → v1.x server (if you need to downgrade)
- ✅ No data migration required
- ✅ No schema changes

The v2.0 consolidation is purely an MCP interface redesign - the database layer is unchanged.

## Tool Mapping Reference

| v1.x Tool | v2.0 Tool | Action |
|-----------|-----------|--------|
| `set_decision` | `decision` | `set` |
| `get_decision` | `decision` | `get` |
| `get_context` | `decision` | `list` |
| `search_by_tags` | `decision` | `search_tags` |
| `search_by_layer` | `decision` | `search_layer` |
| `get_versions` | `decision` | `versions` |
| `send_message` | `message` | `send` |
| `get_messages` | `message` | `get` |
| `mark_read` | `message` | `mark_read` |
| `record_file_change` | `file` | `record` |
| `get_file_changes` | `file` | `get` |
| `check_file_lock` | `file` | `check_lock` |
| `add_constraint` | `constraint` | `add` |
| `get_constraints` | `constraint` | `get` |
| `deactivate_constraint` | `constraint` | `deactivate` |
| `get_layer_summary` | `stats` | `layer_summary` |
| `get_stats` | `stats` | `db_stats` |
| `clear_old_data` | `stats` | `clear` |
| `get_config` | `config` | `get` |
| `update_config` | `config` | `update` |

## Migration Examples

### Context Management

**v1.x:**
```typescript
// Set decision
await callTool('set_decision', {
  key: 'auth_method',
  value: 'JWT',
  tags: ['security']
});

// Get decision
await callTool('get_decision', {
  key: 'auth_method'
});

// Search by tags
await callTool('search_by_tags', {
  tags: ['security', 'api'],
  match_mode: 'AND'
});
```

**v2.0:**
```typescript
// Set decision
await callTool('decision', {
  action: 'set',
  key: 'auth_method',
  value: 'JWT',
  tags: ['security']
});

// Get decision
await callTool('decision', {
  action: 'get',
  key: 'auth_method'
});

// Search by tags
await callTool('decision', {
  action: 'search_tags',
  tags: ['security', 'api'],
  tag_match: 'AND'  // Note: parameter renamed from match_mode
});
```

### Messaging

**v1.x:**
```typescript
// Send message
await callTool('send_message', {
  from_agent: 'agent1',
  to_agent: 'agent2',
  message: 'Task complete',
  priority: 'high'
});

// Get messages
await callTool('get_messages', {
  unread_only: true
});

// Mark as read
await callTool('mark_read', {
  message_ids: [1, 2, 3]
});
```

**v2.0:**
```typescript
// Send message
await callTool('message', {
  action: 'send',
  from_agent: 'agent1',
  to_agent: 'agent2',
  message: 'Task complete',
  priority: 'high'
});

// Get messages
await callTool('message', {
  action: 'get',
  unread_only: true
});

// Mark as read
await callTool('message', {
  action: 'mark_read',
  message_ids: [1, 2, 3]
});
```

### File Tracking

**v1.x:**
```typescript
// Record file change
await callTool('record_file_change', {
  file_path: '/src/auth.ts',
  agent_name: 'auth-agent',
  change_type: 'modified',
  layer: 'business'
});

// Get file changes
await callTool('get_file_changes', {
  since: '2025-01-10T10:00:00Z'
});

// Check file lock
await callTool('check_file_lock', {
  file_path: '/src/auth.ts'
});
```

**v2.0:**
```typescript
// Record file change
await callTool('file', {
  action: 'record',
  file_path: '/src/auth.ts',
  agent_name: 'auth-agent',
  change_type: 'modified',
  layer: 'business'
});

// Get file changes
await callTool('file', {
  action: 'get',
  since: '2025-01-10T10:00:00Z'
});

// Check file lock
await callTool('file', {
  action: 'check_lock',
  file_path: '/src/auth.ts'
});
```

### Constraints

**v1.x:**
```typescript
// Add constraint
await callTool('add_constraint', {
  category: 'performance',
  constraint_text: 'Response time < 200ms',
  priority: 'high'
});

// Get constraints
await callTool('get_constraints', {
  category: 'performance'
});

// Deactivate constraint
await callTool('deactivate_constraint', {
  constraint_id: 42
});
```

**v2.0:**
```typescript
// Add constraint
await callTool('constraint', {
  action: 'add',
  category: 'performance',
  constraint_text: 'Response time < 200ms',
  priority: 'high'
});

// Get constraints
await callTool('constraint', {
  action: 'get',
  category: 'performance'
});

// Deactivate constraint
await callTool('constraint', {
  action: 'deactivate',
  constraint_id: 42
});
```

### Utilities

**v1.x:**
```typescript
// Layer summary
await callTool('get_layer_summary');

// Database stats
await callTool('get_stats');

// Clear old data
await callTool('clear_old_data', {
  messages_older_than_hours: 48
});
```

**v2.0:**
```typescript
// Layer summary
await callTool('stats', {
  action: 'layer_summary'
});

// Database stats
await callTool('stats', {
  action: 'db_stats'
});

// Clear old data
await callTool('stats', {
  action: 'clear',
  messages_older_than_hours: 48
});
```

### Configuration

**v1.x:**
```typescript
// Get config
await callTool('get_config');

// Update config
await callTool('update_config', {
  ignoreWeekend: true,
  messageRetentionHours: 48
});
```

**v2.0:**
```typescript
// Get config
await callTool('config', {
  action: 'get'
});

// Update config
await callTool('config', {
  action: 'update',
  ignoreWeekend: true,
  messageRetentionHours: 48
});
```

## New Feature: Help Actions

v2.0 adds `action: "help"` to all tools for on-demand comprehensive documentation:

```typescript
// Get help for any tool
await callTool('decision', { action: 'help' });
await callTool('message', { action: 'help' });
await callTool('file', { action: 'help' });
await callTool('constraint', { action: 'help' });
await callTool('stats', { action: 'help' });
await callTool('config', { action: 'help' });
```

Each help action returns:
- Tool description
- Complete action list with parameters
- Usage examples
- Parameter requirements

**Zero token cost** until explicitly called!

## Migration Checklist

### 1. Update Package
```bash
npm install sqlew@2.0.0
# or
npm update sqlew
```

### 2. Update Tool Calls

Search your codebase for v1.x tool calls:

```bash
# Find all v1.x tool calls
grep -r "set_decision\|get_decision\|get_context\|search_by_tags" .
grep -r "send_message\|get_messages\|mark_read" .
grep -r "record_file_change\|get_file_changes\|check_file_lock" .
grep -r "add_constraint\|get_constraints\|deactivate_constraint" .
grep -r "get_layer_summary\|get_stats\|clear_old_data" .
grep -r "get_config\|update_config" .
```

Replace each with v2.0 equivalent using the mapping table above.

### 3. Test Your Changes

Use MCP Inspector to verify tool calls:

```bash
npx @modelcontextprotocol/inspector npx sqlew
```

Test each migrated tool call to ensure:
- ✅ Correct tool name
- ✅ `action` parameter included
- ✅ All other parameters unchanged
- ✅ Response structure matches expectations

### 4. Verify Database Works

Your existing database should work immediately with v2.0:

```bash
# Start v2.0 server with your existing database
npx sqlew /path/to/your/existing/v1.db

# Test a few operations
# Your data should be intact
```

## Parameter Changes

### search_by_tags

**v1.x:** `match_mode` parameter
**v2.0:** `tag_match` parameter

```typescript
// v1.x
search_by_tags({ tags: ['api'], match_mode: 'AND' })

// v2.0
decision({ action: 'search_tags', tags: ['api'], tag_match: 'AND' })
```

All other parameters remain unchanged.

## Common Pitfalls

### ❌ Forgetting `action` Parameter

```typescript
// WRONG - will fail
await callTool('decision', { key: 'auth_method' });

// CORRECT
await callTool('decision', { action: 'get', key: 'auth_method' });
```

### ❌ Using Old Tool Names

```typescript
// WRONG - tool doesn't exist
await callTool('set_decision', { action: 'set', key: 'auth' });

// CORRECT
await callTool('decision', { action: 'set', key: 'auth' });
```

### ❌ Wrong Action Name

```typescript
// WRONG - action doesn't exist
await callTool('decision', { action: 'search_tags', match_mode: 'AND' });

// CORRECT - parameter also renamed
await callTool('decision', { action: 'search_tags', tag_match: 'AND' });
```

## Rollback Plan

If you need to rollback to v1.x:

```bash
# Downgrade package
npm install sqlew@1.1.2

# Your database will continue to work
# No schema migration needed
```

Your v2.0 database is 100% compatible with v1.x servers.

## Benefits of v2.0

After migration, you'll enjoy:

- **96% Token Reduction:** Tool definitions use 481 tokens instead of 12,848
- **67% MCP Context Reduction:** From ~13,730 to ~4,482 tokens
- **On-Demand Help:** Use `action: "help"` for comprehensive documentation
- **Same Functionality:** All 20 original functions preserved
- **Better Organization:** Related operations grouped into single tools

## Support

Need help with migration?

- **Issues:** [GitHub Issues](https://github.com/sin5ddd/mcp-sqlew/issues)
- **Changelog:** See [CHANGELOG.md](CHANGELOG.md) for complete v2.0 details
- **Documentation:** Updated [README.md](README.md) with v2.0 examples

## Example: Complete Migration

Here's a complete before/after example showing typical usage:

### Before (v1.x)

```typescript
// Set up authentication decision
await callTool('set_decision', {
  key: 'auth_method',
  value: 'JWT',
  tags: ['security', 'api'],
  layer: 'business'
});

// Send notification
await callTool('send_message', {
  from_agent: 'auth-agent',
  to_agent: 'api-agent',
  message: 'Auth configured',
  priority: 'high'
});

// Track file change
await callTool('record_file_change', {
  file_path: '/src/auth.ts',
  agent_name: 'auth-agent',
  change_type: 'created',
  layer: 'business'
});

// Add constraint
await callTool('add_constraint', {
  category: 'security',
  constraint_text: 'Use JWT with RS256',
  priority: 'critical'
});
```

### After (v2.0)

```typescript
// Set up authentication decision
await callTool('decision', {
  action: 'set',
  key: 'auth_method',
  value: 'JWT',
  tags: ['security', 'api'],
  layer: 'business'
});

// Send notification
await callTool('message', {
  action: 'send',
  from_agent: 'auth-agent',
  to_agent: 'api-agent',
  message: 'Auth configured',
  priority: 'high'
});

// Track file change
await callTool('file', {
  action: 'record',
  file_path: '/src/auth.ts',
  agent_name: 'auth-agent',
  change_type: 'created',
  layer: 'business'
});

// Add constraint
await callTool('constraint', {
  action: 'add',
  category: 'security',
  constraint_text: 'Use JWT with RS256',
  priority: 'critical'
});
```

Only changes: tool names and added `action` parameters. All other parameters identical!
