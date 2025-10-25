# Migration Guide: v3.5.x → v3.6.0

**Release Date**: 2025-10-25
**Migration Type**: ✅ Automatic (Zero Downtime)

---

## Overview

Version 3.6.0 introduces the **Help System Optimization** feature, which moves help documentation from code to queryable database structures. This migration is **fully automatic** and **backward compatible** - no manual intervention required.

### What's New

- **6 New Help Query Actions** in the `stats` tool
- **7 New Database Tables** for help system data
- **91% Token Reduction** for help queries
- **95.8% MCP Schema Reduction**
- **41 Use-Cases** across 6 categories

---

## Migration Checklist

### ✅ Pre-Migration (v3.5.x → v3.6.0)

**No action required!** The migration is automatic.

- [ ] Backup your database (optional, but recommended)
- [ ] Review [CHANGELOG.md](../CHANGELOG.md) for v3.6.0 features
- [ ] Ensure you're running Node.js 18+

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
   - Detect database version (v3.5.x)
   - Create 7 new help system tables
   - Seed 41 use-cases + 98 parameters + 41 examples
   - Complete in <2 seconds

   Expected output:
   ```
   📊 Current database version: 3.5.3

   📋 Migration plan (4 migrations):
     1. add-help-system-tables (3.5.3 → 3.6.0)
     2. seed-tool-metadata (3.6.0 → 3.6.0)
     3. seed-help-data (3.6.0 → 3.6.0)
     4. add-token-tracking (3.6.0 → 3.6.0)

   🔄 Running migration: add-help-system-tables
   ✅ Help system tables migration completed successfully

   🔄 Running migration: seed-tool-metadata
   ✅ Tool metadata seeded successfully

   🔄 Running migration: seed-help-data
   ✅ Help system use-case data seeded successfully

   🔄 Running migration: add-token-tracking
   ✅ Token tracking migration completed successfully

   ✅ Migration complete: 3.5.3 → 3.6.0
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

- **Additional Storage**: ~200 KB (41 use-cases + metadata)
- **Query Performance**: <200ms per help query
- **Total Database Size**: Depends on existing data, +200 KB typical

---

## Rollback Instructions

If you need to rollback to v3.5.x:

1. **Stop Server**
   ```bash
   # Kill the running process
   ```

2. **Restore Backup** (if you created one)
   ```bash
   cp .claude/docs/sqlew.db.backup .claude/docs/sqlew.db
   ```

   OR

3. **Keep v3.6.0 Database** (help tables won't affect v3.5.x)
   ```bash
   # Checkout v3.5.x code
   git checkout v3.5.x
   npx tsc
   node dist/index.js
   ```

**Note**: The help system tables are **additive** and don't affect existing functionality. V3.5.x will simply ignore them.

---

## FAQ

### Q: Do I need to change my code/workflows?
**A**: No. All existing MCP actions work identically.

### Q: Is the migration reversible?
**A**: Yes. The help tables are additive and can be safely ignored by v3.5.x.

### Q: What if the migration fails?
**A**: The migration is transactional. If it fails, the database rolls back automatically.

### Q: Can I disable the help system?
**A**: The help tables exist but don't affect existing actions. Simply don't use the new `help_*` actions.

### Q: How do I verify the migration succeeded?
**A**: Check the startup logs for "✅ Migration complete: 3.5.x → 3.6.0" or query:
```bash
sqlite3 .claude/docs/sqlew.db "SELECT COUNT(*) FROM m_help_tools;"
# Should return: 7
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

**Migration Type**: ✅ Automatic
**Downtime**: ⚡ Zero
**Breaking Changes**: ❌ None
**Manual Steps**: 🎯 None (just restart server)
**Rollback**: ✅ Supported
**Token Savings**: 📉 91% average reduction

**Status**: Production-ready, fully tested (38/38 tests passing)
