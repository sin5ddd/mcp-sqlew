# Database Migration Guide

This guide explains how to generate complete SQL dumps from your mcp-sqlew database for use with SQLite, MySQL/MariaDB, or PostgreSQL.

## Overview

The `db:dump` CLI tool generates complete SQL dumps (CREATE TABLE + INSERT statements) compatible with SQLite, MySQL/MariaDB, and PostgreSQL formats. The generated SQL can be imported directly into an empty database without additional setup.

## Usage

### Basic Syntax

```bash
npx sqlew db:dump [--from <source>] --format <target> [options]
```

**Parameters:**
- `--from <source>`: Source database (sqlite, mysql, postgresql). Default: sqlite
- `--format <target>`: Target SQL format (sqlite, mysql, postgresql). **Required**
- `--output <file>`: Output file path (omit for stdout)
- `--tables <list>`: Comma-separated list of specific tables to dump
- `--chunk-size <n>`: Rows per INSERT statement (default: 100)
- `--on-conflict <mode>`: Duplicate key handling (error, ignore, replace). Default: error
- `--exclude-schema`: Exclude CREATE TABLE statements (data-only dump)
- `--db-path <path>`: SQLite database path (default: .sqlew/sqlew.db)

**Note:** By default, the dump includes both schema (CREATE TABLE) and data (INSERT) for complete migration.

### Generate SQL Dumps

**From SQLite (default):**
```bash
npx sqlew db:dump --format mysql --output dump-mysql.sql
npx sqlew db:dump --format postgresql --output dump-pg.sql
```

**From MySQL:**
```bash
# Configure connection via environment variables
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_USER=youruser
export MYSQL_PASSWORD=yourpass
export MYSQL_DATABASE=mcp_context

npx sqlew db:dump --from mysql --format sqlite --output dump-sqlite.sql
npx sqlew db:dump --from mysql --format postgresql --output dump-pg.sql
```

**From PostgreSQL:**
```bash
# Configure connection via environment variables
export PG_HOST=localhost
export PG_PORT=5432
export PG_USER=postgres
export PG_PASSWORD=yourpass
export PG_DATABASE=mcp_context

npx sqlew db:dump --from postgresql --format sqlite --output dump-sqlite.sql
npx sqlew db:dump --from postgresql --format mysql --output dump-mysql.sql
```

### Selective Table Export

Export only specific tables:

```bash
npx sqlew db:dump --format mysql --tables t_decisions,t_tasks,m_agents --output partial.sql
```

### Custom Chunk Size

For large tables, adjust INSERT batch size:

```bash
npx sqlew db:dump --format mysql --chunk-size 500 --output dump.sql
```

### Data-Only Dumps

For advanced use cases where you manage schema separately:

```bash
npx sqlew db:dump --format mysql --exclude-schema --output data-only.sql
```

This generates INSERT statements without CREATE TABLE, useful for:
- Importing into databases with existing schema
- Backup/restore of data only
- Data transfer between identical schemas

### Conflict Resolution

Handle duplicate keys when importing into existing databases:

```bash
# Ignore duplicates (safe for adding new data)
npx sqlew db:dump --format mysql --on-conflict ignore --output dump.sql

# Update existing rows (sync/overwrite mode)
npx sqlew db:dump --format mysql --on-conflict replace --output dump.sql

# Fail on duplicates (default, strict mode)
npx sqlew db:dump --format mysql --on-conflict error --output dump.sql
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

## Supported Migration Paths

The `db:dump` tool supports **all 6 migration paths** between SQLite, MySQL/MariaDB, and PostgreSQL:

| Source | Target | Command |
|--------|--------|---------|
| SQLite | MySQL | `--format mysql` |
| SQLite | PostgreSQL | `--format postgresql` |
| MySQL | SQLite | `--from mysql --format sqlite` |
| PostgreSQL | SQLite | `--from postgresql --format sqlite` |
| MySQL | PostgreSQL | `--from mysql --format postgresql` |
| PostgreSQL | MySQL | `--from postgresql --format mysql` |

---

## Data Type Mappings

The tool automatically handles database-specific data type conversions:

### Boolean Values

| SQLite | MySQL | PostgreSQL |
|--------|-------|------------|
| 0/1 | 0/1 (TINYINT) | FALSE/TRUE |

### Binary Data

| SQLite | MySQL | PostgreSQL |
|--------|-------|------------|
| BLOB (hex) | X'hex' (BLOB) | '\xhex'::bytea |

### Identifiers

| SQLite | MySQL | PostgreSQL |
|--------|-------|------------|
| "table" | \`table\` | "table" |

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

If the import fails at any point, all changes are automatically rolled back, leaving the database in its original state. This prevents partial imports that would leave the database in an inconsistent state.

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
- GitHub Issues: https://github.com/sin5ddd/mcp-sqlew/issues
- Documentation: `/docs` directory in repository
