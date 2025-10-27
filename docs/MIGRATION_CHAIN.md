# Migration Chain Documentation

> **⚠️ HISTORICAL DOCUMENT (v1.0.0 - v2.1.0)**
>
> This document describes the **old custom migration system** used before v3.6.2.
>
> **As of v3.6.2**, sqlew uses **Knex.js migrations only**. See the migration files in:
> - `src/migrations/knex/upgrades/` - Version upgrade paths
> - `src/migrations/knex/bootstrap/` - Fresh install schema
> - `src/migrations/knex/enhancements/` - Feature additions
>
> This document is kept for historical reference only.

---

This document describes the complete migration path from v1.0.0 to v2.1.0 for mcp-sqlew databases.

## Schema Version History

### v1.0.0 (Initial Release)
- **Table Names:** No prefixes
  - Master: `agents`, `files`, `context_keys`, `constraint_categories`, `layers`, `tags`, `scopes`
  - Transaction: `decisions`, `decisions_numeric`, `decision_history`, `decision_tags`, `decision_scopes`, `agent_messages`, `file_changes`, `constraints`, `constraint_tags`
  - Views: `tagged_decisions`, `active_context`, `layer_summary`, `unread_messages_by_priority`, `recent_file_changes`, `tagged_constraints`
  - Triggers: `auto_delete_old_messages`, `auto_delete_old_file_changes`, `record_decision_history`
- **Configuration:** No `config` table (hardcoded settings)
- **Comments:** Japanese

### v1.1.0 - v1.1.2 & v2.0.0 (Table Prefixes)
- **Table Names:** WITH prefixes
  - Master: `m_agents`, `m_files`, `m_context_keys`, `m_constraint_categories`, `m_layers`, `m_tags`, `m_scopes`, **`m_config` (NEW)**
  - Transaction: `t_decisions`, `t_decisions_numeric`, `t_decision_history`, `t_decision_tags`, `t_decision_scopes`, `t_agent_messages`, `t_file_changes`, `t_constraints`, `t_constraint_tags`
  - Views: `v_tagged_decisions`, `v_active_context`, `v_layer_summary`, `v_unread_messages_by_priority`, `v_recent_file_changes`, `v_tagged_constraints`
  - Triggers: `trg_record_decision_history` (auto-delete triggers removed)
- **Configuration:** `m_config` table added with weekend-aware auto-deletion settings
- **Comments:** Japanese
- **Notes:**
  - v1.1.1: Hotfix for migration failure (creates m_config if missing)
  - v1.1.2: Hotfix for schema validation (checks for prefixed names)
  - v2.0.0: API changes only (20 tools → 6 action-based tools), **no schema changes**

### v2.1.0 (Feature Release - Current)
- **New Tables:**
  - `t_activity_log` - Automatic activity logging (agent_id, action_type, target, layer_id, details, ts)
  - `t_decision_templates` - Decision templates (name, defaults, required_fields, created_by, ts)
- **New Triggers:**
  - `trg_log_decision_set` - Auto-log decision creation
  - `trg_log_decision_update` - Auto-log decision updates
  - `trg_log_message_send` - Auto-log message sending
  - `trg_log_file_record` - Auto-log file changes
- **New Indexes:**
  - `idx_activity_log_ts` - Time-based activity queries
  - `idx_activity_log_agent` - Agent-based activity queries
  - `idx_activity_log_action` - Action type filtering
- **Comments:** English (translated from Japanese)
- **Built-in Data:** 5 decision templates seeded

## Migration Scripts

### 1. v1.0.0 → v1.1.x: add-table-prefixes.ts
**Purpose:** Rename all tables to add category-based prefixes and create m_config table

**Actions:**
1. Drop old views (they reference old table names)
2. Drop old triggers
3. Rename master tables (agents → m_agents, etc.)
4. Rename transaction tables (decisions → t_decisions, etc.)
5. Create m_config table if missing
6. Insert default config values
7. Schema initialization creates new views/triggers

**Transaction:** Yes (rollback on failure)
**Auto-detect:** Checks for existence of `agents` (old) and absence of `m_agents` (new)

### 2. v1.1.x / v2.0.0 → v2.1.0: add-v2.1.0-features.ts
**Purpose:** Add activity logging and template system

**Actions:**
1. Create `t_activity_log` table with 3 indexes
2. Create `t_decision_templates` table
3. Create 4 activity logging triggers
4. Seed 5 built-in templates

**Transaction:** Yes (rollback on failure)
**Auto-detect:** Checks for absence of `t_activity_log` OR `t_decision_templates`

## Migration Execution Order

The migrations run automatically on server startup in this order:

```
1. Check v1.0.0 → v1.1.x migration (add-table-prefixes.ts)
   ├─ If needed: Run migration
   ├─ Run schema initialization (creates views/triggers)
   └─ Continue to next check

2. Check v1.1.x/v2.0.0 → v2.1.0 migration (add-v2.1.0-features.ts)
   ├─ If needed: Run migration
   └─ Continue

3. Validate schema integrity
   ├─ Check all required tables exist
   ├─ Check all required views exist
   ├─ Check all required triggers exist
   ├─ Verify standard data (5 layers, 3 categories, 10+ tags)
   └─ Exit with error if validation fails

4. Start MCP server
```

## Complete Migration Paths

### Path 1: v1.0.0 → v2.1.0 (Full Chain)
```
v1.0.0 (no prefixes, no config)
  ↓ add-table-prefixes.ts
v1.1.0 (prefixes, m_config added)
  ↓ add-v2.1.0-features.ts
v2.1.0 (activity_log, templates added)
```

**Steps:**
1. Start server with v1.0.0 database
2. Detects unprefixed tables → runs add-table-prefixes.ts
3. Migration adds prefixes and m_config table
4. Schema initialization creates new views/triggers
5. Detects missing v2.1.0 tables → runs add-v2.1.0-features.ts
6. Migration adds t_activity_log, t_decision_templates, 4 triggers
7. Schema validation passes
8. Server starts with v2.1.0 schema

### Path 2: v1.1.x / v2.0.0 → v2.1.0 (Single Migration)
```
v1.1.0-v1.1.2 or v2.0.0 (prefixes, m_config present)
  ↓ add-v2.1.0-features.ts
v2.1.0 (activity_log, templates added)
```

**Steps:**
1. Start server with v1.1.x or v2.0.0 database
2. Detects prefixed tables exist → skips add-table-prefixes.ts
3. Detects missing v2.1.0 tables → runs add-v2.1.0-features.ts
4. Migration adds t_activity_log, t_decision_templates, 4 triggers
5. Schema validation passes
6. Server starts with v2.1.0 schema

### Path 3: Fresh Install → v2.1.0 (No Migration)
```
Empty database
  ↓ schema initialization
v2.1.0 (full schema created)
```

**Steps:**
1. Start server with empty/new database path
2. No existing schema detected
3. Schema initialization runs (executes assets/schema.sql)
4. All tables, views, triggers created directly from v2.1.0 schema
5. Schema validation passes
6. Server starts with v2.1.0 schema

## Schema Validation (v2.1.0 Requirements)

The schema validator (`src/schema.ts`) checks for:

**Tables (19 total):**
- Master (8): m_agents, m_files, m_context_keys, m_constraint_categories, m_layers, m_tags, m_scopes, m_config
- Transaction (11): t_decisions, t_decisions_numeric, t_decision_history, t_decision_tags, t_decision_scopes, t_agent_messages, t_file_changes, t_constraints, t_constraint_tags, **t_activity_log**, **t_decision_templates**

**Views (6 total):**
- v_tagged_decisions, v_active_context, v_layer_summary, v_unread_messages_by_priority, v_recent_file_changes, v_tagged_constraints

**Triggers (5 total):**
- trg_record_decision_history
- **trg_log_decision_set** (NEW in v2.1.0)
- **trg_log_decision_update** (NEW in v2.1.0)
- **trg_log_message_send** (NEW in v2.1.0)
- **trg_log_file_record** (NEW in v2.1.0)

**Standard Data:**
- 5 layers (presentation, business, data, infrastructure, cross-cutting)
- 3 constraint categories (performance, architecture, security)
- 10+ tags (authentication, authorization, performance, security, api, database, caching, testing, validation, error-handling)
- 3+ config entries (autodelete_ignore_weekend, autodelete_message_hours, autodelete_file_history_days)

## Testing Migration Chain

### Test 1: v1.0.0 → v2.1.0
```bash
# Create v1.0.0 database (use git checkout)
git checkout v1.0.0
node dist/index.js --db-path=.test/v1.0.0.db
# Let it initialize with v1.0.0 schema
# Stop server (Ctrl+C)

# Upgrade to v2.1.0
git checkout main
npm run build
node dist/index.js --db-path=.test/v1.0.0.db
# Should run BOTH migrations automatically
# Check logs for:
#   "Migration required: Adding table prefixes (v1.2.0 -> v1.3.0)"
#   "Migration required: Adding v2.1.0 features (v2.0.0 -> v2.1.0)"
```

### Test 2: v2.0.0 → v2.1.0
```bash
# Create v2.0.0 database
git checkout v2.0.0
npm run build
node dist/index.js --db-path=.test/v2.0.0.db
# Stop server

# Upgrade to v2.1.0
git checkout main
npm run build
node dist/index.js --db-path=.test/v2.0.0.db
# Should run ONLY v2.1.0 migration
# Check logs for:
#   "Migration required: Adding v2.1.0 features (v2.0.0 -> v2.1.0)"
```

### Test 3: Fresh v2.1.0
```bash
# Fresh install
node dist/index.js --db-path=.test/fresh-v2.1.0.db
# Should initialize directly to v2.1.0
# No migration messages
```

## Rollback Strategy

If a migration fails:
1. **Transaction rollback** - All changes reverted automatically
2. **Database unchanged** - Original schema preserved
3. **Server exits** - Prevents running with corrupted schema
4. **Error message displayed** - Clear indication of failure

To manually rollback:
```bash
# Restore from backup (recommended)
cp backup.db current.db

# Or delete and reinitialize
rm .sqlew/sqlew.db
node dist/index.js  # Creates fresh v2.1.0 database
```

## Troubleshooting

### Migration Doesn't Run
- Check that database file exists and is accessible
- Verify SQLite version supports required features
- Check file permissions

### Migration Fails Midway
- Check error message in console
- Database is automatically rolled back
- No partial state - safe to retry

### Schema Validation Fails After Migration
- Report as bug (migration should guarantee valid schema)
- Check logs for missing components
- May need to restore from backup or delete database

## Future Migrations

When adding new features in future versions:

1. Create new migration script: `src/migrations/add-vX.Y.Z-features.ts`
2. Implement `needsMigration()`, `runMigration()`, `getMigrationInfo()`
3. Import in `src/database.ts`
4. Add check AFTER previous migrations, BEFORE schema validation
5. Update `src/schema.ts` validation requirements
6. Update `assets/schema.sql` with new schema
7. Document in CHANGELOG.md and this file
8. Test complete migration chain from oldest supported version

## Backward Compatibility

**Database:** v2.1.0 can read and migrate v1.0.0, v1.1.x, and v2.0.0 databases
**API:** v2.0.0 tool calls work unchanged in v2.1.0 (backward compatible)
**Forward Compatibility:** Older versions CANNOT read v2.1.0 databases (missing tables/triggers)

## Summary

- ✅ v1.0.0 → v2.1.0: Full migration chain supported
- ✅ v1.1.x → v2.1.0: Single migration
- ✅ v2.0.0 → v2.1.0: Single migration
- ✅ Fresh install: Direct v2.1.0 schema
- ✅ Transaction-based: Safe rollback on failure
- ✅ Auto-detect: Runs only needed migrations
- ✅ Schema validation: Ensures integrity
