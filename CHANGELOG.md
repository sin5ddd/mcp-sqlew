# Changelog

All notable changes to sqlew will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.8.1] - 2025-11-11

### Fixed

**Critical Installation Bug**

- Fixed `npm error Invalid Version:` error when installing sqlew@3.8.0
- Changed `@modelcontextprotocol/sdk` dependency from `"latest"` to `"^1.21.1"` in package.json
- The `"latest"` tag is not a valid semver version for published packages and caused npm dependency resolution to fail
- This is a **hotfix release** that resolves installation issues preventing users from using v3.8.0

**Impact:**
- All users experiencing `Invalid Version:` errors when running `npx sqlew` can now install successfully
- No functional changes from v3.8.0 - only dependency version fix

---

## [3.8.0] - 2025-11-09

### BREAKING CHANGES

**Batch Action Naming Standardization**

`task.batch_create` has been renamed to `task.create_batch` to follow the `<verb>_batch` naming pattern used by other batch actions (`set_batch`, `record_batch`).

**Migration Required:**
```typescript
// ❌ Old (v3.7.x and earlier)
task({ action: "batch_create", tasks: [...] })

// ✅ New (v3.8.0+)
task({ action: "create_batch", tasks: [...] })
```

**Rationale:**
- Achieves 100% consistency across all batch actions
- Improves alphabetical sorting in IDE auto-completion (create → create_batch)
- Aligns with industry standard (REST APIs, GraphQL, ORMs use suffix pattern)
- See docs/ADR-batch-naming-standard.md for full justification

**Impact:**
- All code using `task.batch_create` must update to `task.create_batch`
- Simple find-replace migration (estimated 2-5 minutes per integration)
- No database schema changes required

### Removed

**Config Tool Removed (Phase 6)**

The orphaned config tool has been removed in favor of CLI-only configuration:

- **Deleted**: `src/tools/config.ts` (307 lines)
- **Removed**: `ConfigAction` type from `src/types.ts` and `src/types/actions.ts`
- **Removed**: ConfigAction import from `src/utils/parameter-validator.ts`
- **Updated**: README.md with CLI-only config approach documentation
- **Updated**: docs/CONFIGURATION.md already documented config tool removal

**Why removed:**
- Config tool was never registered in `tool-registry.ts` (orphaned code)
- Messaging system deprecated (primary use case eliminated)
- File-based configuration (`.sqlew/config.toml`) is clearer and more maintainable
- Runtime updates were confusing (changes lost on restart unless manually synced to file)
- Configuration drift between `m_config` table and config file

**Migration Path:**
- ✅ **Use `.sqlew/config.toml`** for all configuration (persistent, version-controlled)
- ✅ **Use CLI arguments** for one-time overrides (`--autodelete-message-hours=48`)
- ✅ **Internal config operations** preserved (`src/database/config/config-ops.ts`)
- ✅ **m_config table** preserved (used internally by retention logic)

**Impact:**
- Cleaner codebase with ~300 lines removed
- No functional impact - tool was never registered
- Configuration via file and CLI arguments only

**Message Tool Completely Removed**

The deprecated message tool has been completely removed from the codebase:

- **Deleted**: `src/tools/messaging.ts` (599 lines)
- **Removed**: Message tool entry from `tool-registry.ts`
- **Removed**: Message tool handler from `tool-handlers.ts`
- **Removed**: Message imports from `cli.ts`
- **Updated**: `MessageAction` type changed to `never` (backward compatibility stub)
- **CLI**: `sqlew query messages` now returns error message

**Migration Path**:
- No action required - messaging system was already marked deprecated in v3.6.6
- The `t_agent_messages` table was dropped in v3.6.6
- All message tool actions returned deprecation warnings since v3.6.6

**Impact**:
- Cleaner codebase with ~700 lines removed
- No functional impact - messaging system was unused
- MessageAction type remains as deprecated stub for backward compatibility

### Added

**Layer Expansion (5→9 layers)**

Added 4 new layers to enable better task classification and semantic validation:

**New FILE_REQUIRED layers:**
- `documentation` - README, CHANGELOG, API docs, architecture docs (file_actions required)

**New FILE_OPTIONAL layers:**
- `planning` - Research, spike tasks, investigation (file_actions optional)
- `coordination` - Multi-agent orchestration, task delegation (file_actions optional)
- `review` - Code review, design review, verification (file_actions optional)

**Existing layers** (5→6 FILE_REQUIRED):
- presentation, business, data, infrastructure, cross-cutting (file_actions required or empty array)

**Benefits:**
- Documentation layer enforces file operations for docs work
- Planning layers allow pure research tasks without file boilerplate
- Better semantic task classification across the development lifecycle

**file_actions Parameter for Tasks**

Introduced semantic `file_actions` parameter to replace generic `watch_files`:

```typescript
// New file_actions parameter
task.create({
  title: "Implement OAuth",
  layer: "business",
  file_actions: [
    { action: "create", path: "src/auth/oauth.ts" },
    { action: "edit", path: "src/api/router.ts" },
    { action: "delete", path: "src/auth/legacy.ts" }
  ]
});

// Backward compatible - watch_files still works
task.create({
  title: "Update config",
  layer: "infrastructure",
  watch_files: ["config.toml"]  // Auto-converts to file_actions
});
```

**Layer-Based Validation:**
- FILE_REQUIRED layers (6) → Must provide `file_actions` or `[]`
- FILE_OPTIONAL layers (3) → Can omit `file_actions` entirely
- Clear error messages with layer-specific guidance

**Benefits:**
- Self-documenting: `action: 'create'` vs `action: 'edit'` shows intent
- Prevents forgotten file watchers (validation enforced)
- No boilerplate for planning tasks (can omit parameter)
- Better token efficiency with automatic file watching

**PostgreSQL Adapter Implementation**

Full PostgreSQL 12+ support with complete adapter implementation:

**Adapter Features:**
- All 15 abstract methods implemented (`insertReturning`, `upsert`, `jsonExtract`, etc.)
- PostgreSQL-specific SQL syntax (RETURNING, ON CONFLICT, string_agg)
- Strict type handling (TRUE/FALSE for booleans, not 1/0)
- Timezone-aware timestamp functions
- Transaction support with savepoints

**Migration Compatibility:**
- All 22 migrations tested and verified on PostgreSQL 16.10
- Cross-database helper functions for view creation
- Proper CASCADE handling for foreign key dependencies
- Sequence management after explicit ID inserts
- GROUP BY strictness compliance

**Supported Databases:**
- SQLite 3.x (default, development)
- MySQL 8.0 / MariaDB 10+ (production)
- PostgreSQL 12+ (production) ✨ NEW

**Configuration:**
```toml
[database]
type = "postgres"

[database.connection]
host = "localhost"
port = 5432
database = "sqlew_db"

[database.auth]
type = "direct"
user = "sqlew_user"
password = "secret"
```

### Fixed

**Batch Action Parameter Parsing**

Fixed MCP client array serialization issue affecting all batch actions:

**Problem:** MCP client serializes array parameters as JSON strings:
```typescript
// MCP sends:
decisions: "[{\"key\": \"test\", \"value\": \"val\"}]"  // String!

// Expected:
decisions: [{key: "test", value: "val"}]  // Array
```

**Solution:** Added JSON parsing in `tool-handlers.ts` for all batch actions:
- `decision.set_batch` - parse `decisions` parameter
- `file.record_batch` - parse `file_changes` parameter
- `task.create_batch` - parse `tasks` parameter

**Impact:** All batch actions now work correctly with array parameters from MCP client.

**Help System Synchronization**

Fixed critical bug where help database was severely out of sync with code:

**Problem:** 25 actions missing from `m_help_actions` table, causing help system to lie about available actions.

**Missing Actions:**
- decision: 9 actions (quick_set, search_advanced, set_batch, has_updates, etc.)
- task: 14 actions (update, get, list, move, link, archive, create_batch, etc.)
- constraint: 1 action (use_case)

**Solution:** Created migration `20251109020000_fix_missing_help_actions_v3_8_0.ts` to:
- Add all 25 missing actions with correct descriptions
- Idempotent checks to prevent duplicates
- Full synchronization between code and database

**Impact:** Help system now accurately reports all available actions.

### Changed

**Tool Registry Schema Fix**

Added `additionalProperties: true` to all tool schemas in `tool-registry.ts`:

**Problem:** MCP couldn't pass action-specific parameters (key, value, tags, etc.) because schemas only defined `action` property.

**Solution:**
```typescript
{
  name: 'decision',
  inputSchema: {
    type: 'object',
    properties: {
      action: { ... }
    },
    required: ['action'],
    additionalProperties: true,  // ← CRITICAL FIX
  },
}
```

**Impact:** All MCP tools now accept action-specific parameters correctly.

---

## [3.7.4] - 2025-11-08

### Added - Complete JSON Import/Export System

**Full-featured data migration system with smart ID remapping and dependency resolution**

#### New Features

- **db:import CLI Command** - Import project data from JSON exports with automatic ID remapping
  - Smart conflict detection (skip-if-exists, project-name override)
  - Dry-run mode for validation before import
  - Comprehensive error messages with validation details
- **Topological Sort Algorithm** - Resolves task dependencies during import
  - Circular dependency detection prevents import of invalid dependency graphs
  - BFS-based topological sorting ensures dependencies imported before dependents
  - Preserves all task relationships and blocking constraints
- **Smart ID Remapping** - Handles complex foreign key relationships
  - Master table merge logic (reuse existing entries by name/path)
  - Transaction table ID translation with bidirectional mapping
  - Junction table relationship preservation
  - Automatic orphan cleanup for invalid references

#### Import System Architecture

- **4 Core Modules**:
  1. `import.ts` - Main orchestrator with transaction management
  2. `master-tables.ts` - Master table merge logic (m_files, m_tags, m_scopes, etc.)
  3. `topological-sort.ts` - Dependency graph analysis and sorting
  4. `db-import.ts` - CLI command with argument parsing and validation

#### Data Migration Strategy

- **ID Remapping**: All imported data gets fresh auto-incremented IDs (no ID preservation)
- **Master Table Deduplication**: Reuse existing entries for agents, tags, scopes, files by name/path
- **Transaction Atomicity**: All-or-nothing semantics (full rollback on any error)
- **Project Isolation**: Each import creates independent project with no cross-contamination

#### CLI Examples

```bash
# Import project from JSON export
npx sqlew db:import --source=project-backup.json

# Import with custom project name
npx sqlew db:import --source=data.json --project-name=my-project

# Dry-run validation (no actual import)
npx sqlew db:import --source=data.json --dry-run

# Export project for migration
npx sqlew db:export --project=visualizer --output=visualizer-data.json
```

#### Technical Details

- **Batch Inserts** - 10-row batches to avoid SQLite UNION ALL limits
- **Foreign Key Validation** - Validates all foreign key references before insertion
- **View Handling** - Temporarily drops/restores views during schema changes
- **Idempotent Operations** - Safe to retry on failure
- **Error Recovery** - Detailed error messages with validation guidance

#### Use Cases

- **Multi-Project Single Database** - Consolidate multiple projects when database creation permissions are limited
- **Project Sharing** - Share context with team members or between machines
- **Cross-Database Migration** - Move projects between different databases (different machine, SQLite → MySQL, etc.)

**Note**: Import uses `--skip-if-exists=true` by default. This is NOT a backup/restore solution for the same database.
Use database-level backups (SQLite file copy, MySQL dump) for backup/restore scenarios.

#### Impact

- ✅ **Complete migration solution** - Export from one database, import to another
- ✅ **Multi-project support** - Merge multiple project exports into single database
- ✅ **Permission-friendly** - Works for users who can't create multiple databases
- ✅ **Data integrity** - Zero data loss, all relationships preserved
- ✅ **Production ready** - Comprehensive error handling and validation
- ✅ **Cross-database compatible** - JSON format works across SQLite, MySQL, PostgreSQL

---

### Fixed - Multi-Project Migration (HOTFIX)

**Critical fix for v3.7.0-v3.7.2 migration in multi-project scenarios**

#### Problem

- Users upgrading from v3.6.10 to v3.7.0+ could end up with duplicate projects
- Migration 20251104000000 created project #1 with fake name "default-project"
- Users creating second project manually resulted in namespace conflicts

#### Solution

- Enhanced migration idempotency checks
- Improved project consolidation logic
- Better handling of existing project scenarios

#### Impact

- ✅ **Safe multi-project migration** - No duplicate projects created
- ✅ **Backward compatible** - Works for both fresh installs and upgrades
- ✅ **Data preservation** - All existing data maintained correctly

---

## [3.7.3] - 2025-11-06

### Fixed - Master Tables Namespace Collision Bug

**Critical bug fix for incomplete multi-project support in v3.7.0-v3.7.2**

#### Problem
- Master tables (m_files, m_tags, m_scopes) lacked `project_id` columns in v3.7.0-v3.7.2
- This caused **namespace collisions** where identical file paths/tag names/scope names from different projects would conflict
- Example: "src/index.ts" from ProjectA would collide with ProjectB's "src/index.ts"
- Users upgrading from v3.6.x would have fake project name "default-project" instead of detected real name

#### Solution
- **20251106000000_fix_master_tables_project_id_v3_7_3.ts** - Comprehensive migration that:
  1. **Data Consolidation** - Detects v3.7.0-v3.7.2 upgrade scenario and consolidates project #2 data into project #1
  2. **Project Rename** - Renames fake "default-project" to real detected name (from config.toml/git remote/directory)
  3. **Schema Fix** - Adds `project_id` column to m_files, m_tags, m_scopes with composite UNIQUE constraints
  4. **Data Migration** - Maps all existing master table data to default project (ID 1)
  5. **Orphan Cleanup** - Filters out 95 orphaned foreign key references (deleted tasks/tags)
  6. **View Restoration** - Temporarily drops and restores 4 views during migration
  7. **Table Restoration** - Backs up and restores 6 referencing tables with updated foreign keys

#### Migration Details
- **Idempotent** - Can run multiple times safely (checks for existing columns)
- **Version-Aware** - Only consolidates data for v3.7.0-v3.7.2 databases (detects fake project names)
- **Batch Inserts** - Uses 10-row batches to avoid SQLite UNION ALL limits
- **FK Filtering** - Validates foreign key references before restoration to prevent constraint errors
- **SQLite-Optimized** - Handles better-sqlite3 FK constraint behavior during table drops

#### Technical Changes
- **m_files**: Added `project_id` column, changed UNIQUE constraint from `(path)` to `(project_id, path)`
- **m_tags**: Added `project_id` column, changed UNIQUE constraint from `(name)` to `(project_id, name)`
- **m_scopes**: Added `project_id` column, changed UNIQUE constraint from `(name)` to `(project_id, name)`
- **Referencing Tables**: Updated t_file_changes, t_task_file_links, t_decision_tags, t_task_tags, t_constraint_tags, t_decision_scopes
- **Views**: Restored v_layer_summary, v_task_board, v_tagged_decisions, v_tagged_constraints

#### Impact
- ✅ **Fixed namespace collisions** - Files/tags/scopes from different projects can now have identical names
- ✅ **Data integrity** - All existing data preserved and mapped correctly
- ✅ **Project consolidation** - v3.7.0-v3.7.2 users get clean migration path
- ✅ **Real project names** - No more fake "default-project" names
- ✅ **Orphan cleanup** - Removed invalid foreign key references automatically
- ✅ **Full idempotency** - Migration can be safely re-run if interrupted

#### Testing
- ✅ Tested on actual v3.7.2 production database (mcp-sqlew project)
- ✅ Successfully consolidated 77 decisions, 191 tasks, 61 file changes
- ✅ Filtered 95 orphaned task-tag references
- ✅ All views and referencing tables restored correctly
- ✅ Final database state validated with composite UNIQUE constraints working

---

## [3.7.2] - 2025-11-05

### Changed - Enhanced Sub-Agent Templates

**Improved specialized agent templates for more efficient sqlew usage**

#### Sub-Agent Template Updates
- **sqlew-scrum-master.md** - Enhanced multi-agent coordination and task management workflows
- **sqlew-researcher.md** - Improved decision querying and context analysis patterns
- **sqlew-architect.md** - Enhanced decision documentation and constraint enforcement workflows

#### New Documentation
- **docs/SPECIALIZED_AGENTS.md** - Comprehensive guide for specialized agents
  - Installation and configuration instructions
  - Usage examples for each agent
  - Token optimization guidelines
  - Agent comparison and capability matrix
  - Integration patterns
  - Troubleshooting guide

#### SQL Dump Enhancements
- Added type conversion testing (`src/tests/type-conversion.test.ts`)
- Enhanced SQL dump converters for better type handling
- Improved SQL dump utilities with expanded functionality

### Fixed - Git LFS PNG Display Issue

**Removed Git LFS tracking for PNG files to fix GitHub display**

#### Problem
- PNG files were tracked with Git LFS, causing display issues on GitHub
- Users without Git LFS saw ASCII pointers instead of images
- README images were not rendering properly

#### Solution
- Removed `*.png filter=lfs diff=lfs merge=lfs -text` from .gitattributes
- Restored actual PNG binary files from pre-LFS commits
- All PNG images now display correctly on GitHub without requiring Git LFS

#### Impact
- ✅ **Better agent templates** - More efficient sqlew usage patterns
- ✅ **Comprehensive documentation** - Clear installation and usage guides
- ✅ **Improved type handling** - Better SQL dump type conversion
- ✅ **Fixed GitHub display** - PNG images now render properly without Git LFS
- ✅ **Token efficient** - Optimized agent workflows reduce unnecessary tool calls

---

## [3.7.1] - 2025-11-05

### Fixed - Error Message Visibility

**Fixed validation error messages being hidden by error wrapper**

#### Problem
- Validation errors (JSON-structured responses) were being wrapped with stack traces
- Wrong-usage messages were hidden from MCP clients
- Users received generic error messages instead of helpful validation details

#### Solution
- **Error Handler Enhancement** - Detect and unwrap JSON validation errors
  - Validation errors now returned directly to MCP client without wrapping
  - Stack traces written to logs only (not returned to client)
  - Token-efficient responses without exposing internal stack details
- **Parameter Validator Enhancement** - Detect unexpected/invalid parameters
  - Added validation for parameters that don't match valid list and have no typo suggestion
  - Improved error messages: "Unexpected params: X. Valid params: Y, Z"

#### Impact
- ✅ **Better UX** - Validation errors are now visible and actionable
- ✅ **Token efficiency** - No stack traces in MCP responses
- ✅ **Clearer feedback** - Users see helpful error messages immediately
- ✅ **Security** - Internal stack details not exposed to clients

---

## [3.7.0] - 2025-11-05

### Added - Runtime Database Reconnection

**Automatic connection recovery with exponential backoff retry logic**

#### Features
- **ConnectionManager** - Singleton wrapper for all database operations
- **Exponential Backoff** - Retry delays: 1s → 2s → 4s → 8s → 16s (31 seconds total)
- **Smart Error Detection** - Recognizes connection errors across SQLite, MySQL, PostgreSQL
- **Process.exit on Exhaustion** - Exits cleanly after 5 failed retries
- **27 Operations Wrapped** - All transactional operations protected:
  - context.ts: 5 operations
  - tasks.ts: 9 operations
  - files.ts: 3 operations
  - constraints.ts: 3 operations
  - config.ts: 2 operations
  - utils.ts: 5 operations

#### Connection Error Patterns Detected
- **Network Errors**: ECONNREFUSED, ENOTFOUND, ETIMEDOUT, ECONNRESET, EPIPE
- **SQLite**: "database is locked", "unable to open database"
- **MySQL/MariaDB**: "server has gone away", "lost connection to mysql server"
- **PostgreSQL**: "connection to server was lost", "could not connect to server"
- **Knex-specific**: "timeout acquiring a connection", "pool is destroyed"

#### Test Coverage
- **41 tests passing** (22 unit + 19 integration)
- Retry behavior verification
- Production scenario simulation (server restart, network failures)
- Tool integration testing

#### Impact
- ✅ **Resilient operations** - Automatic recovery from transient connection failures
- ✅ **Production ready** - Handles server restarts, network issues
- ✅ **Zero regressions** - All existing tests pass
- ✅ **Token efficient** - No manual retry logic needed in agent code

---

### Changed - Validation Error Messages

**70-85% token reduction in error message size**

#### Token Efficiency
- **Before**: ~1000+ characters (~300+ tokens) with full examples embedded
- **After**: ~200 characters (~50 tokens) with reference IDs
- **Reduction**: 70-85% token savings

#### New Error Format
```json
{
  "error": "Missing: key, value",
  "action": "set",
  "reference": "decision.set",
  "missing": ["key", "value"],
  "hint": "Use 'quick_set' for simpler usage..."
}
```

#### Features
- **Reference IDs** - Compact `{tool}.{action}` format (e.g., "decision.set")
- **Concise Messages** - Essential information only
- **Conditional Fields** - Only include fields when present
- **Self-Documenting** - AI can query `action: "help"` for full docs if needed

#### Error Types
- Missing params: `"Missing: key, value"`
- Typos: `"Invalid params: val → value"`
- Unknown action: `"Unknown action 'sett'. Did you mean: set?"`

#### Impact
- ✅ **Token efficiency** - 70-85% reduction in error size
- ✅ **Cost reduction** - Lower API costs for AI agents
- ✅ **Better UX** - Quick, scannable errors
- ✅ **Backward compatible** - Error structure unchanged

---

### Changed - Debug Log Format

**Single-line log entries for easier parsing**

#### Problem
Multi-line log messages broke standard text processing tools (grep, awk, log rotation).

#### Solution
- **Sanitization Function** - Replaces newlines with spaces, collapses whitespace
- **Applied To**: All log messages, data values, JSON output
- **Result**: Every log entry is exactly one line

#### Benefits
- ✅ **Easier parsing** - Line-based tools work correctly
- ✅ **Better grep** - Search across entire messages
- ✅ **Simpler analysis** - Standard text processing
- ✅ **Cleaner output** - No unexpected line breaks

#### Example
**Before:**
```
[2025-11-05T02:00:00.000Z] [ERROR] Error details:
Stack trace line 1
Stack trace line 2
```

**After:**
```
[2025-11-05T02:00:00.000Z] [ERROR] Error details: Stack trace line 1 Stack trace line 2
```

---

### Changed - Specialized Agent Templates (Error Prevention)

**Restructured agent templates to reduce tool call errors from 60% to <10%**

#### Problem
- 60% of agent errors: missing `action` parameter in tool calls
- Templates embedded outdated action samples that became obsolete
- Agents guessed syntax instead of using discovery workflow

#### Solution
All three agent templates restructured with error-prevention focus:
- **sqlew-architect.md** - Decision documentation specialist
- **sqlew-researcher.md** - Context analysis specialist
- **sqlew-scrum-master.md** - Sprint coordination specialist

#### Key Improvements
- ⚠️ **Prominent Error-Prevention Section** - "CRITICAL: Error-Free sqlew Tool Usage" at top
- 📚 **Discovery-First Workflow** - Guides agents: `action: "help"` → `action: "example"` → copy/modify
- ❌✅ **Zero-Error Pattern** - Clear WRONG/CORRECT examples for every common mistake:
  - Missing `action` parameter
  - Wrong data types (priority: string vs number)
  - Wrong parameter names (old v2.x API)
- 🔍 **Pre-Execution Checklist** - Verify `action` parameter before every tool call
- 🗑️ **No Embedded Samples** - Removed action lists to prevent outdated syntax
- 🛠️ **Common Data Type Errors** - Shows tag arrays, boolean atomics, integer priorities

#### Upgrade Path
**Note**: Existing `.claude/agents/` files NOT auto-upgraded (preserves customizations)

**Manual upgrade required**:
```bash
# Remove old templates
rm .claude/agents/sqlew-{architect,researcher,scrum-master}.md

# Restart MCP server (auto-copies new templates from assets/sample-agents/)
```

See [docs/SPECIALIZED_AGENTS.md#upgrading-to-error-prevention-templates-v370](docs/SPECIALIZED_AGENTS.md#upgrading-to-error-prevention-templates-v370) for detailed instructions.

#### Impact
- ✅ **Target: 60% → <10% error rate** for agent tool calls
- ✅ **Better UX** - Clear guidance prevents common mistakes
- ✅ **Self-Correcting** - Agents learn correct patterns from errors
- ✅ **Future-Proof** - Discovery workflow adapts to API changes

---

### Fixed - Multi-Project Migration (Critical)

**Fixed migration for ALL users upgrading from v3.6.10 to v3.7.0**

#### Problem
- SQLite's `ALTER TABLE` silently failed for 4 tables with complex foreign keys
- Migration reported success but columns weren't added
- Task creation would fail: `"table t_task_details has no column named project_id"`

#### Root Cause
SQLite cannot modify tables with `ON DELETE CASCADE` constraints using ALTER TABLE.

#### Solution
- **Table Recreation Strategy** - Backup → Drop → Recreate → Restore
- **4 Tables Fixed**:
  - `t_task_details` (STEP 4.7)
  - `t_task_file_links` (STEP 4.8)
  - `t_task_decision_links` (STEP 4.9)
  - `t_task_tags` (composite PRIMARY KEY)

#### Idempotency
All recreation steps check if `project_id` exists before executing:
```typescript
const hasProjectId = await knex.schema.hasColumn('table_name', 'project_id');
if (!hasProjectId) {
  // Recreation logic
}
```

#### Data Preservation Verified
- ✅ 223 task detail rows preserved
- ✅ 632 task tag rows preserved
- ✅ All task links preserved
- ✅ 100% data integrity maintained

#### Testing
- ✅ Fresh installation works
- ✅ v3.6.10 → v3.7.0 upgrade works
- ✅ Migration can be re-run safely (idempotent)
- ✅ TypeScript compiles without errors

#### Impact
- ✅ **Production ready** - Safe for all v3.6.10 users to upgrade
- ✅ **No data loss** - All existing data preserved
- ✅ **Idempotent** - Can re-run without errors

---

## [3.6.10] - 2025-10-30

### Added - Environment Variable Support for Project Root

**New `SQLEW_PROJECT_ROOT` environment variable for project-relative databases**

#### Problem
- Junie AI and other MCP clients require absolute paths in configuration
- Users had to hardcode project-specific paths in MCP server config
- No easy way to use project-relative database paths

#### Solution
- Added `SQLEW_PROJECT_ROOT` environment variable support (inspired by serena-mcp pattern)
- MCP clients can now pass project directory via environment variable
- Database automatically created at `$SQLEW_PROJECT_ROOT/.sqlew/sqlew.db`

#### Priority Order
1. `SQLEW_PROJECT_ROOT` environment variable (NEW - highest priority)
2. `--db-path` CLI argument (absolute path)
3. `--config-path` CLI argument (absolute path)
4. `database.path` in config file (absolute path)
5. `process.cwd()` fallback

#### Junie AI Configuration Example
```json
{
  "mcpServers": {
    "sqlew": {
      "command": "npx",
      "args": ["sqlew"],
      "env": {
        "SQLEW_PROJECT_ROOT": "{projectDir}"
      }
    }
  }
}
```

**Note:** Junie AI uses `{projectDir}` variable which expands to the current project's absolute path. This ensures each project gets its own isolated database without hardcoded paths. Other MCP clients may use different variable names like `${workspaceFolder}` (VS Code/Cline) - check your client's documentation.

#### Impact
- ✅ **Project-relative databases** without hardcoded absolute paths
- ✅ **Cleaner MCP configuration** (no per-project path updates needed)
- ✅ **Compatible with Junie AI, Claude Desktop, and other MCP clients**
- ✅ **No breaking changes** (environment variable is optional)

---

### Fixed - MCP Protocol Compliance (EPIPE Fix)

**Eliminated console output for strict JSON-RPC protocol compliance**

#### Problem
- EPIPE (broken pipe) errors when running with Junie AI on Windows
- Console output to stdout/stderr violated MCP JSON-RPC protocol requirements
- Strict MCP clients (like Junie AI) expect pure JSON-RPC on stdio streams

#### Changes
- **Redirected all diagnostic output to debug log file** - stdout/stderr reserved exclusively for JSON-RPC
- Modified `safeConsoleError()` to write to debug log instead of stderr
- Replaced 50+ console.log/console.error calls across codebase:
  - `src/database.ts` - Database initialization messages
  - `src/watcher/file-watcher.ts` - File watcher status and events
  - `src/watcher/gitignore-parser.ts` - .gitignore loading warnings
  - `src/tools/tasks.ts` - Task file registration warnings
  - `src/config/example-generator.ts` - First launch messages

#### Technical Details
- **MCP Protocol Requirement**: stdin/stdout/stderr must carry only JSON-RPC messages
- **Debug Logging**: All diagnostic messages now use `debugLog()` with appropriate levels (INFO, WARN, ERROR)
- **Zero stdout pollution**: Server starts silently, waits for JSON-RPC requests
- **Tested with Junie AI**: Confirmed no EPIPE errors on Windows

#### Impact
- ✅ **Works with strict MCP clients** (Junie AI, etc.)
- ✅ **Maintains full diagnostics** via debug log file
- ✅ **Pure JSON-RPC protocol** compliance
- ✅ **No breaking changes** to MCP tool functionality

---

### Added - Environment Variable Support for Project Root

**New `SQLEW_PROJECT_ROOT` environment variable for project-relative databases**

#### Problem
- Junie AI and other MCP clients require absolute paths in configuration
- Users had to hardcode project-specific paths in MCP server config
- No easy way to use project-relative database paths

#### Solution
- Added `SQLEW_PROJECT_ROOT` environment variable support (inspired by serena-mcp pattern)
- MCP clients can now pass project directory via environment variable
- Database automatically created at `$SQLEW_PROJECT_ROOT/.sqlew/sqlew.db`

#### Priority Order
1. `SQLEW_PROJECT_ROOT` environment variable (NEW - highest priority)
2. `--db-path` CLI argument (absolute path)
3. `--config-path` CLI argument (absolute path)
4. `database.path` in config file (absolute path)
5. `process.cwd()` fallback

#### Junie AI Configuration Example
```json
{
  "mcpServers": {
    "sqlew": {
      "command": "npx",
      "args": ["sqlew"],
      "env": {
        "SQLEW_PROJECT_ROOT": "{projectDir}"
      }
    }
  }
}
```

**Note:** Junie AI uses `{projectDir}` variable which expands to the current project's absolute path. This ensures each project gets its own isolated database without hardcoded paths. Other MCP clients may use different variable names like `${workspaceFolder}` (VS Code/Cline) - check your client's documentation.

#### Impact
- ✅ **Project-relative databases** without hardcoded absolute paths
- ✅ **Cleaner MCP configuration** (no per-project path updates needed)
- ✅ **Compatible with Junie AI, Claude Desktop, and other MCP clients**
- ✅ **No breaking changes** (environment variable is optional)

---

### Fixed - MCP Protocol Compliance (EPIPE Fix)

**Eliminated console output for strict JSON-RPC protocol compliance**

#### Problem
- EPIPE (broken pipe) errors when running with Junie AI on Windows
- Console output to stdout/stderr violated MCP JSON-RPC protocol requirements
- Strict MCP clients (like Junie AI) expect pure JSON-RPC on stdio streams

#### Changes
- **Redirected all diagnostic output to debug log file** - stdout/stderr reserved exclusively for JSON-RPC
- Modified `safeConsoleError()` to write to debug log instead of stderr
- Replaced 50+ console.log/console.error calls across codebase:
  - `src/database.ts` - Database initialization messages
  - `src/watcher/file-watcher.ts` - File watcher status and events
  - `src/watcher/gitignore-parser.ts` - .gitignore loading warnings
  - `src/tools/tasks.ts` - Task file registration warnings
  - `src/config/example-generator.ts` - First launch messages

#### Technical Details
- **MCP Protocol Requirement**: stdin/stdout/stderr must carry only JSON-RPC messages
- **Debug Logging**: All diagnostic messages now use `debugLog()` with appropriate levels (INFO, WARN, ERROR)
- **Zero stdout pollution**: Server starts silently, waits for JSON-RPC requests
- **Tested with Junie AI**: Confirmed no EPIPE errors on Windows

#### Impact
- ✅ **Works with strict MCP clients** (Junie AI, etc.)
- ✅ **Maintains full diagnostics** via debug log file
- ✅ **Pure JSON-RPC protocol** compliance
- ✅ **No breaking changes** to MCP tool functionality

---

### Added - Environment Variable Support for Project Root

**New `SQLEW_PROJECT_ROOT` environment variable for project-relative databases**

#### Problem
- Junie AI and other MCP clients require absolute paths in configuration
- Users had to hardcode project-specific paths in MCP server config
- No easy way to use project-relative database paths

#### Solution
- Added `SQLEW_PROJECT_ROOT` environment variable support (inspired by serena-mcp pattern)
- MCP clients can now pass project directory via environment variable
- Database automatically created at `$SQLEW_PROJECT_ROOT/.sqlew/sqlew.db`

#### Priority Order
1. `SQLEW_PROJECT_ROOT` environment variable (NEW - highest priority)
2. `--db-path` CLI argument (absolute path)
3. `--config-path` CLI argument (absolute path)
4. `database.path` in config file (absolute path)
5. `process.cwd()` fallback

#### Junie AI Configuration Example
```json
{
  "mcpServers": {
    "sqlew": {
      "command": "npx",
      "args": ["sqlew"],
      "env": {
        "SQLEW_PROJECT_ROOT": "{projectDir}"
      }
    }
  }
}
```

**Note:** Junie AI uses `{projectDir}` variable which expands to the current project's absolute path. This ensures each project gets its own isolated database without hardcoded paths. Other MCP clients may use different variable names like `${workspaceFolder}` (VS Code/Cline) - check your client's documentation.

#### Impact
- ✅ **Project-relative databases** without hardcoded absolute paths
- ✅ **Cleaner MCP configuration** (no per-project path updates needed)
- ✅ **Compatible with Junie AI, Claude Desktop, and other MCP clients**
- ✅ **No breaking changes** (environment variable is optional)

---

### Fixed - MCP Protocol Compliance (EPIPE Fix)

**Eliminated console output for strict JSON-RPC protocol compliance**

#### Problem
- EPIPE (broken pipe) errors when running with Junie AI on Windows
- Console output to stdout/stderr violated MCP JSON-RPC protocol requirements
- Strict MCP clients (like Junie AI) expect pure JSON-RPC on stdio streams

#### Changes
- **Redirected all diagnostic output to debug log file** - stdout/stderr reserved exclusively for JSON-RPC
- Modified `safeConsoleError()` to write to debug log instead of stderr
- Replaced 50+ console.log/console.error calls across codebase:
  - `src/database.ts` - Database initialization messages
  - `src/watcher/file-watcher.ts` - File watcher status and events
  - `src/watcher/gitignore-parser.ts` - .gitignore loading warnings
  - `src/tools/tasks.ts` - Task file registration warnings
  - `src/config/example-generator.ts` - First launch messages

#### Technical Details
- **MCP Protocol Requirement**: stdin/stdout/stderr must carry only JSON-RPC messages
- **Debug Logging**: All diagnostic messages now use `debugLog()` with appropriate levels (INFO, WARN, ERROR)
- **Zero stdout pollution**: Server starts silently, waits for JSON-RPC requests
- **Tested with Junie AI**: Confirmed no EPIPE errors on Windows

#### Impact
- ✅ **Works with strict MCP clients** (Junie AI, etc.)
- ✅ **Maintains full diagnostics** via debug log file
- ✅ **Pure JSON-RPC protocol** compliance
- ✅ **No breaking changes** to MCP tool functionality

---

### Added - Environment Variable Support for Project Root

**New `SQLEW_PROJECT_ROOT` environment variable for project-relative databases**

#### Problem
- Junie AI and other MCP clients require absolute paths in configuration
- Users had to hardcode project-specific paths in MCP server config
- No easy way to use project-relative database paths

#### Solution
- Added `SQLEW_PROJECT_ROOT` environment variable support (inspired by serena-mcp pattern)
- MCP clients can now pass project directory via environment variable
- Database automatically created at `$SQLEW_PROJECT_ROOT/.sqlew/sqlew.db`

#### Priority Order
1. `SQLEW_PROJECT_ROOT` environment variable (NEW - highest priority)
2. `--db-path` CLI argument (absolute path)
3. `--config-path` CLI argument (absolute path)
4. `database.path` in config file (absolute path)
5. `process.cwd()` fallback

#### Junie AI Configuration Example
```json
{
  "mcpServers": {
    "sqlew": {
      "command": "npx",
      "args": ["sqlew"],
      "env": {
        "SQLEW_PROJECT_ROOT": "{projectDir}"
      }
    }
  }
}
```

**Note:** Junie AI uses `{projectDir}` variable which expands to the current project's absolute path. This ensures each project gets its own isolated database without hardcoded paths. Other MCP clients may use different variable names like `${workspaceFolder}` (VS Code/Cline) - check your client's documentation.

#### Impact
- ✅ **Project-relative databases** without hardcoded absolute paths
- ✅ **Cleaner MCP configuration** (no per-project path updates needed)
- ✅ **Compatible with Junie AI, Claude Desktop, and other MCP clients**
- ✅ **No breaking changes** (environment variable is optional)

---

### Fixed - MCP Protocol Compliance (EPIPE Fix)

**Eliminated console output for strict JSON-RPC protocol compliance**

#### Problem
- EPIPE (broken pipe) errors when running with Junie AI on Windows
- Console output to stdout/stderr violated MCP JSON-RPC protocol requirements
- Strict MCP clients (like Junie AI) expect pure JSON-RPC on stdio streams

#### Changes
- **Redirected all diagnostic output to debug log file** - stdout/stderr reserved exclusively for JSON-RPC
- Modified `safeConsoleError()` to write to debug log instead of stderr
- Replaced 50+ console.log/console.error calls across codebase:
  - `src/database.ts` - Database initialization messages
  - `src/watcher/file-watcher.ts` - File watcher status and events
  - `src/watcher/gitignore-parser.ts` - .gitignore loading warnings
  - `src/tools/tasks.ts` - Task file registration warnings
  - `src/config/example-generator.ts` - First launch messages

#### Technical Details
- **MCP Protocol Requirement**: stdin/stdout/stderr must carry only JSON-RPC messages
- **Debug Logging**: All diagnostic messages now use `debugLog()` with appropriate levels (INFO, WARN, ERROR)
- **Zero stdout pollution**: Server starts silently, waits for JSON-RPC requests
- **Tested with Junie AI**: Confirmed no EPIPE errors on Windows

#### Impact
- ✅ **Works with strict MCP clients** (Junie AI, etc.)
- ✅ **Maintains full diagnostics** via debug log file
- ✅ **Pure JSON-RPC protocol** compliance
- ✅ **No breaking changes** to MCP tool functionality

---

### Added - Environment Variable Support for Project Root

**New `SQLEW_PROJECT_ROOT` environment variable for project-relative databases**

#### Problem
- Junie AI and other MCP clients require absolute paths in configuration
- Users had to hardcode project-specific paths in MCP server config
- No easy way to use project-relative database paths

#### Solution
- Added `SQLEW_PROJECT_ROOT` environment variable support (inspired by serena-mcp pattern)
- MCP clients can now pass project directory via environment variable
- Database automatically created at `$SQLEW_PROJECT_ROOT/.sqlew/sqlew.db`

#### Priority Order
1. `SQLEW_PROJECT_ROOT` environment variable (NEW - highest priority)
2. `--db-path` CLI argument (absolute path)
3. `--config-path` CLI argument (absolute path)
4. `database.path` in config file (absolute path)
5. `process.cwd()` fallback

#### Junie AI Configuration Example
```json
{
  "mcpServers": {
    "sqlew": {
      "command": "npx",
      "args": ["sqlew"],
      "env": {
        "SQLEW_PROJECT_ROOT": "{projectDir}"
      }
    }
  }
}
```

**Note:** Junie AI uses `{projectDir}` variable which expands to the current project's absolute path. This ensures each project gets its own isolated database without hardcoded paths. Other MCP clients may use different variable names like `${workspaceFolder}` (VS Code/Cline) - check your client's documentation.

#### Impact
- ✅ **Project-relative databases** without hardcoded absolute paths
- ✅ **Cleaner MCP configuration** (no per-project path updates needed)
- ✅ **Compatible with Junie AI, Claude Desktop, and other MCP clients**
- ✅ **No breaking changes** (environment variable is optional)

---

### Fixed - MCP Protocol Compliance (EPIPE Fix)

**Eliminated console output for strict JSON-RPC protocol compliance**

#### Problem
- EPIPE (broken pipe) errors when running with Junie AI on Windows
- Console output to stdout/stderr violated MCP JSON-RPC protocol requirements
- Strict MCP clients (like Junie AI) expect pure JSON-RPC on stdio streams

#### Changes
- **Redirected all diagnostic output to debug log file** - stdout/stderr reserved exclusively for JSON-RPC
- Modified `safeConsoleError()` to write to debug log instead of stderr
- Replaced 50+ console.log/console.error calls across codebase:
  - `src/database.ts` - Database initialization messages
  - `src/watcher/file-watcher.ts` - File watcher status and events
  - `src/watcher/gitignore-parser.ts` - .gitignore loading warnings
  - `src/tools/tasks.ts` - Task file registration warnings
  - `src/config/example-generator.ts` - First launch messages

#### Technical Details
- **MCP Protocol Requirement**: stdin/stdout/stderr must carry only JSON-RPC messages
- **Debug Logging**: All diagnostic messages now use `debugLog()` with appropriate levels (INFO, WARN, ERROR)
- **Zero stdout pollution**: Server starts silently, waits for JSON-RPC requests
- **Tested with Junie AI**: Confirmed no EPIPE errors on Windows

#### Impact
- ✅ **Works with strict MCP clients** (Junie AI, etc.)
- ✅ **Maintains full diagnostics** via debug log file
- ✅ **Pure JSON-RPC protocol** compliance
- ✅ **No breaking changes** to MCP tool functionality

---

### Fixed - Windows Absolute Path Handling

**Fixed path normalization for Windows environments**

#### Changes
- Fixed absolute path to relative path conversion in `gitignore-parser.ts`
- Prevented `uname` Unix command calls on Windows
- Resolved "path should be a `path.relative()`d string" error on Windows
- Improved cross-platform path handling in file watcher

#### Technical Details
- Enhanced path normalization logic to handle Windows drive letters (`C:/`)
- Added proper Windows-specific path handling checks
- Fixed compatibility with `ignore` library path requirements

---

## [3.6.8] - 2025-10-30

### Fixed - Windows Environment Compatibility

**Updated better-sqlite3 for Windows support**

#### Changes
- Updated `better-sqlite3` from `^11.0.0` to `^12.4.1`
- Fixes Windows environment compatibility issues
- Improves cross-platform stability

---

## [3.6.7] - 2025-10-30

### Fixed - Dependency Update

**Removed deprecated dependency**

#### Changes
- Removed deprecated dependency to ensure compatibility with latest ecosystem
- Maintenance update for long-term stability

---

## [3.6.6] - 2025-10-29

### Added - Parameter Validation & Error Handling

**Comprehensive parameter validation with helpful error messages**

#### Parameter Validation
- **Required/Optional Detection** - Clear indication of required vs optional parameters
- **Typo Suggestions** - Levenshtein distance-based "did you mean" suggestions for mistyped parameters
- **Structured Error Messages** - JSON format with examples showing correct usage
- **Visual Markers** - Help responses show 🔴 REQUIRED and ⚪ OPTIONAL parameter markers
- **Action Specs Registry** - Centralized action specification in `src/utils/action-specs.ts`
- **Comprehensive Test Suite** - 49 validation tests across all 5 tools

### Removed - Config Tool Deprecated

**Config MCP tool removed in favor of file-based configuration**

#### Why Removed
- Messaging system deprecated (primary use case eliminated)
- File-based configuration (`.sqlew/config.toml`) is clearer and more maintainable
- Runtime updates caused configuration drift between `m_config` table and config file
- Confusing UX (changes lost on restart unless manually synced)

#### Migration Path
- ✅ Use `.sqlew/config.toml` for all configuration (persistent, version-controlled)
- ✅ Use CLI arguments for one-time overrides
- ❌ Do not use `config` tool (will error)

#### Impact
- ✅ 5 MCP tools (down from 6): `decision`, `task`, `file`, `constraint`, `stats`
- ✅ Clearer configuration workflow (single source of truth)
- ✅ Better developer experience (validation errors with examples)
- ✅ Reduced cognitive load (no config drift issues)

---

## [3.6.5] - 2025-10-28

### Changed - Agent System Simplification & CI/CD Fix

**Removed messaging system and eliminated agent pooling complexity**

#### Agent System Cleanup
- **Removed messaging system** - `t_agent_messages` table dropped, `message` MCP tool deprecated
  - Messaging system was unused and added unnecessary complexity
  - Simplified agent architecture to single-purpose registry
- **Eliminated agent pooling** - Code no longer uses `in_use` and `is_reusable` columns
  - Removed race conditions and UNIQUE constraint errors
  - Each agent name creates one permanent record (no reuse/pooling)
  - Generic agents (`generic-N`) auto-allocated for empty names
- **6 MCP Tools** - Down from 7 (messaging removed)
  - `decision`, `file`, `constraint`, `stats`, `config`, `task`

#### Infrastructure
- **CI/CD Workflow** - Removed npm publish step from GitHub Actions
  - npm publish requires 2FA authentication
  - Publishing must be done manually to prevent workflow failures

#### Impact
- ✅ Simplified agent management (no pooling overhead)
- ✅ Reduced complexity (messaging system removed)
- ✅ CI/CD workflow no longer fails on npm publish

---

## [3.6.4] - 2025-10-28

### Fixed - WSL Git Add Detection

**WSL-specific polling workaround for chokidar file watcher**

#### Changes
- **1-second polling for WSL** - Added platform-specific chokidar configuration
  - WSL filesystem events are unreliable with native watching
  - Polling ensures git add operations are detected consistently
- **Platform detection** - Automatic WSL detection via `/proc/version`
- **Backward compatible** - Non-WSL platforms use native file watching (no polling)

#### Impact
- ✅ Git add detection now works reliably on WSL
- ✅ VCS-aware auto-complete functional across all platforms

---

## [3.6.3] - 2025-10-27

### Fixed - Critical Bug Fixes & Git Add Detection

**Transaction pool exhaustion and VCS-aware auto-complete implementation**

#### Bug Fixes
- **Task Move Transaction Bug** - Fixed `moveTask` using base `knex` instead of transaction `trx` (line 880)
  - Caused "Knex: Timeout acquiring a connection" errors
  - Now properly uses transaction object for `logTaskStatusChange`
- **Task Link Transaction Bug** - Fixed `linkTask` using base `knex` instead of transaction `trx` (line 948)
  - Same connection pool exhaustion issue
  - Now properly uses transaction object for decision link insertion

#### Features
- **Git Add Detection** - Implemented `detectAndCompleteOnStaging()` for VCS-aware workflow
  - Detects `git add` operations and auto-completes tasks (`waiting_review` → `done`)
  - Supports Git, Mercurial, and SVN
  - Configurable via `git_auto_complete_on_stage` and `require_all_files_staged`
- **VCS Configuration** - Added comprehensive settings documentation to `config.example.toml`
  - `git_auto_complete_on_stage` (default: true)
  - `git_auto_archive_on_commit` (default: true)
  - `require_all_files_staged` (default: true)
  - `require_all_files_committed_for_archive` (default: true)

#### Infrastructure
- **Line Ending Fix** - Added `.gitattributes` to enforce LF endings for shell scripts
  - Prevents CRLF issues in Husky hooks on Windows/WSL
  - Applies to `*.sh` and `.husky/*` files
- **Husky Hooks** - Fixed pre-commit/pre-push hooks (added shebang, normalized line endings)

#### Impact
- ✅ Task operations no longer fail with connection pool timeouts
- ✅ Git add detection now functional (was stubbed in v3.5.2)
- ✅ Cross-platform compatibility for git hooks (Windows/WSL/Linux/macOS)

---

## [3.6.2] - 2025-10-27

### Changed - Migration System Modernization

**Simplified to Knex-only migrations with organized directory structure**

#### Migration System Cleanup
- **Removed custom migration system** (14 obsolete files from `src/migrations/`)
- **Pure Knex migrations** - Standardized on Knex.js migration framework
- **Organized structure** - 22 migrations grouped into 3 logical subdirectories:
  - `upgrades/` (7 files) - Version upgrade paths (v1.0 → v3.6)
  - `bootstrap/` (5 files) - Fresh install foundation
  - `enhancements/` (10 files) - v3.6.0+ feature additions

#### Testing & CI/CD
- **Migration tests updated** - Converted to use Knex migrations exclusively
- **Comprehensive test coverage** - 8/9 versions migrate successfully (89% backward compatibility)
- **Husky git hooks** - Pre-commit (build + tests), pre-push (migration tests)
- **GitHub Actions workflow** - CI/CD pipeline for Node 18.x/20.x

#### Benefits
- **Better maintainability** - Clear organization, standard tooling
- **Easier onboarding** - Knex is industry-standard
- **Faster development** - 56% time efficiency via parallel execution

---

## [3.6.0] - 2025-10-25

### Added - Help System Optimization

**Database-driven help system with 60-70% token efficiency improvement**

#### Key Achievements
- **60-70% Token Reduction** - Average help query: ~200 tokens (vs ~2,150 legacy)
- **95.8% Schema Reduction** - MCP InputSchemas: 350 tokens (vs 8,400 legacy)
- **6 New Help Actions** - Granular queries for actions, parameters, tools, use-cases
- **41 Use-Cases** - Comprehensive workflow examples across 6 categories
- **100% Test Coverage** - 38/38 tests passing

#### New MCP Actions (stats tool)
- `help_action` - Query single action with parameters and examples
- `help_params` - Query parameter list for an action
- `help_tool` - Query tool overview + all actions
- `help_use_case` - Get single use-case with full workflow
- `help_list_use_cases` - List/filter use-cases by category/complexity
- `help_next_actions` - Suggest common next actions

#### Database Schema
7 new tables: `m_help_tools`, `m_help_actions`, `m_help_use_case_categories`, `t_help_action_params`, `t_help_action_examples`, `t_help_use_cases`, `t_help_action_sequences`

#### Migration from v3.5.x
- Automatic migration on startup
- Backward compatible - all existing MCP actions unchanged
- Zero downtime

---

## [3.5.2] - 2025-10-24

### Added - Two-Step Git-Aware Task Workflow

**Automatic task completion and archiving based on Git staging and committing**

#### Features
- **Step 1 - Staging** (`git add`): `waiting_review` → `done` (work complete)
- **Step 2 - Committing** (`git commit`): `done` → `archived` (work finalized)
- **VCS Support**: Git, Mercurial, and SVN
- **Zero Token Cost**: Fully automated, no manual MCP calls needed

#### Configuration
- `git_auto_complete_on_stage` (default: `'1'`)
- `git_auto_archive_on_commit` (default: `'1'`)
- `require_all_files_staged` (default: `'1'`)
- `require_all_files_committed_for_archive` (default: `'1'`)

---

## [3.5.1] - 2025-10-24

### Fixed - File Watcher WSL Compatibility

**Upgraded chokidar from v3 to v4 + Fixed path normalization bug**

#### Changes
- **chokidar**: `^3.6.0` → `^4.0.3` (automatic WSL support)
- Fixed path normalization: chokidar reports absolute paths, database stores relative
- Removed manual WSL detection and polling configuration

---

## [3.5.0] - 2025-10-22

### Added - Non-Existent File Auto-Pruning

**Automatic removal of non-existent watched files with audit trail**

#### Features
- New table: `t_task_pruned_files` - Audit trail for pruned files
- Auto-pruning during `in_progress → waiting_review` transition
- Safety check: blocks if ALL files non-existent
- New MCP actions: `get_pruned_files`, `link_pruned_file`

#### Documentation
- `TASK_PRUNING.md` - Comprehensive guide with examples and best practices

---

## [3.4.1] - 2025-10-22

### Fixed - File Watcher Immediate Detection

**Fixed chokidar configuration for instant file change detection**

#### Changes
- Removed 5-second aggregation delay
- Added `awaitWriteFinish` for write completion detection
- Immediate auto-transition on file save

---

## [3.4.0] - 2025-10-22

### Added - VCS-Aware File Watching

**Automatic task transitions based on Git commit detection**

#### Features
- Auto-transition: `waiting_review` → `done` when watched files committed
- Multi-VCS support: Git, Mercurial, SVN
- VCS adapter pattern with pluggable implementations
- Whitelist exemption: Skip auto-transition for critical files (package.json, migrations)
- Configuration: `git_auto_complete_tasks`, `git_require_all_files_committed`, `git_file_whitelist`

#### Database Schema
- New table: `m_git_file_whitelist` - Exempt files from auto-completion

---

## [3.2.6] - 2025-10-21

### Fixed - File Watcher Test Stability

**Improved debouncing and async handling in file watcher tests**

---

## [3.2.5] - 2025-10-21

### Fixed - File Watcher Error Handling

**Enhanced error handling and logging for file watcher operations**

---

## [3.2.4] - 2025-10-20

### Fixed - File Watcher Path Resolution

**Fixed absolute path resolution for file watching**

---

## [3.2.3] - 2025-10-20 [DEPRECATED]

### Changed - File Watcher Implementation (Deprecated)

This version was replaced by v3.2.4. Use v3.2.4 or later.

---

## [3.2.2] - 2025-10-18

### Added - Decision Context

**Rich decision documentation with rationale, alternatives, tradeoffs**

#### Features
- New table: `t_decision_context` - Attach context to decisions
- New actions: `add_decision_context`, `list_decision_contexts`
- Enhanced `get` action with `include_context` parameter

#### Documentation
- `DECISION_CONTEXT.md` - Comprehensive guide for decision documentation

---

## [3.2.0] - 2025-10-18

### Added - Task Dependencies

**Task dependency management with blocking relationships**

#### Features
- New table: `t_task_dependencies` - Track blocking relationships
- Circular dependency detection
- New actions: `add_dependency`, `remove_dependency`, `get_dependencies`

---

## [3.1.2] - 2025-10-18

### Fixed - Task Linking Validation

**Fixed validation for task-decision-constraint-file links**

---

## [3.1.1] - 2025-10-18

### Fixed - File Watcher Initialization

**Fixed file watcher startup sequence and error handling**

---

## [3.0.2] - 2025-10-17

### Fixed - Task State Machine

**Enhanced task status transition validation**

#### Changes
- Fixed state machine transitions for task lifecycle
- Improved validation for blocked/unblocked transitions

---

## [3.0.1] - 2025-10-17

### Fixed - Task Timestamps

**Fixed task timestamp updates on status changes**

---

## [3.0.0] - 2025-10-17

### Added - Kanban Task Watcher

**AI-optimized task management with auto-stale detection**

#### Features
- Task management with metadata: status, priority, assignee, tags, layer
- Auto-stale detection: `in_progress` >2h → `waiting_review`, `waiting_review` >24h → `todo`
- File watching with `chokidar`: auto-transition `todo` → `in_progress` on file edit
- Link tasks to decisions, constraints, files
- 70% token reduction vs decision tool (~100 bytes/task vs ~332 bytes/decision)
- Flat hierarchy (no subtasks) for AI simplicity

#### Database Schema
- New tables: `t_tasks`, `t_task_details`, `t_task_tags`, `t_task_decision_links`, `t_task_constraint_links`, `t_task_file_links`
- New triggers: `trg_log_task_create`, `trg_log_task_status_change`, `trg_update_task_timestamp`

#### MCP Actions (task tool)
- `create`, `update`, `get`, `list`, `move`, `link`, `archive`, `create_batch`
- `watch_files` - Start file watching for auto-transitions

#### Documentation
- `TASK_OVERVIEW.md` - Lifecycle, status transitions
- `TASK_ACTIONS.md` - All action references with examples
- `TASK_LINKING.md` - Link tasks to decisions/constraints/files
- `TASK_MIGRATION.md` - Migrate from decision-based tracking

---

## [2.1.4] - 2025-10-15

### Fixed - Action Validation

**Enhanced parameter validation for all MCP actions**

---

## [2.1.3] - 2025-10-15

### Fixed - Message Priority Handling

**Fixed message priority enum conversion**

---

## [2.1.2] - 2025-10-15

### Fixed - File Change Tracking

**Fixed file change timestamp handling**

---

## [2.1.1] - 2025-10-15

### Fixed - Constraint Deactivation

**Fixed constraint soft delete logic**

---

## [2.1.0] - 2025-10-14

### Added - Template System

**Decision and batch operation templates**

#### Features
- New actions: `set_from_template`, `create_template`, `list_templates`
- Template-based decision creation
- Batch operation support with `set_batch`, `send_batch`, `record_batch`

---

## [2.0.0] - 2025-10-11

### Changed - Action-Based Tool Consolidation

**96% token reduction through action-based API**

#### Breaking Changes
- 20 tools → 6 tools (action-based routing)
- All tools use `action` parameter for routing
- Tool names changed: `context` → `decision`, `utils` → `stats`

#### Token Efficiency
- Tool definitions: 12,848 → 481 tokens (96% reduction)
- MCP context: ~13,730 → ~4,482 tokens (67% reduction)
- Help actions provide on-demand documentation

#### New Tool Structure
- `decision` - Context Management (9 actions)
- `message` - Agent Messaging (4 actions)
- `file` - File Change Tracking (4 actions)
- `constraint` - Constraint Management (4 actions)
- `stats` - Statistics & Utilities (4 actions)
- `config` - Configuration (3 actions)

---

## [1.1.2] - 2025-10-11

### Fixed - Database Migration

**Fixed v1.2.0 → v1.3.0 table prefix migration**

---

## [1.1.1] - 2025-10-11

### Fixed - Auto-Cleanup

**Fixed weekend-aware cleanup trigger timing**

---

## [1.1.0] - 2025-10-11

### Added - Weekend-Aware Auto-Deletion

**Configurable retention with weekend-aware logic**

#### Features
- Configuration keys: `autodelete_ignore_weekend`, `autodelete_message_hours`, `autodelete_file_history_days`
- CLI arguments for startup override
- Manual cleanup via `clear_old_data` action

---

## [1.0.1] - 2025-10-11

### Fixed - Schema Initialization

**Fixed initial database schema creation**

---

## [1.0.0] - 2025-01-10

### Added - Initial Release

**MCP Shared Context Server for efficient context sharing**

#### Core Features
- Decision tracking with metadata (tags, layers, scopes, versions)
- Agent messaging with priority levels
- File change tracking with layer integration
- Constraint management with priorities
- Statistics and utilities
- SQLite-based persistence with better-sqlite3

#### Database Schema
- Master tables: agents, files, context_keys, layers, tags, scopes, etc.
- Transaction tables: decisions, messages, file_changes, constraints
- Views for token-efficient queries
- Automatic version history tracking

#### MCP Tools
Initial implementation with 20 separate tools (consolidated to 6 in v2.0.0)
