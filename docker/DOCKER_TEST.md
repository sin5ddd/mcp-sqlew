# Docker Testing Guide

Quick guide for testing MySQL and PostgreSQL adapters with Docker.

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ installed
- Project built (`npm run build`)

## MySQL Testing

### 1. Start MySQL Container

```bash
docker-compose up -d mysql
```

Wait for health check (about 30 seconds):
```bash
docker-compose ps mysql
```

### 2. Test Connection

```bash
# Test with MySQL client
docker exec -it mcp-sqlew-mysql-test mysql -u mcp_user -pmcp_pass mcp_test

# Inside MySQL shell, run:
# SHOW DATABASES;
# EXIT;
```

### 3. Run MCP Server with MySQL

Set config path and run:
```bash
export MCP_SQLEW_CONFIG_PATH=.sqlew/config.mysql-test.toml
node dist/index.js
```

Or with MCP Inspector:
```bash
export MCP_SQLEW_CONFIG_PATH=.sqlew/config.mysql-test.toml
npx @modelcontextprotocol/inspector node dist/index.js
```

### 4. Test with CLI

```bash
# Set config and test tools
export MCP_SQLEW_CONFIG_PATH=.sqlew/config.mysql-test.toml

# Run server and use MCP Inspector to:
# - Call decision.set to create a decision
# - Call task.create to create tasks
# - Call stats.db_stats to verify database operations
```

### 5. Verify MySQL Data

```bash
# Connect to MySQL
docker exec -it mcp-sqlew-mysql-test mysql -u mcp_user -pmcp_pass mcp_test

# Check tables
SHOW TABLES;

# Check migrations
SELECT * FROM knex_migrations ORDER BY id DESC LIMIT 5;

# Check decisions
SELECT * FROM t_decisions LIMIT 5;

# Check tasks
SELECT * FROM t_tasks;

EXIT;
```

### 6. Stop Container

```bash
# Stop without removing data
docker-compose stop mysql

# Stop and remove data
docker-compose down -v
```

## PostgreSQL Testing (Future)

```bash
docker-compose up -d postgres
# Similar steps as MySQL
```

## Test Credentials

**MySQL:**
- Host: localhost
- Port: 3306
- Database: mcp_test
- User: mcp_user
- Password: mcp_pass
- Root password: rootpass

**PostgreSQL:**
- Host: localhost
- Port: 5432
- Database: mcp_test
- User: mcp_user
- Password: mcp_pass

## Troubleshooting

### MySQL container won't start
```bash
# Check logs
docker-compose logs mysql

# Remove old volumes and restart
docker-compose down -v
docker-compose up -d mysql
```

### Connection refused
```bash
# Wait for health check
docker-compose ps mysql

# Should show "healthy" status
```

### Permission denied
```bash
# Reset MySQL root password
docker-compose exec mysql mysql -u root -prootpass -e "ALTER USER 'mcp_user'@'%' IDENTIFIED BY 'mcp_pass'; FLUSH PRIVILEGES;"
```

## Development Workflow

1. Make changes to MySQL adapter
2. Rebuild: `npm run build`
3. Restart server with MySQL config
4. Test changes with MCP Inspector
5. Verify data in MySQL container
