# sqlew CLI Mode

> Command-line tools for database migration and project data export/import

## Overview

sqlew provides CLI commands for advanced database operations that complement the main MCP server functionality. These
commands are useful for database administration, backup/restore, and cross-project data migration.

> **⚠️ Important**: Database CLI commands must be run via `npm run` from the project directory.
> `npx` is not supported for database operations.

## What is CLI Mode?

While the primary use of sqlew is as an **MCP server** (integrated with Claude Code via `.mcp.json`), it also provides
standalone **CLI commands** for:

- **Database Migration** - Generate SQL dumps for SQLite, MySQL, PostgreSQL migration
- **Project Export/Import** - Share project data across databases or team members
- **Backup/Restore** - Create SQL backups with schema and data

## MCP Server vs CLI Mode

| Feature         | MCP Server (via `.mcp.json`)           | CLI Mode                                     |
|-----------------|----------------------------------------|----------------------------------------------|
| **Primary Use** | AI agent context management            | Database administration                      |
| **Setup**       | `.mcp.json` configuration              | Per-project npm install                      |
| **Commands**    | MCP tools (decision, task, file, etc.) | CLI commands (db:dump, db:export, db:import) |
| **When to Use** | Daily AI development workflow          | Database migration, backup, data sharing     |

## Usage

### Within mcp-sqlew Project (Development)

Use npm scripts with `--` to pass arguments:

```bash
# Generate MySQL dump
npm run db:dump -- mysql backup.sql

# Export project to JSON
npm run db:export -- data.json project=myproject

# Import from JSON
npm run db:import -- data.json
```

### In Projects with sqlew as Dependency

Add to your `package.json`:

```json
{
  "scripts": {
    "db:dump": "node node_modules/sqlew/dist/cli.js db:dump",
    "db:export": "node node_modules/sqlew/dist/cli.js db:export",
    "db:import": "node node_modules/sqlew/dist/cli.js db:import"
  }
}
```

Then use:

```bash
npm run db:dump -- mysql backup.sql
```

## Available Commands

### 1. `db:dump` - SQL Database Migration

Generate complete SQL dumps (schema + data) for database migration or backup.

**Use Cases**:

- Full database backup with schema
- Cross-database migration (SQLite → MySQL/PostgreSQL)
- Development → Production deployment

**Quick Example**:

```bash
# Generate MySQL dump (positional format argument)
npm run db:dump -- mysql backup.sql

# Generate PostgreSQL dump
npm run db:dump -- postgresql backup.sql

# MySQL from PostgreSQL source
npm run db:dump -- mysql backup.sql from=postgresql
```

**📖 Full Documentation**: [DATABASE_MIGRATION.md](DATABASE_MIGRATION.md)

---

### 2. `db:export` - Project Data Export

Export project data to JSON format for sharing or multi-project consolidation.

**Use Cases**:

- Share context with team members
- Move projects between different databases
- Consolidate multiple projects into one database

**Quick Example**:

```bash
# Export specific project
npm run db:export -- project.json project=my-project

# Export all projects
npm run db:export -- all-projects.json
```

**📖 Full Documentation**: [DATA_EXPORT_IMPORT.md](DATA_EXPORT_IMPORT.md#export-command)

---

### 3. `db:import` - Project Data Import

Import project data from JSON export files.

**Use Cases**:

- Import shared project context
- Merge multiple projects into one database
- Migrate projects to a new database (different machine or DB type)

**Quick Example**:

```bash
# Import from JSON export
npm run db:import -- project.json

# Import with custom name
npm run db:import -- project.json project-name=new-name

# Dry-run validation
npm run db:import -- project.json dry-run=true
```

**📖 Full Documentation**: [DATA_EXPORT_IMPORT.md](DATA_EXPORT_IMPORT.md#import-command)

---

## Recommended Data Migration Workflow

### Cross-Database Migration (Recommended: JSON)

For migrations between different database systems (e.g., SQLite to MySQL, PostgreSQL to MySQL), **use JSON format**:

```bash
# Step 1: Export from source database
npm run db:export -- backup.json

# Step 2: Configure target database connection
# (Update your .sqlew/config.toml or environment variables)

# Step 3: Import to target database
npm run db:import -- backup.json
```

**Why JSON for cross-database migration?**
- Database-agnostic format - no SQL syntax differences
- Automatic ID remapping handles foreign key relationships
- Preserves all data integrity across different RDBMS

### SQL Dump (Same-RDBMS Only)

SQL dump (`db:dump`) is designed for **same-database-type operations only**:

```bash
# SQLite backup (restore to SQLite)
npm run db:dump -- sqlite backup.sql

# MySQL backup (restore to MySQL)
npm run db:dump -- mysql backup.sql

# PostgreSQL backup (restore to PostgreSQL)
npm run db:dump -- postgresql backup.sql
```

**Note**: SQL dump does NOT support cross-database migrations (e.g., SQLite to MySQL). The generated SQL contains database-specific syntax that may not be compatible with other RDBMS.

---

## Quick Comparison: When to Use Which Command

| Scenario                                      | Use Command               | Restore Capability         |
|-----------------------------------------------|---------------------------|----------------------------|
| **Full database backup (same RDBMS)**         | `db:dump`                 | Full restore               |
| **Cross-database migration** (SQLite -> MySQL)| `db:export` / `db:import` | Full restore via JSON      |
| **Share project with team**                   | `db:export` / `db:import` | Skips if project exists    |
| **Consolidate multiple projects**             | `db:export` / `db:import` | Skips if project exists    |
| **Backup/restore same database**              | `db:dump`                 | Full restore               |

**⚠️ Important**: `db:export`/`db:import` uses `--skip-if-exists=true` by default, so it's NOT suitable for
backup/restore to the same database. Use `db:dump` for proper backup/restore.

## Common Workflows

### Workflow 1: Full Database Backup

```bash
# Create SQL backup with schema + data
npm run db:dump -- sqlite backup-$(date +%Y%m%d).sql

# Or simple SQLite file copy
cp .sqlew/sqlew.db .sqlew/backup-$(date +%Y%m%d).db
```

### Workflow 2: Share the Project with a Team Member

```bash
# Developer A: Export project
npm run db:export -- feature-x.json project=feature-x

# Developer B: Import project (in their own database)
npm run db:import -- feature-x.json
```

### Workflow 3: Migrate to MySQL from SQLite

```bash
# Step 1: Generate MySQL dump
npm run db:dump -- mysql migrate-to-mysql.sql

# Step 2: Create MySQL database
mysql -e "CREATE DATABASE sqlew_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Step 3: Import dump
mysql -u user -p sqlew_db < migrate-to-mysql.sql
```

### Workflow 4: Consolidate Multiple Projects

```bash
# Export from each project
npm run db:export -- /tmp/a.json project=project-a
npm run db:export -- /tmp/b.json project=project-b

# Import all to shared database
npm run db:import -- /tmp/a.json
npm run db:import -- /tmp/b.json
```

## Getting Help

Show command-specific help:

```bash
npm run db:dump -- --help
npm run db:export -- --help
npm run db:import -- --help
```

## Detailed Documentation

- **[DATABASE_MIGRATION.md](DATABASE_MIGRATION.md)** - Complete `db:dump` reference
    - SQL dump generation for all database types
    - Data type mappings
    - Transaction safety
    - Conflict resolution

- **[DATA_EXPORT_IMPORT.md](DATA_EXPORT_IMPORT.md)** - Complete `db:export`/`db:import` reference
    - JSON export/import system
    - ID remapping strategy
    - Multi-project consolidation
    - Use cases and examples

## See Also

- [Main README](../../README.md) - MCP server setup and usage
- [Configuration Guide](../CONFIGURATION.md) - Database configuration options
