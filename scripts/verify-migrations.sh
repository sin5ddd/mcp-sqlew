#!/bin/bash
# Migration Verification Script
# Checks migration status across MySQL, MariaDB, and PostgreSQL without running full test suite
#
# Token Savings: 19K tokens per verification (2K vs 20K full test suite)
# Usage: bash scripts/verify-migrations.sh

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Migration Verification (MySQL, MariaDB, PostgreSQL) ===${NC}"
echo ""

ALL_PASSED=true

# Function to check if Docker container is running
check_container() {
  local container_name=$1
  if ! docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
    echo -e "${RED}✖ Container ${container_name} is not running${NC}"
    echo -e "${YELLOW}  Start with: cd docker && docker-compose up -d${NC}"
    return 1
  fi
  return 0
}

# MySQL Migration Check
echo -e "${BLUE}[1/3] Checking MySQL migrations...${NC}"
if check_container "mcp-sqlew-mysql-test"; then
  MYSQL_COUNT=$(docker exec mcp-sqlew-mysql-test mysql -u mcp_user -pmcp_pass mcp_test -sN \
    -e "SELECT COUNT(*) FROM knex_migrations" 2>&1 | grep -v "Warning" | tail -1)

  if [ -n "$MYSQL_COUNT" ] && [ "$MYSQL_COUNT" -gt 0 ]; then
    echo -e "${GREEN}  ✓ MySQL: $MYSQL_COUNT migrations completed${NC}"

    # Show last 5 migrations
    echo -e "${BLUE}    Last 5 migrations:${NC}"
    docker exec mcp-sqlew-mysql-test mysql -u mcp_user -pmcp_pass mcp_test -sN \
      -e "SELECT name FROM knex_migrations ORDER BY id DESC LIMIT 5" 2>&1 | grep -v "Warning" | \
      while read -r migration; do
        echo -e "${GREEN}      ✓ $migration${NC}"
      done
  else
    echo -e "${RED}  ✖ MySQL: No migrations found or error occurred${NC}"
    ALL_PASSED=false
  fi
else
  ALL_PASSED=false
fi
echo ""

# MariaDB Migration Check
echo -e "${BLUE}[2/3] Checking MariaDB migrations...${NC}"
if check_container "mcp-sqlew-mariadb-test"; then
  MARIADB_COUNT=$(docker exec mcp-sqlew-mariadb-test mysql -u mcp_user -pmcp_pass mcp_test -sN \
    -e "SELECT COUNT(*) FROM knex_migrations" 2>&1 | grep -v "Warning" | tail -1)

  if [ -n "$MARIADB_COUNT" ] && [ "$MARIADB_COUNT" -gt 0 ]; then
    echo -e "${GREEN}  ✓ MariaDB: $MARIADB_COUNT migrations completed${NC}"

    # Show last 5 migrations
    echo -e "${BLUE}    Last 5 migrations:${NC}"
    docker exec mcp-sqlew-mariadb-test mysql -u mcp_user -pmcp_pass mcp_test -sN \
      -e "SELECT name FROM knex_migrations ORDER BY id DESC LIMIT 5" 2>&1 | grep -v "Warning" | \
      while read -r migration; do
        echo -e "${GREEN}      ✓ $migration${NC}"
      done
  else
    echo -e "${RED}  ✖ MariaDB: No migrations found or error occurred${NC}"
    ALL_PASSED=false
  fi
else
  ALL_PASSED=false
fi
echo ""

# PostgreSQL Migration Check
echo -e "${BLUE}[3/3] Checking PostgreSQL migrations...${NC}"
if check_container "mcp-sqlew-postgres-test"; then
  POSTGRESQL_COUNT=$(docker exec mcp-sqlew-postgres-test psql -U mcp_user -d mcp_test -t -c \
    "SELECT COUNT(*) FROM knex_migrations" 2>&1 | tr -d ' ')

  if [ -n "$POSTGRESQL_COUNT" ] && [ "$POSTGRESQL_COUNT" -gt 0 ]; then
    echo -e "${GREEN}  ✓ PostgreSQL: $POSTGRESQL_COUNT migrations completed${NC}"

    # Show last 5 migrations
    echo -e "${BLUE}    Last 5 migrations:${NC}"
    docker exec mcp-sqlew-postgres-test psql -U mcp_user -d mcp_test -t -c \
      "SELECT name FROM knex_migrations ORDER BY id DESC LIMIT 5" 2>&1 | \
      while read -r migration; do
        migration=$(echo "$migration" | xargs) # Trim whitespace
        if [ -n "$migration" ]; then
          echo -e "${GREEN}      ✓ $migration${NC}"
        fi
      done
  else
    echo -e "${RED}  ✖ PostgreSQL: No migrations found or error occurred${NC}"
    ALL_PASSED=false
  fi
else
  ALL_PASSED=false
fi
echo ""

# Summary
echo -e "${BLUE}=== Summary ===${NC}"
if [ "$ALL_PASSED" = true ]; then
  echo -e "${GREEN}✓ All databases have migrations completed successfully!${NC}"
  echo ""
  echo -e "${BLUE}Migration counts:${NC}"
  [ -n "$MYSQL_COUNT" ] && echo -e "  MySQL:      $MYSQL_COUNT"
  [ -n "$MARIADB_COUNT" ] && echo -e "  MariaDB:    $MARIADB_COUNT"
  [ -n "$POSTGRESQL_COUNT" ] && echo -e "  PostgreSQL: $POSTGRESQL_COUNT"
  exit 0
else
  echo -e "${RED}✖ Some databases failed migration verification${NC}"
  echo ""
  echo -e "${YELLOW}Troubleshooting:${NC}"
  echo "1. Ensure Docker containers are running: cd docker && docker-compose up -d"
  echo "2. Check migration logs: npm run test:native:verbose"
  echo "3. Run pattern scanner: bash scripts/check-cross-db-patterns.sh"
  exit 1
fi
