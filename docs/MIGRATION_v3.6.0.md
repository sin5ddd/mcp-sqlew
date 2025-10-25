# Migration Guide: v3.3.x → v3.6.0

**Release Date**: 2025-10-25
**Migration Type**: ✅ Automatic (Zero Downtime)

---

## Overview

Version 3.6.0 introduces major improvements:
- **Knex.js Database Layer**: Cross-database support (SQLite/PostgreSQL/MySQL)
- **Help System Optimization**: Database-driven queries (60-70% token reduction)
- **Enhanced Performance**: Optimized query patterns and indexing

Migration is **fully automatic** and **backward compatible**.

### What's New

- Cross-database support with automatic migrations
- 6 new help query actions (`help_action`, `help_params`, `help_tool`, `help_use_case`, `help_list_use_cases`, `help_next_actions`)
- 7 new database tables for help system
- 41 queryable use-cases across 6 categories
- v3.5.x branch deprecated (migrate directly from v3.3.x)

---

## Migration Checklist

### ✅ Pre-Migration

- [ ] Backup database: `cp .claude/docs/sqlew.db .claude/docs/sqlew.db.backup`
- [ ] Ensure Node.js 18+
- [ ] Review [CHANGELOG.md](../CHANGELOG.md)

### ✅ Migration Steps

1. **Update & Rebuild**
   ```bash
   git pull origin main
   npm install
   npx tsc
   ```

2. **Start Server**
   ```bash
   node dist/index.js --db-path=.claude/docs/sqlew.db
   ```

   Migration runs automatically:
   - Detects v3.3.x database
   - Migrates to Knex.js schema
   - Creates 7 help system tables
   - Seeds 41 use-cases + metadata
   - Completes in <5 seconds

3. **Verify**
   ```bash
   # Check migration succeeded
   sqlite3 .claude/docs/sqlew.db "SELECT COUNT(*) FROM knex_migrations;"
   # Returns: 4
   ```

### ✅ Post-Migration

- [ ] Verify existing tools work
- [ ] Test new help actions (optional)

---

## Breaking Changes

**None** - 100% backward compatible. All existing actions work identically.

---

## New Features

### 6 Help Query Actions (stats tool)

| Action | Purpose | Token Savings |
|--------|---------|---------------|
| `help_action` | Action parameters + examples | ~200 tokens (vs ~2,000) |
| `help_params` | Parameter list only | ~229 tokens (vs ~1,500) |
| `help_tool` | Tool overview + actions | ~139 tokens (vs ~5,000) |
| `help_use_case` | Single use-case workflow | ~150 tokens each |
| `help_list_use_cases` | Filter/list use-cases | ~282-584 tokens |
| `help_next_actions` | Common next actions | ~63 tokens |

Example:
```json
{"tool": "stats", "action": "help_action", "tool": "decision", "action": "set"}
```

---

## Database Changes

### New Tables (7)

**Master Tables:**
1. `m_help_tools` - Tool metadata (7 tools)
2. `m_help_actions` - Actions (41 total)
3. `m_help_use_case_categories` - Categories (6)

**Transaction Tables:**
4. `t_help_action_params` - Parameters (98)
5. `t_help_action_examples` - Examples (41)
6. `t_help_use_cases` - Use-cases (41)
7. `t_help_action_sequences` - Common patterns

### Impact

- Size: +210 KB (Knex overhead ~10 KB, help system ~200 KB)
- Performance: <200ms per help query
- Knex tracking: `knex_migrations` and `knex_migrations_lock` tables added

---

## Rollback Instructions

**Important**: v3.6.0 uses Knex.js schema - **must restore backup** to rollback.

1. Stop server
2. Restore backup: `cp .claude/docs/sqlew.db.backup .claude/docs/sqlew.db`
3. Checkout v3.3.x:
   ```bash
   git checkout v3.3.x
   npm install && npx tsc
   node dist/index.js
   ```

**Note**: v3.5.x deprecated - migrate directly v3.3.x → v3.6.0.

---

## FAQ

**Q: Do I need to change my code/workflows?**
A: No. All existing actions work identically.

**Q: Is the migration reversible?**
A: Yes, but requires restoring database backup (Knex schema incompatible with v3.3.x).

**Q: What if migration fails?**
A: Migration is transactional - auto-rollback on failure.

**Q: Can I disable the help system?**
A: Yes - simply don't use the new `help_*` actions.

**Q: How do I verify migration succeeded?**
A: Check logs for "✓ Migration complete: 3.3.x → 3.6.0" or run:
```bash
sqlite3 .claude/docs/sqlew.db "SELECT COUNT(*) FROM knex_migrations;"
# Returns: 4
```

**Q: Performance impact?**
A: Negligible. Help queries are optional and independent.

---

## Summary

- **Path**: v3.3.x → v3.6.0 (skip v3.5.x)
- **Type**: Automatic (zero downtime)
- **Breaking Changes**: None
- **Rollback**: Requires backup restore
- **Token Savings**: 60-70% (help queries)

**Always backup before upgrading.**
