# Database Migration Guide

This guide explains how to generate complete SQL dumps from your mcp-sqlew database for backup and restore operations.

## ⚠️ BREAKING CHANGE (v4.0.2)

**SQL dump no longer supports cross-database format conversion.**

Starting from v4.0.2, `db:dump` generates SQL for the **same database type only**:
- SQLite → SQLite ✅
- MySQL → MySQL ✅
- PostgreSQL → PostgreSQL ✅
- SQLite → MySQL ❌ (use JSON instead)
- SQLite → PostgreSQL ❌ (use JSON instead)

**For cross-database migrations**, use JSON export/import:
```bash
npx sqlew db:export backup.json      # Export to JSON
npx sqlew db:import backup.json      # Import to target database
```

See [DATA_EXPORT_IMPORT.md](DATA_EXPORT_IMPORT.md) for complete cross-database migration guide.

---

## Overview

The `db:dump` CLI tool generates complete SQL dumps (CREATE TABLE + INSERT statements) for **same-database-type backup and restore operations**. The generated SQL can be imported directly into an empty database of the same type.

## Usage

**No installation required!** Use directly via npx:

```bash
npx sqlew db:dump <format> [output-file] [key=value ...]
```

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `<format>` | Target SQL format: sqlite, mysql, postgresql | **Required** |
| `[output-file]` | Output file path | stdout |
| `from=<source>` | Source database type | sqlite |
| `tables=<list>` | Comma-separated table names | all tables |
| `chunk-size=<n>` | Rows per INSERT statement | 100 |
| `on-conflict=<mode>` | error, ignore, replace | error |
| `exclude-schema=true` | Data-only dump (no CREATE TABLE) | false |
| `db-path=<path>` | SQLite database path | .sqlew/sqlew.db |

**Note:** By default, the dump includes both schema (CREATE TABLE) and data (INSERT) for complete migration.

### Generate SQL Dumps (Same-Database Backup)

**SQLite Backup:**

```bash
# Backup SQLite database (default)
npx sqlew db:dump sqlite backup-sqlite.sql
```

**MySQL Backup:**

```bash
# Configure connection via .sqlew/config.toml or environment variables
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_USER=youruser
export MYSQL_PASSWORD=yourpass
export MYSQL_DATABASE=mcp_context

# Backup MySQL database
npx sqlew db:dump mysql backup-mysql.sql from=mysql
```

**PostgreSQL Backup:**

```bash
# Configure connection via .sqlew/config.toml or environment variables
export PG_HOST=localhost
export PG_PORT=5432
export PG_USER=postgres
export PG_PASSWORD=yourpass
export PG_DATABASE=mcp_context

# Backup PostgreSQL database
npx sqlew db:dump postgresql backup-pg.sql from=postgresql
```

> **Note**: For cross-database migrations (e.g., SQLite → MySQL), use JSON export/import instead.
> See [DATA_EXPORT_IMPORT.md](DATA_EXPORT_IMPORT.md) for the complete guide.

### Selective Table Export

Export only specific tables:

```bash
npx sqlew db:dump mysql partial.sql tables=v4_decisions,v4_tasks,v4_files
```

### Custom Chunk Size

For large tables, adjust INSERT batch size:

```bash
npx sqlew db:dump mysql dump.sql chunk-size=500
```

### Data-Only Dumps

For advanced use cases where you manage schema separately:

```bash
npx sqlew db:dump mysql data-only.sql exclude-schema=true
```

This generates INSERT statements without CREATE TABLE, useful for:

- Importing into databases with existing schema
- Backup/restore of data only
- Data transfer between identical schemas

### Conflict Resolution

Handle duplicate keys when importing into existing databases:

```bash
# Ignore duplicates (safe for adding new data)
npx sqlew db:dump mysql dump.sql on-conflict=ignore

# Update existing rows (sync/overwrite mode)
npx sqlew db:dump mysql dump.sql on-conflict=replace

# Fail on duplicates (default, strict mode)
npx sqlew db:dump mysql dump.sql on-conflict=error
```

**Modes:**

- `error` (default): Standard INSERT, fails if duplicate keys exist
- `ignore`: Skip duplicate rows (INSERT IGNORE / ON CONFLICT DO NOTHING)
- `replace`: Update existing rows with new values (ON DUPLICATE KEY UPDATE / ON CONFLICT DO UPDATE)

**Use cases:**

- `ignore`: Importing into a database that may already have some data
- `replace`: Synchronizing data from one database to another
- `error`: Fresh database migration where duplicates indicate a problem

---

## Supported Operations (v4.0.2+)

The `db:dump` tool supports **same-database-type backup and restore** only:

| Source     | Target     | Command                                      | Supported |
|------------|------------|----------------------------------------------|-----------|
| SQLite     | SQLite     | `--format sqlite`                            | ✅         |
| MySQL      | MySQL      | `--from mysql --format mysql`                | ✅         |
| PostgreSQL | PostgreSQL | `--from postgresql --format postgresql`      | ✅         |
| SQLite     | MySQL      | N/A - Use JSON export/import                 | ❌         |
| SQLite     | PostgreSQL | N/A - Use JSON export/import                 | ❌         |
| MySQL      | PostgreSQL | N/A - Use JSON export/import                 | ❌         |

**For cross-database migrations**, see [DATA_EXPORT_IMPORT.md](DATA_EXPORT_IMPORT.md).

---

## Data Type Mappings

The tool automatically handles database-specific data type conversions:

### Boolean Values

| SQLite | MySQL         | PostgreSQL |
|--------|---------------|------------|
| 0/1    | 0/1 (TINYINT) | FALSE/TRUE |

### Binary Data

| SQLite     | MySQL         | PostgreSQL     |
|------------|---------------|----------------|
| BLOB (hex) | X'hex' (BLOB) | '\xhex'::bytea |

### Identifiers

| SQLite  | MySQL     | PostgreSQL |
|---------|-----------|------------|
| "table" | \`table\` | "table"    |

### Text and Numeric Types

All databases handle TEXT, VARCHAR, INTEGER, and REAL types consistently. The tool preserves:

- Unix epoch timestamps (stored as INTEGER)
- UTF-8 text encoding
- NULL values

---

## Importing Generated SQL

The generated SQL is complete and self-contained. Import it directly into an **empty database**:

**SQLite:**

```bash
sqlite3 your-database.db < dump-sqlite.sql
```

**MySQL/MariaDB:**

```bash
# Create empty database first
mysql -e "CREATE DATABASE mydb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
# Import dump
mysql mydb < dump-mysql.sql
```

**PostgreSQL:**

```bash
# Create empty database first
createdb mydb
# Import dump
psql -d mydb -f dump-pg.sql
```

**For existing databases with data:**
Use `--on-conflict ignore` or `--on-conflict replace` when generating the dump (see Conflict Resolution section above).

## Transaction Safety

All generated SQL dumps are wrapped in database transactions:

- **MySQL/MariaDB**: `START TRANSACTION;` ... `COMMIT;`
- **PostgreSQL**: `BEGIN;` ... `COMMIT;`
- **SQLite**: `BEGIN TRANSACTION;` ... `COMMIT;`

If the import fails at any point, all changes are automatically rolled back, leaving the database in its original state.
This prevents partial imports that would leave the database in an inconsistent state.

**Benefits:**

- Atomic imports: Either all data is imported successfully or nothing is changed
- Safe to retry: Failed imports don't leave partial data that needs cleanup
- Consistent state: Database is never left in an intermediate state

---

## Environment Variables

### MySQL Configuration

```bash
MYSQL_HOST=127.0.0.1        # Default: 127.0.0.1
MYSQL_PORT=3306             # Default: 3306
MYSQL_USER=root             # Default: root
MYSQL_PASSWORD=             # Default: empty
MYSQL_DATABASE=mcp_context  # Default: mcp_context
```

### PostgreSQL Configuration

```bash
PG_HOST=localhost           # Default: localhost
PG_PORT=5432                # Default: 5432
PG_USER=postgres            # Default: postgres
PG_PASSWORD=                # Default: empty
PG_DATABASE=mcp_context     # Default: mcp_context
```

---

## Best Practices

1. **Test on a copy** - Always test migrations on a database copy first
2. **Create schema first** - Run Knex migrations before importing data
3. **Review SQL before import** - Inspect generated SQL file for correctness
4. **Verify row counts** - Compare source and target table row counts after import
5. **Backup original data** - Keep backups before performing migrations

---

## Support

For issues or questions:

- GitHub Issues: https://github.com/sqlew-io/sqlew/issues
- Documentation: `/docs` directory in repository
