# Database Authentication Configuration

This document describes the authentication configuration system for multi-database support in mcp-sqlew v4.0.0+.

## Overview

The configuration system supports multiple database backends with various authentication methods:

- **SQLite**: Local file-based database (default, no authentication)
- **PostgreSQL**: Remote PostgreSQL with direct authentication or IAM authentication (planned)
- **MySQL**: Remote MySQL with direct authentication or IAM authentication (planned)

**Note**: SSH tunneling is NOT supported by this software. Users must set up SSH tunnels manually using the `ssh` command and connect to localhost.

## Configuration Structure

All configuration is defined in `.sqlew/config.toml` under the `[database]` section.

### SQLite Configuration (Default)

The simplest configuration for local development:

```toml
[database]
path = ".sqlew/sqlew.db"
```

### PostgreSQL/MySQL Configuration

Remote databases require three main sections:

1. **Database Type**: Specifies the database system
2. **Connection**: Server address and database name
3. **Authentication**: Credentials and authentication method

## Configuration Sections

### 1. Database Type

```toml
[database]
type = "postgres"  # or "mysql" or "sqlite"
```

Valid values: `sqlite`, `postgres`, `mysql`

### 2. Connection Configuration

Required for PostgreSQL and MySQL:

```toml
[database.connection]
host = "localhost"          # Database server hostname or IP
port = 5432                 # PostgreSQL: 5432, MySQL: 3306
database = "sqlew"          # Database name
```

**Fields**:
- `host` (required): Database server hostname or IP address
- `port` (required): Database server port (1-65535)
- `database` (required): Target database name

### 3. Authentication Configuration

```toml
[database.auth]
type = "direct"             # Authentication method
user = "postgres"           # Database username
password = "your-password"  # Database password
```

**Fields**:
- `type` (required): Authentication method
  - `direct`: Standard username/password (or localhost connection through manual SSH tunnel)
  - `aws-iam`: AWS RDS IAM authentication (planned)
  - `gcp-iam`: GCP Cloud SQL IAM authentication (planned)
- `user` (optional): Database username
- `password` (optional): Database password

**Note**: For databases behind bastion hosts, users must set up SSH tunnels manually using the `ssh -L` command, then connect to localhost.

### 4. SSL/TLS Configuration (Optional)

For encrypted database connections:

```toml
[database.auth.ssl]
ca = "/path/to/ca-cert.pem"           # CA certificate
cert = "/path/to/client-cert.pem"     # Client certificate (mutual TLS)
key = "/path/to/client-key.pem"       # Client private key (mutual TLS)
rejectUnauthorized = true             # Reject self-signed certificates
```

**Fields**:
- `ca` (optional): Certificate Authority certificate (file path or content)
- `cert` (optional): Client certificate for mutual TLS (file path or content)
- `key` (optional): Client private key for mutual TLS (file path or content)
- `rejectUnauthorized` (optional): Whether to reject unauthorized certificates (default: `true`)

**Security Note**: Setting `rejectUnauthorized = false` is not recommended for production.

### 5. Manual SSH Tunnel Setup (For Databases Behind Bastion Hosts)

**SSH tunneling is NOT supported by this software.** Users must set up SSH tunnels manually before connecting.

**Manual Tunnel Setup:**

```bash
# Example: Connect to database behind bastion host
ssh -L 3307:db.internal.example.com:3306 user@bastion.example.com

# Then configure sqlew to connect to localhost:
```

```toml
[database]
type = "mysql"

[database.connection]
host = "localhost"      # Connect to tunnel endpoint
port = 3307             # Forwarded port (not 3306!)
database = "sqlew_db"

[database.auth]
type = "direct"
user = "mysql_user"
password = "db-password"
```

**SSH Tunnel Command Options:**
- `-L localport:remotehost:remoteport`: Port forwarding specification
- `-N`: Don't execute remote command (tunnel only)
- `-f`: Run in background
- `-o ServerAliveInterval=60`: Keep connection alive

**Example with background tunnel:**
```bash
ssh -f -N -L 3307:db.internal:3306 user@bastion.example.com
```

## Complete Examples

### Example 1: PostgreSQL with Direct Authentication

```toml
[database]
type = "postgres"

[database.connection]
host = "db.example.com"
port = 5432
database = "sqlew_production"

[database.auth]
type = "direct"
user = "postgres"
password = "secure-password"
```

### Example 2: PostgreSQL with SSL/TLS

```toml
[database]
type = "postgres"

[database.connection]
host = "db.example.com"
port = 5432
database = "sqlew_production"

[database.auth]
type = "direct"
user = "postgres"
password = "secure-password"

[database.auth.ssl]
ca = "/path/to/ca-cert.pem"
rejectUnauthorized = true
```

### Example 3: PostgreSQL via Manual SSH Tunnel

**Step 1**: Set up SSH tunnel manually:
```bash
ssh -L 5433:db.internal.example.com:5432 deploy@bastion.example.com
```

**Step 2**: Configure sqlew to use localhost:
```toml
[database]
type = "postgres"

[database.connection]
host = "localhost"       # Tunnel endpoint
port = 5433              # Forwarded port (not 5432!)
database = "sqlew_production"

[database.auth]
type = "direct"
user = "postgres"
password = "db-password"
```

### Example 4: MySQL via Manual SSH Tunnel with SSL

**Step 1**: Set up SSH tunnel manually:
```bash
ssh -f -N -L 53306:mysql.internal.example.com:3306 deploy@jump.example.com
```

**Step 2**: Configure sqlew with SSL:
```toml
[database]
type = "mysql"

[database.connection]
host = "localhost"       # Tunnel endpoint
port = 53306             # Forwarded port
database = "sqlew_db"

[database.auth]
type = "direct"
user = "mysql_user"
password = "db-password"

[database.auth.ssl]
ca = "/path/to/ca.pem"
rejectUnauthorized = true
```

### Example 5: MySQL with Inline SSL Certificate

```toml
[database]
type = "mysql"

[database.connection]
host = "db.example.com"
port = 3306
database = "sqlew_db"

[database.auth]
type = "direct"
user = "mysql_user"
password = "db-password"

[database.auth.ssl]
ca = """-----BEGIN CERTIFICATE-----
MIIEGzCCAwOgAwIBAgIQDKU...
...certificate content...
-----END CERTIFICATE-----"""
rejectUnauthorized = true
```

## Validation Rules

The configuration loader validates all settings and provides clear error messages:

### Database Type Validation
- Must be one of: `sqlite`, `postgres`, `mysql`

### Connection Validation
- Required for PostgreSQL and MySQL
- `host`: Must be specified
- `port`: Must be between 1 and 65535
- `database`: Must be specified

### Authentication Validation

**Direct Authentication**:
- `user`: Required
- `password`: Required

### SSL Validation
- `rejectUnauthorized`: Must be a boolean (if specified)

## Default Values

The configuration loader applies sensible defaults:

### SSL Defaults
- `rejectUnauthorized`: true

## Error Handling

### Configuration Parsing Errors

If the TOML file is malformed:

```
⚠️  Failed to load config file: .sqlew/config.toml
   Error: Unexpected character at line 5
   Using default configuration
```

### Validation Errors

If configuration is invalid:

```
⚠️  Configuration validation failed: .sqlew/config.toml
   - database.connection.host is required
   - database.auth.user is required for direct authentication
   Using default configuration
```

## Loading Configuration

The configuration is loaded automatically when the MCP server starts. You can also load it programmatically:

```typescript
import { loadConfigFile, validateDatabaseConfig } from './config/loader.js';

// Load and validate
const config = loadConfigFile('.sqlew/config.toml');
const validation = validateDatabaseConfig(config.database);

if (!validation.valid) {
  console.error('Invalid configuration:', validation.errors);
}
```

## Backward Compatibility

The new authentication system is fully backward compatible:

- Existing SQLite configurations continue to work
- The `path` field in `[database]` is still supported
- If no configuration is provided, SQLite with default path is used

## Security Best Practices

1. **Use Private Keys**: Prefer SSH private key authentication over passwords
2. **Enable SSL**: Use SSL/TLS for all production database connections
3. **Validate Certificates**: Keep `rejectUnauthorized = true` in production
4. **Secure Credentials**: Never commit config.toml with passwords to version control
5. **Restrict Permissions**: Set appropriate file permissions on private keys (chmod 600)
6. **Environment Variables**: Consider using environment variables for sensitive data (future enhancement)

## Troubleshooting

### Connection Failures

**PostgreSQL connection refused**:
- Check that PostgreSQL is running
- Verify host and port are correct
- Ensure firewall allows connections
- Check pg_hba.conf for authentication settings

**Manual SSH tunnel issues**:
- Run `ssh -v -L ...` for verbose debugging
- Check SSH key permissions (`chmod 600 ~/.ssh/id_rsa`)
- Verify bastion host is reachable
- Ensure SSH port (usually 22) is open
- Check if local port is already in use (`netstat -an | grep <port>`)

**SSL certificate errors**:
- Verify CA certificate path is correct
- Check certificate is not expired
- Ensure certificate chain is complete
- For development, temporarily set `rejectUnauthorized = false` (not for production)

### Configuration Validation

Use the test suite to validate your configuration:

```bash
npx tsc
node dist/tests/config-loader.test.js
```

## API Reference

### Functions

#### `loadConfigFile(configPath?: string): SqlewConfig`

Loads and parses configuration from TOML file.

**Parameters**:
- `configPath` (optional): Path to config file (default: `.sqlew/config.toml`)

**Returns**: Parsed and validated configuration

**Example**:
```typescript
const config = loadConfigFile('.sqlew/config.toml');
```

#### `validateDatabaseConfig(config: DatabaseConfig): { valid: boolean; errors: string[] }`

Validates database configuration.

**Parameters**:
- `config`: Database configuration object

**Returns**: Validation result with errors if any

**Example**:
```typescript
const validation = validateDatabaseConfig(config.database);
if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
}
```

#### `normalizeDatabaseConfig(config: DatabaseConfig): DatabaseConfig`

Normalizes database configuration by applying defaults.

**Parameters**:
- `config`: Partial database configuration

**Returns**: Complete database configuration with defaults

**Example**:
```typescript
const normalized = normalizeDatabaseConfig({
  type: 'postgres',
  connection: { host: 'localhost', port: 5432, database: 'test' },
  auth: {
    type: 'direct',
    user: 'postgres',
    password: 'pass',
    ssl: { ca: '/path/to/ca.pem' }
  }
});
// normalized.auth.ssl.rejectUnauthorized === true (default applied)
```

## Future Enhancements

Planned authentication methods:

- **AWS RDS IAM Authentication**: Token-based authentication for AWS RDS
- **GCP Cloud SQL IAM Authentication**: Token-based authentication for GCP Cloud SQL
- **Environment Variable Substitution**: Reference environment variables in config
- **Credential Encryption**: Encrypt sensitive fields in config file

## Related Documentation

- [Configuration Guide](./CONFIGURATION.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [Type Definitions](../src/config/types.ts)
