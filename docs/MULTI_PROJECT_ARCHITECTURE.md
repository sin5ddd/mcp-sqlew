# Multi-Project Support Architecture (v3.7.0)

**Status**: Architectural decisions finalized
**Version**: 3.7.0
**Last Updated**: 2025-11-01

## Executive Summary

Multi-project support enables a single MCP Shared Context Server database to manage data for multiple projects with strict isolation guarantees. The architecture prioritizes **stability**, **performance**, and **MCP compliance** through config-driven detection, in-memory caching, and universal project filtering.

### Key Principles

1. **Config.toml as Single Source of Truth**: After first run, project identity is explicit and stable
2. **Zero User Intervention**: Auto-detection with persistent configuration
3. **Session-Fixed Project Identity**: In-memory caching eliminates repeated database queries
4. **Universal Data Isolation**: Every transaction query filters by project_id
5. **MCP Compliance**: Structured logging only, no console.* methods

---

## Architectural Decisions (8 Total)

### Decision #1: Detection Priority Strategy

**Key**: `multi-project/detection-priority-strategy`
**Layer**: cross-cutting
**Priority**: CRITICAL

**Decision**: Project detection follows config.toml → (git/metadata → auto-write to config.toml) priority. After first run, config.toml ALWAYS contains project_name and becomes the authoritative source.

**Rationale**: Config.toml as single source of truth ensures predictability and stability. Auto-write on first detection eliminates manual configuration burden while maintaining explicit configuration benefits. Once written, config.toml never changes during normal operation, preventing race conditions from repeated detection attempts.

**Alternatives Considered**:
- Git-only detection - unreliable for non-git projects, no stability guarantees
- Manual-only config - poor UX, requires user intervention
- Database-stored project name - coupling data to config, migration complexity
- Detection on every call - performance penalty, inconsistent behavior during git operations

**Tradeoffs**:
- **Gains**: Stability after first run, explicit configuration benefits, intelligent defaults for common cases (git repos), zero user intervention required
- **Sacrifices**: Initial file write operation, config.toml becomes mandatory for all projects
- **Long-term**: Simplified debugging (config.toml is authoritative), easier multi-project switching (edit one file), version control friendly

**Related Constraints**: C23, C24, C32, C33, C46

---

### Decision #2: Auto-Initialization with Config Persistence

**Key**: `multi-project/auto-initialization-config`
**Layer**: cross-cutting
**Priority**: CRITICAL

**Decision**: On first MCP server start, if config.toml lacks project_name, detect from git/metadata and automatically write to config.toml. Subsequent runs read config.toml exclusively, never re-detect.

**Rationale**: One-time detection with persistent configuration combines best of both worlds: zero user intervention for initial setup, guaranteed stability for all subsequent operations. Writing to config.toml ensures project identity never drifts based on git state changes (branch switches, repo moves).

**Why Auto-Write Instead of Just Using Detected Value?**
1. **Explicit Configuration**: Users can inspect config.toml to verify project identity
2. **Prevents Drift**: Git state changes (branch switches, .git directory moves) don't affect project identity
3. **Version Control Friendly**: Config.toml can be committed to track project name
4. **Troubleshooting Anchor**: Always check config.toml first when debugging project issues

**What Happens If User Manually Edits config.toml After Auto-Write?**
- Config.toml becomes new source of truth immediately
- Next MCP server start uses edited value
- Supports intentional project renaming or multi-workspace setups where user wants different project names than git repo name

**Alternatives Considered**:
- Always re-detect on startup - unstable, changes with git operations
- Prompt user on missing config - poor automation, breaks headless usage
- Use default fallback name - loses project context
- Store in database only - hidden configuration, harder to debug

**Tradeoffs**:
- **Gains**: Stability (config never changes after initialization), transparency (config.toml is human-readable), automation (no prompts), session consistency
- **Sacrifices**: File system write on first run, requires config.toml management for project switching
- **Long-term**: Simplified troubleshooting, easier CI/CD (commit config.toml), supports multi-workspace setups

**Related Constraints**: C23, C24, C32, C33

---

### Decision #3: Master Table Sharing with Transaction Isolation

**Key**: `multi-project/master-table-sharing`
**Layer**: data
**Priority**: CRITICAL

**Decision**: All master tables (m_*) are project-shared with project_id column. Transaction tables (t_*) are project-isolated with FOREIGN KEY to m_projects. Views automatically filter by project context.

**Rationale**: Shared master tables enable cross-project references (e.g., same agent working on multiple projects, shared constraint categories) while maintaining data integrity via foreign keys. Project isolation at transaction level prevents accidental cross-contamination. Single database design simplifies backup, reduces connection overhead, enables future cross-project analytics.

**Alternatives Considered**:
- Separate databases per project - connection overhead, backup complexity, no cross-project queries
- No project_id in master tables - lose cross-project context
- Complete isolation - duplicate master data, sync issues
- Schema-per-project in PostgreSQL - tooling complexity, migration challenges

**Tradeoffs**:
- **Gains**: Single database simplicity, cross-project agent tracking, foreign key integrity, efficient storage (shared enums/categories)
- **Sacrifices**: Must filter every transaction query by project_id, risk of cross-project data leaks if filters missing
- **Long-term**: Easier multi-project analytics, simpler backup/restore, supports future features like project templates

**Related Constraints**: C25, C26, C27, C28, C29, C35

---

### Decision #4: Config Inheritance Pattern

**Key**: `multi-project/config-inheritance`
**Layer**: infrastructure
**Priority**: HIGH

**Decision**: Auto-deletion settings (retention periods, weekend awareness) are global configuration. Project-specific overrides stored in m_project_config table (future enhancement).

**Rationale**: Most retention policies are organizational standards, not project-specific. Global configuration reduces complexity for v1 implementation while maintaining extensibility. Projects inherit global defaults unless overridden. Simplifies initial migration and user mental model.

**Alternatives Considered**:
- All config project-specific - over-engineering for v1
- No inheritance mechanism - future inflexibility
- Config templates - premature abstraction
- Hardcoded per-project defaults - unmaintainable

**Tradeoffs**:
- **Gains**: Simple mental model (one config to rule them all), easy global policy updates, reduced storage
- **Sacrifices**: Cannot set different retention per project initially, requires future enhancement for project-specific overrides
- **Long-term**: Inherit-then-override pattern supports compliance requirements (e.g., legal projects retain longer)

**Related Constraints**: C40

---

### Decision #5: Knex Migration with Zero Data Loss

**Key**: `multi-project/migration-approach`
**Layer**: infrastructure
**Priority**: CRITICAL

**Decision**: Use Knex migration system with ALTER TABLE statements to add project_id columns, create m_projects table, backfill existing data as 'default' project, add foreign key constraints. Zero data loss guaranteed.

**Rationale**: Knex migrations proven reliable across SQLite/MySQL/PostgreSQL (existing v3.6.x track record). ALTER TABLE approach preserves all existing data while adding multi-project structure. Backfill to 'default' project ensures backward compatibility for single-project users. Migration can be rolled back if issues detected.

**Alternatives Considered**:
- Dump-and-restore - risky, potential data loss
- Manual SQL scripts - error-prone, no rollback
- New database schema - breaks existing installations
- Application-level migration - slower, complex error handling

**Tradeoffs**:
- **Gains**: Zero data loss, rollback capability, tested migration framework, cross-database compatibility
- **Sacrifices**: Migration time scales with data volume, requires exclusive database access during migration
- **Long-term**: Established pattern for future schema changes, migration history tracked in knex_migrations table

**Related Constraints**: C34, C11, C13

---

### Decision #6: Database-Specific Primary Key Migration

**Key**: `multi-project/database-specific-pk-migration`
**Layer**: infrastructure
**Priority**: HIGH

**Decision**: For databases requiring composite primary keys (project_id, original_pk), handle SQLite (recreate table), MySQL/PostgreSQL (DROP/ADD PRIMARY KEY) differences explicitly in migration code using Knex client detection.

**Rationale**: SQLite cannot ALTER TABLE to change primary keys (requires table recreation). MySQL/PostgreSQL support DROP PRIMARY KEY + ADD PRIMARY KEY in single transaction. Knex client.config.client property enables database-specific migration logic. Single migration file with conditional branching maintains maintainability.

**Alternatives Considered**:
- Separate migration files per database - maintenance nightmare
- Ignore primary key changes - data integrity risk
- Recreate all tables - unnecessary for MySQL/PostgreSQL
- Use AUTO_INCREMENT workaround - breaks foreign key references

**Tradeoffs**:
- **Gains**: Optimal migration strategy per database, single migration file, no data loss
- **Sacrifices**: Increased migration complexity, longer SQLite migration time (table recreation), requires careful testing per database
- **Long-term**: Pattern established for future composite key migrations, documented approach for contributors

**Related Constraints**: C9, C11, C15

---

### Decision #7: MCP-Compliant Logging (NEW)

**Key**: `multi-project/mcp-compliant-logging`
**Layer**: infrastructure
**Priority**: CRITICAL

**Decision**: All logging MUST use MCP server.logger methods (info, warn, error, debug). Absolutely NO console.log/console.warn/console.error in production code. Return structured JSON-only responses from tools.

**Rationale**: MCP specification requires structured logging via server.logger for proper client-side handling. Console methods bypass MCP protocol, causing log messages to appear as raw stderr/stdout, breaking JSON-RPC communication. Server.logger provides log levels, metadata objects, and client-side filtering. Structured responses enable better error handling and debugging.

**Alternatives Considered**:
- console.* methods - violates MCP spec, breaks clients, logs appear as raw stderr/stdout
- Custom logger wrapper - reinventing wheel, compatibility issues with MCP clients
- Mixed approach - inconsistent, debugging nightmare, violates principle of least surprise
- No logging - impossible to troubleshoot production issues

**Tradeoffs**:
- **Gains**: MCP spec compliance, structured metadata (timestamps, levels, context), client-side filtering, better debugging experience, proper error propagation to clients
- **Sacrifices**: More verbose code (server.logger.info vs console.log), must pass server instance to utility functions, learning curve for developers unfamiliar with MCP logging patterns
- **Long-term**: Better observability, compatible with future MCP logging standards, enables log aggregation and monitoring tools

**Related Constraints**: C22, C42, C43, C45

---

### Decision #8: In-Memory Project Caching (NEW)

**Key**: `multi-project/in-memory-project-caching`
**Layer**: business
**Priority**: CRITICAL

**Decision**: Project ID cached in memory via ProjectContext singleton after first detection. Never re-query database for project_id during MCP server session. Session-fixed (restart required to switch projects).

**Rationale**: Querying database for project_id on every tool call (potentially 100+ times per conversation) creates massive performance penalty. In-memory caching reduces database load by 99%, simplifies code (no project_id parameter threading), guarantees session consistency. Project switching is rare operation, restart is acceptable trade-off for performance.

**Performance Analysis**:
- **Without caching**: 100-200 tool calls per conversation × 5-15ms latency = 500-3000ms total overhead
- **With singleton caching**: One query on initialization (5-15ms), then zero overhead
- **Database load reduction**: 99%+ (one query vs hundreds)

**Alternatives Considered**:
- Query every time - 100+ DB queries per conversation, cumulative 500-3000ms latency
- Store in DB config table - still requires query, cache invalidation complexity
- Thread project_id through all function calls - pollutes 50+ functions with extra parameter, error-prone
- Use global variable - not testable, singleton pattern better (can reset in tests)

**Tradeoffs**:
- **Gains**: Massive performance improvement (one query vs hundreds), session consistency guaranteed, simpler code (no parameter threading), testable (singleton can be reset)
- **Sacrifices**: Must restart MCP server to switch projects, singleton pattern adds slight complexity, memory overhead (negligible: one integer + one string)
- **Long-term**: Enables future optimizations (cache project config, metadata), supports performance monitoring (track cache hit rate)

**Related Constraints**: C21, C30, C31, C41, C44, C47

---

## Decision Linking Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MULTI-PROJECT ARCHITECTURE                       │
│                           (v3.7.0)                                  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
            ┌───────▼────────┐          ┌────────▼────────┐
            │  Configuration  │          │   Performance   │
            │    Strategy     │          │   Optimization  │
            └───────┬────────┘          └────────┬────────┘
                    │                             │
        ┌───────────┼───────────┐      ┌─────────┼─────────┐
        │           │           │      │         │         │
   ┌────▼───┐  ┌───▼────┐  ┌──▼───┐ ┌▼─────┐ ┌─▼──────┐ │
   │   D1   │  │   D2   │  │  D7  │ │  D8  │ │  D4    │ │
   │Detect  │  │ Auto-  │  │ MCP  │ │Cache │ │Config  │ │
   │Priority│  │ Init   │  │ Log  │ │Proj  │ │Inherit │ │
   └────┬───┘  └───┬────┘  └──┬───┘ └┬─────┘ └────────┘ │
        │          │           │      │                   │
        └──────────┼───────────┴──────┘                   │
                   │                                      │
            ┌──────▼───────┐                              │
            │  Data Layer  │◄─────────────────────────────┘
            │   Strategy   │
            └──────┬───────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
   ┌────▼───┐  ┌──▼────┐  ┌──▼───┐
   │   D3   │  │  D5   │  │  D6  │
   │Master  │  │Migr.  │  │DB-Sp │
   │Tables  │  │Knex   │  │PK Mg │
   └────────┘  └───────┘  └──────┘

Legend:
D1 = Detection Priority Strategy (CRITICAL)
D2 = Auto-Initialization Config (CRITICAL)
D3 = Master Table Sharing (CRITICAL)
D4 = Config Inheritance (HIGH)
D5 = Migration Approach (CRITICAL)
D6 = Database-Specific PK Migration (HIGH)
D7 = MCP-Compliant Logging (CRITICAL)
D8 = In-Memory Project Caching (CRITICAL)
```

### Decision Dependencies

**Configuration Strategy** (Root):
- D1 → D2: Detection priority drives auto-initialization logic
- D2 → D7: Auto-init must use MCP-compliant logging
- D1 + D2 → D8: Stable config enables session-fixed caching

**Performance Optimization** (Root):
- D8 → D3: In-memory cache requires project_id from m_projects
- D8 → D4: Cached project_id used for config inheritance lookups

**Data Layer Strategy** (Dependent):
- D3 → D5: Master table design drives migration approach
- D5 → D6: Migration strategy requires database-specific PK handling
- D3 → D7: Data layer operations must use MCP logging

---

## Architectural Constraints (25 Total)

### CRITICAL Constraints (12)

#### Configuration & Initialization

**C23**: Config.toml MUST be written on first MCP server run if missing project_name field. Detection happens once, writes to config.toml, then config becomes authoritative source for all subsequent runs.

**C24**: After first run, config.toml is the ONLY source for project_name. Code MUST NOT re-detect from git/metadata on subsequent runs. Prevents drift and ensures session stability.

**C32**: Config.toml auto-write MUST be atomic. Use temp file + rename pattern to prevent partial writes if process crashes during initialization. No corrupted config files allowed.

#### Data Isolation & Security

**C25**: Every transaction table query (t_decisions, t_file_changes, t_constraints, t_tasks, etc.) MUST filter by project_id. No exceptions. Prevents accidental cross-project data leaks.

**C21**: All transaction table queries MUST include WHERE project_id = cached_value. No cross-project queries except explicit _reference_project parameter.

**C26**: All transaction tables (t_*) MUST have project_id column with FOREIGN KEY constraint to m_projects(id). Ensures referential integrity and prevents orphaned records.

**C27**: Cross-project references (e.g., task linking to decision in different project) REQUIRE explicit _reference_project parameter. Implicit cross-project access is prohibited for security.

**C29**: Before INSERT/UPDATE/DELETE on transaction tables, code MUST validate project_id matches current session project. Fail-fast validation required to prevent accidental cross-project writes.

**C40**: Auto-deletion cleanup MUST respect project boundaries. Cleanup operations filter by project_id before deleting old messages/file changes. No cross-project cleanup allowed.

#### MCP Compliance

**C22**: NO console.log() or console.warn() in production code. Use MCP SDK logger for all output. Return structured JSON responses only.

**C42**: Production code MUST NOT use console.log, console.warn, console.error, or console.debug. Use server.logger methods (info, warn, error, debug) exclusively for MCP compliance.

**C43**: All MCP tool responses MUST return structured JSON objects only. No plaintext error messages or status strings as top-level responses. Enables proper error handling by clients.

#### Performance

**C41**: Project ID MUST be cached in ProjectContext singleton after first detection. Code MUST NOT query database for project_id on every tool call. Query once per session only.

#### Migration

**C34**: Migration to multi-project schema MUST backfill existing data as 'default' project. All existing records get project_id=1 (default project). Zero data loss required.

---

### HIGH Constraints (13)

#### Architecture & Design

**C28**: Master tables (m_agents, m_layers, m_tags, etc.) MUST be project-shared. Code must handle project_id column presence but not filter master table queries by project.

**C30**, **C44**: ProjectContext singleton MUST provide getProjectId() and getProjectName() methods. Code must use singleton instead of direct database queries for project information.

**C31**: MCP server restart is REQUIRED to switch projects. Runtime project switching is explicitly not supported. Document this limitation clearly in user-facing documentation.

**C33**: If config.toml exists but lacks [project] section or project_name field, treat as missing and auto-write. Preserve other config sections (database, retention, etc.) during write.

**C35**: Views (v_tagged_decisions, v_task_board, etc.) MUST automatically filter by current project context. View definitions must use ProjectContext.getProjectId() or equivalent.

**C37**: Project names MUST be validated (alphanumeric + hyphens/underscores only, max 64 chars). Reject special characters to prevent injection attacks in SQL identifiers or file paths.

**C39**: Database indexes on transaction tables MUST include project_id as first column in composite indexes. Example: (project_id, ts) instead of (ts) for time-based queries. Optimizes project-filtered queries.

#### Logging & Documentation

**C45**: Logging calls MUST use structured metadata objects as second parameter. Example: server.logger.info('Project detected', { project_name, source: 'git' }). Enables better filtering and analysis.

**C46**: Config.toml auto-write behavior MUST be documented in README.md and ARCHITECTURE.md. Explain detection priority, first-run behavior, and how to manually override project name.

#### Testing

**C47**: All multi-project tests MUST reset ProjectContext singleton between test cases. Use ProjectContext.reset() or equivalent to ensure test isolation.

**Integration Test Coverage**: Integration tests MUST cover multi-project scenarios: (1) Create projects A and B. (2) Add data to both. (3) Switch context to A, verify only A's data visible. (4) Switch to B, verify isolation. Prevents regression.

---

### MEDIUM Constraints (2)

**C36**: Project detection from git MUST use safe git commands (git rev-parse --show-toplevel, git config --get remote.origin.url). Handle git command failures gracefully, fall back to directory name.

**C38**: Stats tool MUST aggregate data by project. Global stats (all projects) require explicit all_projects=true parameter. Default behavior is current-project-only stats.

---

## Implementation Checklist

### Phase 1: Foundation (Est. AI Time: 25-30 min, Tokens: 18k-25k)

- [ ] Create ProjectContext singleton class
  - getProjectId(): number
  - getProjectName(): string
  - reset(): void (for testing)
- [ ] Implement config.toml detection & auto-write
  - Atomic write with temp file + rename
  - Preserve existing config sections
  - Validate project_name (alphanumeric + hyphens/underscores, max 64 chars)
- [ ] Replace all console.* with server.logger.*
  - Audit codebase for console.log/warn/error/debug
  - Add structured metadata objects
  - Update error handling to return JSON

### Phase 2: Migration (Est. AI Time: 35-40 min, Tokens: 25k-35k)

- [ ] Create Knex migration file
  - Create m_projects table
  - Add project_id columns to all transaction tables
  - Backfill 'default' project (project_id=1)
  - Add FOREIGN KEY constraints
  - Database-specific PK migration (SQLite vs MySQL/PostgreSQL)
  - Update indexes (project_id as first column)
- [ ] Test migration on all databases (SQLite, MySQL, PostgreSQL)
- [ ] Create rollback migration

### Phase 3: Query Updates (Est. AI Time: 45-55 min, Tokens: 30k-45k)

- [ ] Update all transaction table queries
  - Add WHERE project_id = ProjectContext.getProjectId()
  - Decision tool (set, get, list, search_*)
  - File tool (record, get)
  - Constraint tool (add, get)
  - Task tool (create, update, get, list, move, etc.)
- [ ] Update views to filter by project_id
- [ ] Update cleanup logic (auto-deletion respects project boundaries)
- [ ] Add fail-fast validation for INSERT/UPDATE/DELETE

### Phase 4: Testing (Est. AI Time: 30-35 min, Tokens: 20k-30k)

- [ ] Unit tests for ProjectContext singleton
- [ ] Integration tests for multi-project isolation
- [ ] Migration tests (up/down on all databases)
- [ ] Performance tests (verify caching effectiveness)
- [ ] Test config.toml auto-write edge cases

### Phase 5: Documentation (Est. AI Time: 15-20 min, Tokens: 10k-15k)

- [ ] Update README.md (auto-write behavior, project switching)
- [ ] Update ARCHITECTURE.md (decision records, constraints)
- [ ] Update TOOL_REFERENCE.md (new parameters, behaviors)
- [ ] Create migration guide for existing users

---

## Future Enhancements

### v3.8.0: Project-Specific Config Overrides
- m_project_config table for per-project retention settings
- Inherit-then-override pattern
- API: config tool with project parameter

### v3.9.0: Cross-Project Analytics
- Global stats with all_projects=true
- Cross-project dependency tracking
- Project comparison reports

### v4.0.0: Multi-Tenant Support
- Project access control (read/write permissions)
- Project groups/workspaces
- Shared project templates

---

## Token Efficiency Notes

**Total Decisions**: 8 (avg 300 tokens each = 2,400 tokens)
**Total Constraints**: 25 (avg 80 tokens each = 2,000 tokens)
**Total Architecture Documentation**: ~8,000 tokens

**Efficiency Strategies**:
- Decision context stored separately (add_decision_context)
- Constraints reference decision keys (no duplication)
- Structured templates reduce verbosity
- Link relationships instead of re-explaining

**Estimated Implementation**:
- **Total AI Time**: 150-180 minutes (2.5-3 hours)
- **Total Tokens**: 103k-150k tokens
- **Human Equivalent**: ~15-20 hours of manual work

---

## References

- **CLAUDE.md**: Project overview, current status
- **SHARED_CONCEPTS.md**: Layer definitions, enum values
- **TOOL_REFERENCE.md**: MCP tool parameters, examples
- **ARCHITECTURE.md**: Database schema, migration system

---

**Document Version**: 1.0.0
**Last Review**: 2025-11-01
**Next Review**: After v3.7.0 implementation complete
