# sqlew CLI Mode

> Command-line tools for database migration and project data export/import

## Overview

sqlew provides CLI commands for advanced database operations that complement the main MCP server functionality. These
commands are useful for database administration, backup/restore, and cross-project data migration.

## What is CLI Mode?

While the primary use of sqlew is as an **MCP server** (integrated with Claude Code via `.mcp.json`), it also provides
standalone **CLI commands** for:

- **Database Migration** - Generate SQL dumps for SQLite, MySQL, PostgresSQL migration
- **Project Export/Import** - Share project data across databases or team members
- **Backup/Restore** - Create SQL backups with schema and data

## MCP Server vs CLI Mode

| Feature         | MCP Server (`npx sqlew`)               | CLI Mode                                     |
|-----------------|----------------------------------------|----------------------------------------------|
| **Primary Use** | AI agent context management            | Database administration                      |
| **Setup**       | `.mcp.json` configuration              | Per-project npm install                      |
| **Commands**    | MCP tools (decision, task, file, etc.) | CLI commands (db:dump, db:export, db:import) |
| **When to Use** | Daily AI development workflow          | Database migration, backup, data sharing     |

## Installation

### Install sqlew in Your Project

```bash
cd /path/to/your/project
npm install sqlew
```

### Add npm Script Shortcut (Recommended)

Add to your `package.json`:

```json
{
  "scripts": {
    "sqlew": "node node_modules/sqlew/dist/cli.js"
  }
}
```

Then you can use shorter commands:

```bash
npm run sqlew db:dump --format=mysql --output=backup.sql
```

### Direct Command (Without Shortcut)

```bash
node node_modules/sqlew/dist/cli.js db:dump --format=mysql --output=backup.sql
```

## Available Commands

### 1. `db:dump` - SQL Database Migration

Generate complete SQL dumps (schema + data) for database migration or backup.

**Use Cases**:

- Full database backup with schema
- Cross-database migration (SQLite → MySQL/PostgresSQL)
- Development → Production deployment

**Quick Example**:

```bash
# Backup SQLite to MySQL dump
node node_modules/sqlew/dist/cli.js db:dump --format=mysql --output=backup.sql

# Backup to PostgresSQL dump
node node_modules/sqlew/dist/cli.js db:dump --format=postgresql --output=backup.sql
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
node node_modules/sqlew/dist/cli.js db:export --project=my-project --output=project.json

# Export all projects
node node_modules/sqlew/dist/cli.js db:export --output=all-projects.json
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
node node_modules/sqlew/dist/cli.js db:import --source=project.json

# Import with custom name
node node_modules/sqlew/dist/cli.js db:import --source=project.json --project-name=new-name

# Dry-run validation
node node_modules/sqlew/dist/cli.js db:import --source=project.json --dry-run
```

**📖 Full Documentation**: [DATA_EXPORT_IMPORT.md](DATA_EXPORT_IMPORT.md#import-command)

---

## Quick Comparison: When to Use Which Command

| Scenario                                      | Use Command               | Restore Capability         |
|-----------------------------------------------|---------------------------|----------------------------|
| **Full database backup**                      | `db:dump`                 | ✅ Full restore             |
| **Cross-database migration** (SQLite → MySQL) | `db:dump`                 | ✅ Full restore             |
| **Share project with team**                   | `db:export` / `db:import` | ⚠️ Skips if project exists |
| **Consolidate multiple projects**             | `db:export` / `db:import` | ⚠️ Skips if project exists |
| **Backup/restore same database**              | `db:dump`                 | ✅ Full restore             |

**⚠️ Important**: `db:export`/`db:import` uses `--skip-if-exists=true` by default, so it's NOT suitable for
backup/restore to the same database. Use `db:dump` for proper backup/restore.

## Common Workflows

### Workflow 1: Full Database Backup

```bash
# Create SQL backup with schema + data
node node_modules/sqlew/dist/cli.js db:dump --format=sqlite --output=backup-$(date +%Y%m%d).sql

# Or simple SQLite file copy
cp .sqlew/sqlew.db .sqlew/backup-$(date +%Y%m%d).db
```

### Workflow 2: Share the Project with a Team Member

```bash
# Developer A: Export project
node node_modules/sqlew/dist/cli.js db:export --project=feature-x --output=feature-x.json

# Developer B: Import project (in their own database)
node node_modules/sqlew/dist/cli.js db:import --source=feature-x.json
```

### Workflow 3: Migrate to MySQL from SQLite

```bash
# Step 1: Generate MySQL dump
node node_modules/sqlew/dist/cli.js db:dump --format=mysql --output=migrate-to-mysql.sql

# Step 2: Create MySQL database
mysql -e "CREATE DATABASE sqlew_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Step 3: Import dump
mysql sqlew_db < migrate-to-mysql.sql
```

### Workflow 4: Consolidate Multiple Projects (Permission-Constrained)

```bash
# Export from each project
cd ~/project-a && node node_modules/sqlew/dist/cli.js db:export --project=project-a --output=/tmp/a.json
cd ~/project-b && node node_modules/sqlew/dist/cli.js db:export --project=project-b --output=/tmp/b.json

# Import all to shared database
cd ~/shared-db
node node_modules/sqlew/dist/cli.js db:import --source=/tmp/a.json
node node_modules/sqlew/dist/cli.js db:import --source=/tmp/b.json
```

## Getting Help

Show command-specific help:

```bash
node node_modules/sqlew/dist/cli.js db:dump --help
node node_modules/sqlew/dist/cli.js db:export --help
node node_modules/sqlew/dist/cli.js db:import --help
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
- [Architecture](../ARCHITECTURE.md) - Technical architecture overview
