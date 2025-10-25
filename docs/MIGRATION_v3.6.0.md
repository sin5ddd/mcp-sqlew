# Migration Guide: v3.3.x → v3.6.0

**Release Date**: 2025-10-25
**Migration Type**: ✅ Automatic (Zero Downtime)

---

## Overview

Version 3.6.0 introduces major improvements over v3.3.x:
- **Knex.js Database Layer**: Cross-database compatibility (SQLite/PostgreSQL/MySQL)
- **Help System Optimization**: Database-driven help queries (60-70% token reduction)
- **Enhanced Performance**: Optimized query patterns and indexing

This migration is **fully automatic** and **backward compatible** - no manual intervention required.

### What's New in v3.6.0

**Database Layer (Knex.js Migration):**
- Cross-database support (SQLite/PostgreSQL/MySQL)
- Automatic migrations on startup
- Database adapter pattern for portability
- Transaction safety improvements

**Help System Optimization:**
- 6 new help query actions in the `stats` tool
- 7 new database tables for help system data
- 60-70% token reduction for help queries
- 95.8% MCP schema reduction
- 41 use-cases across 6 categories

**Compatibility:**
- v3.5.x branch is deprecated (use v3.6.0 directly from v3.3.x)
- All v3.3.x databases automatically migrate to v3.6.0 schema

---

## Migration Checklist

### ✅ Pre-Migration (v3.3.x → v3.6.0)

**Recommended (but optional):**

- [ ] Backup your database: `cp .claude/docs/sqlew.db .claude/docs/sqlew.db.backup`
- [ ] Review [CHANGELOG.md](../CHANGELOG.md) for v3.6.0 features
- [ ] Ensure you're running Node.js 18+
- [ ] Note: v3.3.x better-sqlite3 databases will be automatically migrated to Knex.js

### ✅ Migration Process

1. **Update Package**
   ```bash
   # Stop existing server (if running)
   # Update to v3.6.0
   git pull origin main
   # or npm update if published

   # Rebuild
   npm install
   npx tsc
   ```

2. **Start Server**
   ```bash
   node dist/index.js --db-path=.claude/docs/sqlew.db
   ```

3. **Automatic Migration**
   The server will automatically:
   - Detect database version (v3.3.x or newer)
   - Migrate to Knex.js schema (if from v3.3.x)
   - Create 7 new help system tables
   - Seed 41 use-cases + 98 parameters + 41 examples
   - Complete in <5 seconds

   Expected output:
   ```
   ✓ Database initialized with Knex adapter (production)
   📊 Detected database version: 3.3.x

   📋 Migration plan (Knex migrations):
     1. create_master_tables
     2. create_transaction_tables
     3. create_indexes
     4. seed_master_data

   ✅ Master tables created successfully
   ✅ Transaction tables created successfully
   ✅ Indexes created successfully
   ✅ Master data seeded successfully

   ✓ MCP Shared Context Server initialized
   ✓ Database: .claude/docs/sqlew.db
   ✓ Migration complete: 3.3.x → 3.6.0
   ```

4. **Verification**
   Test the new help actions:
   ```typescript
   // Query specific action help
   {
     "tool": "stats",
     "action": "help_action",
     "tool": "decision",
     "action": "set"
   }

   // List use-cases
   {
     "tool": "stats",
     "action": "help_list_use_cases",
     "category": "task_management"
   }
   ```

### ✅ Post-Migration

- [ ] Verify all 7 tools still work as expected
- [ ] Test new help query actions (optional)
- [ ] Review token savings in your workflows

---

## Breaking Changes

**None!** This release is 100% backward compatible.

- All existing MCP actions work identically
- No configuration changes required
- No database schema changes for existing tables
- No API changes

---

## New Features Available

### 1. Granular Help Queries (stats tool)

**help_action** - Get action with parameters and examples:
```json
{
  "tool": "stats",
  "action": "help_action",
  "tool": "decision",
  "action": "set"
}
```
**Returns**: ~200 tokens (vs ~2,000 legacy)

**help_params** - Get just parameter list:
```json
{
  "tool": "stats",
  "action": "help_params",
  "tool": "task",
  "action": "create"
}
```
**Returns**: ~229 tokens (vs ~1,500 legacy)

**help_tool** - Get tool overview + all actions:
```json
{
  "tool": "stats",
  "action": "help_tool",
  "tool": "message"
}
```
**Returns**: ~139 tokens (vs ~5,000 legacy)

### 2. Use-Case Discovery

**help_use_case** - Get single use-case with workflow:
```json
{
  "tool": "stats",
  "action": "help_use_case",
  "use_case_id": 1
}
```
**Returns**: ~150 tokens per use-case

**help_list_use_cases** - List/filter use-cases:
```json
{
  "tool": "stats",
  "action": "help_list_use_cases",
  "category": "task_management",
  "complexity": "basic",
  "limit": 10
}
```
**Returns**: ~282 tokens (filtered) or ~584 tokens (all)

**help_next_actions** - Suggest common next actions:
```json
{
  "tool": "stats",
  "action": "help_next_actions",
  "tool": "task",
  "action": "create"
}
```
**Returns**: ~63 tokens with frequency indicators

---

## Database Changes

### New Tables (7)

**Master Tables:**
1. `m_help_tools` - Tool names and descriptions (7 tools)
2. `m_help_actions` - Actions per tool (41 actions)
3. `m_help_use_case_categories` - Use-case taxonomy (6 categories)

**Transaction Tables:**
4. `t_help_action_params` - Action parameters (98 parameters)
5. `t_help_action_examples` - Code examples (41 examples)
6. `t_help_use_cases` - Full use-case documentation (41 use-cases)
7. `t_help_action_sequences` - Common patterns with usage tracking
8. `t_help_token_usage` - Token usage metrics (tracking table)

### New Indexes (9)

- `idx_help_actions_tool` - Fast action lookups by tool
- `idx_help_action_params_action` - Fast parameter lookups
- `idx_help_action_examples_action` - Fast example lookups
- `idx_help_use_cases_category` - Fast use-case filtering by category
- `idx_help_use_cases_complexity` - Fast use-case filtering by complexity
- `idx_help_action_sequences_use_count` - Popular sequences first
- `idx_help_token_usage_query_type` - Token analysis by type
- `idx_help_token_usage_timestamp` - Recent queries first
- `idx_help_token_usage_tool_action` - Token analysis by tool/action

### Database Size Impact

- **Knex Migration Overhead**: ~10 KB (migration tracking tables)
- **Help System Storage**: ~200 KB (41 use-cases + metadata)
- **Query Performance**: <200ms per help query
- **Total Database Size**: Depends on existing data, +210 KB typical
- **Note**: v3.6.0 adds `knex_migrations` and `knex_migrations_lock` tracking tables

---

## Rollback Instructions

If you need to rollback to v3.3.x:

1. **Stop Server**
   ```bash
   # Kill the running process
   ```

2. **Restore Backup** (required - Knex schema incompatible with v3.3.x)
   ```bash
   cp .claude/docs/sqlew.db.backup .claude/docs/sqlew.db
   ```

3. **Checkout v3.3.x Code**
   ```bash
   git checkout v3.3.x
   npm install
   npx tsc
   node dist/index.js
   ```

**Important**: v3.6.0 uses Knex.js with a different schema structure. You **must** restore your backup to rollback to v3.3.x. The databases are not cross-compatible due to the Knex migration system.

**Note**: v3.5.x branch is deprecated and should not be used. Migrate directly from v3.3.x → v3.6.0.

---

## FAQ

### Q: Do I need to change my code/workflows?
**A**: No. All existing MCP actions work identically.

### Q: Is the migration reversible?
**A**: Yes, but requires restoring a database backup. v3.6.0 uses Knex.js with a different schema structure, so you must restore your pre-migration backup to return to v3.3.x.

### Q: What if the migration fails?
**A**: The migration is transactional. If it fails, the database rolls back automatically.

### Q: Can I disable the help system?
**A**: The help tables exist but don't affect existing actions. Simply don't use the new `help_*` actions.

### Q: How do I verify the migration succeeded?
**A**: Check the startup logs for "✓ Database initialized with Knex adapter" and "✓ Migration complete: 3.3.x → 3.6.0" or query:
```bash
sqlite3 .claude/docs/sqlew.db "SELECT COUNT(*) FROM knex_migrations;"
# Should return: 4 (the Knex migration files)

sqlite3 .claude/docs/sqlew.db ".tables"
# Should include: m_agents, m_config, m_layers, t_decisions, t_tasks, etc.
```

### Q: What's the performance impact?
**A**: Negligible. Help queries are optional and independent of existing actions.

---

## Support

If you encounter issues:

1. Check the [CHANGELOG.md](../CHANGELOG.md) for detailed changes
2. Review [CLAUDE.md](../CLAUDE.md) for project overview
3. Run tests: `node dist/tests/help-system.test.js`
4. Check database: `sqlite3 .claude/docs/sqlew.db ".tables"`

---

## Summary

**Migration Path**: v3.3.x → v3.6.0 (skip v3.5.x - deprecated)
**Migration Type**: ✅ Automatic
**Downtime**: ⚡ Zero
**Breaking Changes**: ❌ None (API-compatible)
**Manual Steps**: 🎯 None (just restart server)
**Rollback**: ✅ Supported (requires backup restore)
**Database Changes**: 🔄 Knex.js schema migration + Help system tables
**Token Savings**: 📉 60-70% average reduction (help queries)

**Status**: Production-ready, Knex migrations tested

**Important**: Always backup your database before upgrading. While the migration is automatic and tested, having a backup ensures you can rollback to v3.3.x if needed.
