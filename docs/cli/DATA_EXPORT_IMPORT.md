# Data Export/Import

> JSON-based project data migration for sharing and multi-database workflows

## Overview

sqlew provides a complete JSON export/import system for migrating project data between databases. This is useful for:

- **Project Sharing** - Share context with team members or between machines
- **Database Migration** - Move projects to different sqlew databases (different machine, different DB type)
- **Multi-Project Consolidation** - Merge multiple project exports into one database

**⚠️ Important**: Import skips if project name already exists (default: `--skip-if-exists=true`). This is **NOT a
backup/restore solution**.

**For backup/restore, use `db:dump` instead**: See [Database Migration Guide](DATABASE_MIGRATION.md) for full backup
solutions including schema + data using SQL dumps.

## Quick Start

### Export a Project

```bash
# You have to install sqlew via npm to use CLI mode
cd /path/to/your/project
npm install sqlew

# Export all projects
node node_modules/sqlew/dist/cli.js db:export --output=full-backup.json

# or Export specific project to file
node node_modules/sqlew/dist/cli.js db:export --project=my-project --output=backup.json

# Export to stdout (pipe to another command)
node node_modules/sqlew/dist/cli.js db:export --project=visualizer
```

### Import a Project

```bash
# You have to install sqlew via npm to use CLI mode (We recommend install per project)
cd /path/to/your/other-project
npm install sqlew

# Import from JSON export
node node_modules/sqlew/dist/cli.js db:import --source=backup.json

# Import with custom project name
node node_modules/sqlew/dist/cli.js db:import --source=backup.json --project-name=new-name

# Dry-run validation (no actual import)
node node_modules/sqlew/dist/cli.js db:import --source=backup.json --dry-run
```

## Export Command

### Syntax

```bash
node node_modules/sqlew/dist/cli.js db:export [options]
```

### Options

| Option             | Description                     | Default           |
|--------------------|---------------------------------|-------------------|
| `--project <name>` | Export specific project by name | All projects      |
| `--output <file>`  | Output file path                | stdout            |
| `--db-path <path>` | Database file path              | `.sqlew/sqlew.db` |
| `--config <path>`  | Config file path                | Auto-detect       |

### What Gets Exported

- **Master Tables** (filtered to used entries only):
    - Agents (m_agents)
    - Context keys (m_context_keys)
    - Files (m_files)
    - Tags (m_tags)
    - Scopes (m_scopes)
    - Layers (m_layers)
    - Project metadata (m_projects)

- **Transaction Tables** (all data for selected project):
    - Decisions with context (t_decisions, t_decision_context)
    - Tasks with details (t_tasks, t_task_details)
    - File changes (t_file_changes)
    - Constraints (t_constraints)

- **Junction Tables** (relationships):
    - Task tags, file links, decision links, dependencies
    - Decision tags, scopes
    - Constraint tags

## Import Command

### Syntax

```bash
node node_modules/sqlew/dist/cli.js db:import --source=<file> [options]
```

### Options

| Option                  | Description                   | Default            |
|-------------------------|-------------------------------|--------------------|
| `--source <file>`       | JSON export file path         | **Required**       |
| `--project-name <name>` | Target project name           | Use name from JSON |
| `--skip-if-exists`      | Skip import if project exists | `true`             |
| `--dry-run`             | Validate only, don't import   | `false`            |
| `--db-path <path>`      | Database file path            | `.sqlew/sqlew.db`  |
| `--config <path>`       | Config file path              | Auto-detect        |

### Import Process

1. **Validation** - Checks JSON format, required fields, data types
2. **Conflict Detection** - Checks if project name already exists
3. **Topological Sort** - Resolves task dependencies (circular detection)
4. **ID Remapping** - Creates new IDs for all imported data
5. **Master Table Merge** - Reuses existing agents/tags/files by name
6. **Transaction Import** - Imports with fresh IDs and translated foreign keys
7. **Junction Table Import** - Restores all relationships
8. **Validation** - Verifies all foreign key references

### Smart Features

**ID Remapping**:

- All imported data gets fresh auto-incremented IDs
- Original IDs are mapped to new IDs during transaction
- Foreign key references automatically updated

**Master Table Deduplication**:

- Agents, tags, scopes, files reused if they already exist (by name/path)
- Prevents duplicate entries for common metadata
- Project-scoped master tables (m_files, m_tags, m_scopes) isolated by project_id

**Dependency Resolution**:

- Task dependencies sorted topologically
- Circular dependency detection prevents invalid imports
- Dependencies always imported before dependents

**Transaction Safety**:

- All-or-nothing semantics (full rollback on any error)
- Idempotent operations (safe to retry on failure)
- Comprehensive error messages with validation details

## Installation for CLI Usage

For users who need to use export/import commands, install sqlew per-project:

```bash
# Install in your project directory
cd /path/to/your/project
npm install sqlew

# Now you can use CLI commands
node node_modules/sqlew/dist/cli.js db:export --output=backup.json
node node_modules/sqlew/dist/cli.js db:import --source=backup.json
```

**Tip**: Add a shortcut to your `package.json` for convenience:

```json
{
  "scripts": {
    "sqlew": "node node_modules/sqlew/dist/cli.js"
  }
}
```

Then you can use: `npm run sqlew db:export --output=backup.json`

**Note**: The MCP server (`npx sqlew`) and CLI commands are both included in the same `sqlew` package. You only need to
install once.

## Use Cases

### Multi-Project Single Database (Permission-Constrained Environments)

**Scenario**: You work on multiple projects but don't have permissions to create separate MySQL databases. You want to
consolidate all project contexts into one shared database.

**Solution**: Use export/import to merge multiple project contexts:

```bash
# Step 1: Export from each project's SQLite database
cd ~/project-a
npm install sqlew
node node_modules/sqlew/dist/cli.js db:export --project=project-a --output=/tmp/project-a.json

cd ~/project-b
npm install sqlew
node node_modules/sqlew/dist/cli.js db:export --project=project-b --output=/tmp/project-b.json

cd ~/project-c
npm install sqlew
node node_modules/sqlew/dist/cli.js db:export --project=project-c --output=/tmp/project-c.json

# Step 2: Create shared database and import all projects
cd ~/shared-database
npm install sqlew

# Configure to use single MySQL database (edit .sqlew/config.toml)
# [database]
# type = "mysql"
# host = "localhost"
# port = 3306
# user = "myuser"
# password = "mypassword"
# database = "shared_sqlew_db"

node node_modules/sqlew/dist/cli.js db:import --source=/tmp/project-a.json
node node_modules/sqlew/dist/cli.js db:import --source=/tmp/project-b.json
node node_modules/sqlew/dist/cli.js db:import --source=/tmp/project-c.json

# Step 3: Configure each project to use shared database
# In each project's .mcp.json:
# {
#   "mcpServers": {
#     "sqlew": {
#       "command": "npx",
#       "args": ["sqlew", "--config-path=/path/to/shared-database/.sqlew/config.toml"]
#     }
#   }
# }
```

**Benefits**:

- ✅ Single database for multiple projects (saves database quota)
- ✅ Cross-project context visibility (search decisions across all projects)
- ✅ Centralized backup and maintenance
- ✅ Works with permission-constrained MySQL/PostgreSQL environments

**Trade-offs**:

- ⚠️ All projects share same database connection pool
- ⚠️ Requires manual config path in each project's .mcp.json
- ⚠️ Project isolation maintained via project_id, not separate databases

### Database Migration (Cross-Machine or Cross-Database)

```bash
# Export from source database
node node_modules/sqlew/dist/cli.js db:export --project=main --output=main-export.json

# Import to different database (different machine or different database type)
# This works because the project doesn't exist in the target database yet
node node_modules/sqlew/dist/cli.js db:import --source=main-export.json --db-path=/path/to/new/database.db
```

**Note**: Import skips if project name exists.

**For backup/restore, use `db:dump` instead**:

```bash
# Backup with SQL dump (preserves schema + data)
node node_modules/sqlew/dist/cli.js db:dump --format=sqlite --output=backup-$(date +%Y%m%d).sql

# Or simple SQLite file copy
cp .sqlew/sqlew.db .sqlew/backup-$(date +%Y%m%d).db
```

See `node node_modules/sqlew/dist/cli.js db:dump --help` for full backup options.

### Project Sharing

```bash
# Developer A: Export project
node node_modules/sqlew/dist/cli.js db:export --project=feature-x --output=feature-x.json

# Developer B: Import project
node node_modules/sqlew/dist/cli.js db:import --source=feature-x.json
```

### Multi-Project Consolidation

```bash
# Export from different databases
node node_modules/sqlew/dist/cli.js db:export --project=visualizer --output=vis.json
node node_modules/sqlew/dist/cli.js db:export --project=api --output=api.json

# Import to single database
node node_modules/sqlew/dist/cli.js db:import --source=vis.json
node node_modules/sqlew/dist/cli.js db:import --source=api.json
```

### Cross-Database Migration

```bash
# Export from SQLite
node node_modules/sqlew/dist/cli.js db:export --output=data.json --db-path=.sqlew/sqlew.db

# Import to MySQL
node node_modules/sqlew/dist/cli.js db:import --source=data.json --db-path=mysql://localhost/sqlew
```

## Error Handling

### Common Errors

**Project Already Exists**:

```
Error: Project "my-project" already exists in target database
```

Solution: Use `--project-name` to specify different name, or remove existing project

**Circular Dependencies**:

```
Error: Circular dependency detected in task dependencies
```

Solution: Fix dependency graph in source database before exporting

**Invalid Foreign Keys**:

```
Error: Foreign key constraint violation for task_id=123
```

Solution: Ensure all referenced entities exist in export

### Dry-Run Validation

Always test imports with `--dry-run` first:

```bash
node node_modules/sqlew/dist/cli.js db:import --source=data.json --dry-run
```

This validates:

- JSON format and structure
- Project name conflicts
- Task dependency cycles
- Foreign key references
- Data type correctness

## Technical Details

### Performance

- **Batch Inserts**: 10-row batches to avoid SQLite limits
- **Transaction Scope**: Single transaction for atomicity
- **Memory Efficient**: Streams large datasets

### Limitations

- **Max JSON Size**: Limited by available memory
- **SQLite Batch Limit**: 500 UNION ALL clauses (handled automatically)
- **Cross-Database**: JSON format only (no SQL dump)

### Data Integrity

- **Foreign Key Validation**: All references validated before insertion
- **Orphan Cleanup**: Invalid references automatically filtered
- **View Restoration**: Views temporarily dropped and restored during import
- **Idempotent Operations**: Safe to retry on network/disk failures

## Comparison with db:dump

| Feature            | db:export (JSON)         | db:dump (SQL)                            |
|--------------------|--------------------------|------------------------------------------|
| Format             | JSON data only           | SQL DDL + data                           |
| Schema             | Not included             | Full schema included                     |
| Use Case           | Project migration        | **Backup/restore, database replication** |
| Cross-DB           | ✅ Yes                    | ❌ No (dialect-specific)                  |
| Size               | Smaller (~40% reduction) | Larger (includes schema)                 |
| Import Speed       | Slower (ID remapping)    | Faster (direct SQL execution)            |
| Conflict Handling  | Smart deduplication      | Overwrite or fail                        |
| Restore Capability | ❌ Skips if exists        | ✅ Full restore                           |

**When to use db:export (JSON)**:

- Migrating projects between different sqlew databases
- Sharing specific projects with team members
- Merging multiple projects into one database
- Cross-database migration (SQLite → MySQL → PostgreSQL)

**When to use db:dump (SQL)** - **RECOMMENDED FOR BACKUP**:

- **Full database backup with schema** ✅
- **Database restore/recovery** ✅
- Database replication
- Development → Production deployment
- Same database type migration

See [Database Migration Guide](DATABASE_MIGRATION.md) for complete `db:dump` documentation.

## See Also

- [Database Migration](DATABASE_MIGRATION.md) - SQLite → MySQL/PostgreSQL migration
- [CHANGELOG.md](../../CHANGELOG.md#374) - v3.7.4 release notes
- [Architecture](../ARCHITECTURE.md) - Technical architecture overview
