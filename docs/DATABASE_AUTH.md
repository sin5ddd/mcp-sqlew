# Database Authentication Configuration

This document describes the authentication configuration for multi-database support in sqlew v4.0.0+.

## Supported Authentication

| Method | Status | Description |
|--------|--------|-------------|
| **Direct (Password)** | ✅ Supported | Standard username/password authentication |
| **SSH Tunnel** | ✅ Manual | User-managed SSH port forwarding |
| SSL/TLS Certificates | 🔮 Planned | Client certificate authentication |
| AWS RDS IAM | 🔮 Planned | Token-based authentication for AWS RDS |
| GCP Cloud SQL IAM | 🔮 Planned | Token-based authentication for GCP Cloud SQL |

## Configuration Structure

All configuration is defined in `.sqlew/config.toml`.

### SQLite (Default)

```toml
[database]
path = ".sqlew/sqlew.db"
```

### PostgreSQL

```toml
[database]
type = "postgres"

[database.connection]
host = "localhost"
port = 5432
database = "sqlew_db"

[database.auth]
type = "direct"
user = "postgres"
password = "your-password"
```

### MySQL/MariaDB

```toml
[database]
type = "mysql"

[database.connection]
host = "localhost"
port = 3306
database = "sqlew_db"

[database.auth]
type = "direct"
user = "mysql_user"
password = "your-password"
```

## SSH Tunnel (Manual Setup)

**SSH tunneling is NOT built into sqlew.** Set up tunnels manually before connecting.

```bash
# Example: Forward local port 5433 to remote database
ssh -L 5433:db.internal.example.com:5432 user@bastion.example.com
```

Then configure sqlew to connect to localhost:

```toml
[database]
type = "postgres"

[database.connection]
host = "localhost"    # Tunnel endpoint
port = 5433           # Forwarded port
database = "sqlew_db"

[database.auth]
type = "direct"
user = "postgres"
password = "db-password"
```

**Useful SSH options:**
- `-N`: Don't execute remote command (tunnel only)
- `-f`: Run in background
- `-o ServerAliveInterval=60`: Keep connection alive

## Validation Rules

### Connection
- `host`: Required for PostgreSQL/MySQL
- `port`: 1-65535
- `database`: Required for PostgreSQL/MySQL

### Authentication
- `type`: Must be `direct`
- `user`: Required
- `password`: Required

## Error Handling

```
⚠️  Configuration validation failed: .sqlew/config.toml
   - database.connection.host is required
   - database.auth.user is required for direct authentication
   Using default configuration
```

## Security Best Practices

1. **Never commit passwords** - Don't commit config.toml with passwords to git
2. **Use SSH tunnels** - For databases behind firewalls
3. **Restrict access** - Limit database user permissions

---

## Future Authentication Methods

> **Status**: Planned for future releases. If you need these features, please [open an issue](https://github.com/sin5ddd/mcp-sqlew/issues) - we'll prioritize based on demand!

### SSL/TLS Client Certificates

```toml
# PLANNED - Not yet implemented
[database.auth.ssl]
ca = "/path/to/ca-cert.pem"
cert = "/path/to/client-cert.pem"
key = "/path/to/client-key.pem"
rejectUnauthorized = true
```

### AWS RDS IAM Authentication

```toml
# PLANNED - Not yet implemented
[database.auth]
type = "aws-iam"
region = "us-east-1"
```

### GCP Cloud SQL IAM Authentication

```toml
# PLANNED - Not yet implemented
[database.auth]
type = "gcp-iam"
project = "my-project"
```

---

## Related Documentation

- [Configuration Guide](./CONFIGURATION.md)
- [Cross Database Guide](./CROSS_DATABASE.md)
