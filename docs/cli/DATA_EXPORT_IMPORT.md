# Data Export/Import

> JSON-based project data migration for sharing and multi-database workflows

## 📢 v4.0.2 Update: JSON is Now Required for Cross-Database Migration

Starting from v4.0.2, **JSON export/import is the ONLY supported method for cross-database migrations** (e.g., SQLite → MySQL, MySQL → PostgreSQL).

SQL dump (`db:dump`) no longer supports cross-database format conversion. See [Complete Cross-Database Migration Guide](#complete-cross-database-migration-guide-v402) below for step-by-step instructions.

---

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
# Export all projects (no installation required!)
npx sqlew db:export backup.json

# Export specific project to file
npx sqlew db:export backup.json project=my-project

# Export to stdout (pipe to another command)
npx sqlew db:export project=visualizer
```

### Import a Project

```bash
# Import from JSON export
npx sqlew db:import backup.json

# Import with custom project name
npx sqlew db:import backup.json project-name=new-name

# Dry-run validation (no actual import)
npx sqlew db:import backup.json dry-run=true
```

## Export Command

### Syntax

```bash
npx sqlew db:export [output-file] [key=value ...]
```

### Options

| Option            | Description                     | Default           |
|-------------------|---------------------------------|-------------------|
| `project=<name>`  | Export specific project by name | All projects      |
| `db-path=<path>`  | Database file path              | `.sqlew/sqlew.db` |
| `config=<path>`   | Config file path                | Auto-detect       |

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
npx sqlew db:import <source-file> [key=value ...]
```

### Options

| Option                   | Description                   | Default            |
|--------------------------|-------------------------------|--------------------|
| `<source-file>`          | JSON export file path         | **Required**       |
| `project-name=<name>`    | Target project name           | Use name from JSON |
| `skip-if-exists=true`    | Skip import if project exists | `true`             |
| `dry-run=true`           | Validate only, don't import   | `false`            |
| `db-path=<path>`         | Database file path            | `.sqlew/sqlew.db`  |
| `config=<path>`          | Config file path              | Auto-detect        |

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

## CLI Usage

**No installation required!** The unified entry point allows direct use via npx:

```bash
# Export data
npx sqlew db:export backup.json

# Import data
npx sqlew db:import backup.json

# SQL dump (same-database backup)
npx sqlew db:dump sqlite backup.sql
```

**Note**: Both MCP server mode and CLI commands use the same `sqlew` entry point. The first argument determines the mode:
- `db:export`, `db:import`, `db:dump`, `query` → CLI mode
- No argument or MCP-related args → MCP server mode

## Use Cases

### Multi-Project Single Database (Permission-Constrained Environments)

**Scenario**: You work on multiple projects but don't have permissions to create separate MySQL databases. You want to
consolidate all project contexts into one shared database.

**Solution**: Use export/import to merge multiple project contexts:

```bash
# Step 1: Export from each project's SQLite database
cd ~/project-a
npx sqlew db:export /tmp/project-a.json project=project-a

cd ~/project-b
npx sqlew db:export /tmp/project-b.json project=project-b

cd ~/project-c
npx sqlew db:export /tmp/project-c.json project=project-c

# Step 2: Create shared database and import all projects
cd ~/shared-database

# Configure to use single MySQL database (edit .sqlew/config.toml)
# [database]
# type = "mysql"
# host = "localhost"
# port = 3306
# user = "myuser"
# password = "mypassword"
# database = "shared_sqlew_db"

npx sqlew db:import /tmp/project-a.json
npx sqlew db:import /tmp/project-b.json
npx sqlew db:import /tmp/project-c.json

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
npx sqlew db:export main-export.json project=main

# Import to different database (different machine or different database type)
# This works because the project doesn't exist in the target database yet
npx sqlew db:import main-export.json db-path=/path/to/new/database.db
```

**Note**: Import skips if project name exists.

**For backup/restore, use `db:dump` instead**:

```bash
# Backup with SQL dump (preserves schema + data)
npx sqlew db:dump sqlite backup-$(date +%Y%m%d).sql

# Or simple SQLite file copy
cp .sqlew/sqlew.db .sqlew/backup-$(date +%Y%m%d).db
```

See `npx sqlew db:dump --help` for full backup options.

### Project Sharing

```bash
# Developer A: Export project
npx sqlew db:export feature-x.json project=feature-x

# Developer B: Import project
npx sqlew db:import feature-x.json
```

### Multi-Project Consolidation

```bash
# Export from different databases
npx sqlew db:export vis.json project=visualizer
npx sqlew db:export api.json project=api

# Import to single database
npx sqlew db:import vis.json
npx sqlew db:import api.json
```

### Cross-Database Migration

```bash
# Export from SQLite
npx sqlew db:export data.json db-path=.sqlew/sqlew.db

# Import to MySQL (configure .sqlew/config.toml for MySQL first)
npx sqlew db:import data.json
```

---

## Complete Cross-Database Migration Guide (v4.0.2+)

This section provides step-by-step instructions for migrating your sqlew database between different database systems.

### Pre-Migration Checklist

Before starting a migration, ensure you have:

- [ ] **Backup your current database** (copy `.sqlew/sqlew.db` or use `db:dump`)
- [ ] **Note your current sqlew version** (`npm list sqlew`)
- [ ] **Target database is created and accessible**
- [ ] **Database credentials are available**
- [ ] **Required privileges**: SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES

### Migration: SQLite → MySQL

#### Step 1: Export from SQLite

```bash
cd /path/to/your/project

# Export all data to JSON
npx sqlew db:export migration-backup.json
```

#### Step 2: Prepare MySQL Database

```sql
-- Connect to MySQL as admin
mysql -u root -p

-- Create database (UTF-8 required for proper text handling)
CREATE DATABASE sqlew_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create user with required privileges
CREATE USER 'sqlew_user'@'localhost' IDENTIFIED BY 'your-secure-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES
  ON sqlew_db.* TO 'sqlew_user'@'localhost';
FLUSH PRIVILEGES;
```

#### Step 3: Configure config.toml for MySQL

Create or edit `.sqlew/config.toml`:

```toml
[database]
type = "mysql"

[database.connection]
host = "localhost"
port = 3306
database = "sqlew_db"

[database.auth]
type = "direct"
user = "sqlew_user"
password = "your-secure-password"

[project]
name = "your-project-name"
```

#### Step 4: Import to MySQL

```bash
# Import data to MySQL (config.toml will be used automatically)
npx sqlew db:import migration-backup.json
```

#### Step 5: Verify Migration

```bash
# Test MCP server connection
npx sqlew --config-path=.sqlew/config.toml

# Or test with MCP Inspector
npx @modelcontextprotocol/inspector npx sqlew
```

---

### Migration: SQLite → PostgreSQL

#### Step 1: Export from SQLite

```bash
cd /path/to/your/project

# Export all data to JSON
npx sqlew db:export migration-backup.json
```

#### Step 2: Prepare PostgreSQL Database

```sql
-- Connect to PostgreSQL as admin
psql -U postgres

-- Create database
CREATE DATABASE sqlew_db WITH ENCODING 'UTF8';

-- Create user with required privileges
CREATE USER sqlew_user WITH PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE sqlew_db TO sqlew_user;

-- Connect to the new database and grant schema privileges
\c sqlew_db
GRANT ALL ON SCHEMA public TO sqlew_user;
```

#### Step 3: Configure config.toml for PostgreSQL

Create or edit `.sqlew/config.toml`:

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
password = "your-secure-password"

[project]
name = "your-project-name"
```

#### Step 4: Import to PostgreSQL

```bash
# Import data to PostgreSQL
npx sqlew db:import migration-backup.json
```

#### Step 5: Verify Migration

```bash
# Test MCP server connection
npx sqlew --config-path=.sqlew/config.toml
```

---

### Migration: MySQL → PostgreSQL

#### Step 1: Export from MySQL

First, configure config.toml to connect to MySQL:

```toml
[database]
type = "mysql"

[database.connection]
host = "localhost"
port = 3306
database = "sqlew_db"

[database.auth]
type = "direct"
user = "sqlew_user"
password = "mysql-password"
```

Then export:

```bash
npx sqlew db:export migration-backup.json
```

#### Step 2: Prepare PostgreSQL Database

```sql
-- Connect to PostgreSQL as admin
psql -U postgres

-- Create database
CREATE DATABASE sqlew_db WITH ENCODING 'UTF8';

-- Create user
CREATE USER sqlew_user WITH PASSWORD 'postgres-password';
GRANT ALL PRIVILEGES ON DATABASE sqlew_db TO sqlew_user;
\c sqlew_db
GRANT ALL ON SCHEMA public TO sqlew_user;
```

#### Step 3: Update config.toml for PostgreSQL

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
password = "postgres-password"

[project]
name = "your-project-name"
```

#### Step 4: Import to PostgreSQL

```bash
npx sqlew db:import migration-backup.json
```

---

### Post-Migration Verification

After any migration, verify your data:

#### 1. Check Row Counts

Use your database client to compare row counts:

```sql
-- Count decisions
SELECT COUNT(*) FROM v4_decisions;

-- Count tasks
SELECT COUNT(*) FROM v4_tasks;

-- Count file changes
SELECT COUNT(*) FROM v4_file_changes;
```

#### 2. Test MCP Server

```bash
# Start MCP server with new config
npx sqlew

# Or use MCP Inspector for interactive testing
npx @modelcontextprotocol/inspector npx sqlew
```

#### 3. Verify in Claude Code

Update your `.mcp.json` to use the new database:

```json
{
  "mcpServers": {
    "sqlew": {
      "command": "npx",
      "args": ["sqlew", "--config-path", "/path/to/.sqlew/config.toml"]
    }
  }
}
```

---

### Troubleshooting

#### Connection Refused

```
Error: connect ECONNREFUSED 127.0.0.1:3306
```

**Solution**: Ensure the database server is running and accepting connections on the specified port.

#### Authentication Failed

```
Error: Access denied for user 'sqlew_user'@'localhost'
```

**Solution**: Verify username and password in config.toml. Check that the user has proper privileges.

#### Database Does Not Exist

```
Error: Unknown database 'sqlew_db'
```

**Solution**: Create the database first (see Step 2 in migration guides above).

#### Permission Denied

```
Error: permission denied for schema public
```

**Solution**: Grant schema privileges to the user:
```sql
-- PostgreSQL
GRANT ALL ON SCHEMA public TO sqlew_user;
```

#### Import Skipped (Project Exists)

```
Project "my-project" already exists in target database
```

**Solution**: Use `--project-name` to specify a different name, or manually delete the existing project from the target database.

---

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

Always test imports with `dry-run=true` first:

```bash
npx sqlew db:import data.json dry-run=true
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

| Feature            | db:export (JSON)                     | db:dump (SQL)                         |
|--------------------|--------------------------------------|---------------------------------------|
| Format             | JSON data only                       | SQL DDL + data                        |
| Schema             | Not included                         | Full schema included                  |
| Use Case           | **Cross-DB migration**, sharing      | **Same-DB backup/restore**            |
| Cross-DB           | ✅ **Yes (ONLY option for cross-DB)** | ❌ No (v4.0.2+ same-DB only)           |
| Size               | Smaller (~40% reduction)             | Larger (includes schema)              |
| Import Speed       | Slower (ID remapping)                | Faster (direct SQL execution)         |
| Conflict Handling  | Smart deduplication                  | Overwrite or fail                     |
| Restore Capability | ❌ Skips if exists                    | ✅ Full restore                        |

**When to use db:export (JSON)** - **REQUIRED FOR CROSS-DATABASE**:

- ✅ **Cross-database migration** (SQLite → MySQL → PostgreSQL) - **ONLY option**
- ✅ Migrating projects between different sqlew databases
- ✅ Sharing specific projects with team members
- ✅ Merging multiple projects into one database

**When to use db:dump (SQL)** - **SAME-DATABASE ONLY**:

- ✅ **Full database backup with schema** (same DB type)
- ✅ **Database restore/recovery** (same DB type)
- ✅ Database replication (same DB type)
- ❌ Cross-database migration (use JSON instead)

See [Database Migration Guide](DATABASE_MIGRATION.md) for complete `db:dump` documentation.

## See Also

- [Database Migration](DATABASE_MIGRATION.md) - SQLite → MySQL/PostgreSQL migration
- [CHANGELOG.md](../../CHANGELOG.md#374) - v3.7.4 release notes
- [Architecture](../ARCHITECTURE.md) - Technical architecture overview
