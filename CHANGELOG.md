# Changelog

All notable changes to sqlew will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- `create`, `update`, `get`, `list`, `move`, `link`, `archive`, `batch_create`
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
