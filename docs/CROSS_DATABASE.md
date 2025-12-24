# Cross-Database Compatibility

sqlew supports multiple database backends with unified query behavior.

## Supported Databases

| Database | Version | Status |
|----------|---------|--------|
| SQLite | 3.x | Primary (default) |
| MySQL | 8.0+ | Supported |
| MariaDB | 10.5+ | Supported |
| PostgreSQL | 12+ | Supported |

## Configuration

### SQLite (Default)

```toml
[database]
type = "sqlite"
path = ".sqlew/sqlew.db"
```

### MySQL / MariaDB

```toml
[database]
type = "mysql"  # or "mariadb"

[database.connection]
host = "localhost"
port = 3306
database = "sqlew"

[database.auth]
type = "direct"
user = "sqlew_user"
password = "your_password"
```

### PostgreSQL

```toml
[database]
type = "postgres"

[database.connection]
host = "localhost"
port = 5432
database = "sqlew"

[database.auth]
type = "direct"
user = "sqlew_user"
password = "your_password"
```

## Database-Specific Differences

### String Aggregation

| Database | Function |
|----------|----------|
| SQLite | `GROUP_CONCAT(column)` |
| MySQL | `GROUP_CONCAT(column)` |
| MariaDB | `GROUP_CONCAT(column)` |
| PostgreSQL | `string_agg(column, ',')` |

sqlew automatically detects the database type and uses the appropriate function.

### GROUP BY Strictness

PostgreSQL enforces strict GROUP BY rules:
- All non-aggregated SELECT columns must appear in GROUP BY
- MySQL/MariaDB/SQLite are more lenient

sqlew includes all necessary columns in GROUP BY for cross-database compatibility.

### Example Query Difference

**MySQL/SQLite:**
```sql
SELECT d.key_id, ck.key_name, GROUP_CONCAT(t.name) as tags
FROM v4_decisions d
JOIN v4_context_keys ck ON d.key_id = ck.id
GROUP BY d.key_id
```

**PostgreSQL:**
```sql
SELECT d.key_id, ck.key_name, string_agg(t.name, ',') as tags
FROM v4_decisions d
JOIN v4_context_keys ck ON d.key_id = ck.id
GROUP BY d.key_id, ck.key_name
```

## Data Migration

### Cross-Database Migration

Use JSON export/import for migrating between database types:

```bash
# Export from source database
sqlew db:export backup.json

# Import to target database (after changing config)
sqlew db:import backup.json
```

**Note:** SQL dump (`db:dump`) is for same-database-type operations only.

### Export Options

```bash
# Export all data
sqlew db:export full-backup.json

# Export with version tracking
sqlew db:export --version 4.1.0 backup.json
```

## Adapter Implementation

Database adapters are located in `src/adapters/`:

| File | Purpose |
|------|---------|
| `sqlite-adapter.ts` | SQLite (better-sqlite3) |
| `mysql-adapter.ts` | MySQL/MariaDB (mysql2) |
| `postgresql-adapter.ts` | PostgreSQL (pg) |

Each adapter implements the `DatabaseAdapter` interface with database-specific:
- Connection handling
- Transaction management
- String aggregation
- Type conversions

## Testing Cross-Database Compatibility

```bash
# Run tests on all configured databases
npm run test:cross-db

# Run tests on specific database
DB_TYPE=postgres npm test
```

## Version History

- **v4.1.0**: PostgreSQL compatibility fixes (string_agg, GROUP BY)
- **v4.0.2**: JSON-only cross-database migration
- **v3.7.0**: Multi-database adapter architecture
