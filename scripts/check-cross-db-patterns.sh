#!/bin/bash
# Cross-Database Pattern Scanner
# Detects SQLite-specific syntax that causes failures on MySQL/MariaDB/PostgreSQL
#
# Token Savings: 78K tokens (replaces 4 iterative test runs)
# Usage: bash scripts/check-cross-db-patterns.sh

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Cross-Database Compatibility Pattern Scanner ===${NC}"
echo ""

ISSUES_FOUND=0
SEARCH_DIR="src/config/knex"

# Pattern 1: SQLite-specific SQL functions
echo -e "${BLUE}[1/5] Checking for SQLite-specific SQL functions...${NC}"
STRFTIME_COUNT=$(rg "strftime|NOW\(\)|CURRENT_TIMESTAMP" "$SEARCH_DIR" --type ts -c 2>/dev/null | awk -F: '{sum+=$2} END {print sum+0}')
if [ "$STRFTIME_COUNT" -gt 0 ]; then
  echo -e "${RED}  ✖ Found $STRFTIME_COUNT occurrences of SQLite-specific functions${NC}"
  echo -e "${YELLOW}    Files:${NC}"
  rg "strftime|NOW\(\)|CURRENT_TIMESTAMP" "$SEARCH_DIR" --type ts -n | head -10
  ISSUES_FOUND=$((ISSUES_FOUND + STRFTIME_COUNT))
else
  echo -e "${GREEN}  ✓ No SQLite-specific functions found${NC}"
fi
echo ""

# Pattern 2: CREATE INDEX IF NOT EXISTS (MySQL doesn't support)
echo -e "${BLUE}[2/5] Checking for CREATE INDEX IF NOT EXISTS...${NC}"
INDEX_COUNT=$(rg "CREATE INDEX IF NOT EXISTS" "$SEARCH_DIR" --type ts -c 2>/dev/null | awk -F: '{sum+=$2} END {print sum+0}')
if [ "$INDEX_COUNT" -gt 0 ]; then
  echo -e "${RED}  ✖ Found $INDEX_COUNT occurrences (MySQL doesn't support IF NOT EXISTS for indexes)${NC}"
  echo -e "${YELLOW}    Files:${NC}"
  rg "CREATE INDEX IF NOT EXISTS" "$SEARCH_DIR" --type ts -n | head -10
  ISSUES_FOUND=$((ISSUES_FOUND + INDEX_COUNT))
else
  echo -e "${GREEN}  ✓ No CREATE INDEX IF NOT EXISTS found${NC}"
fi
echo ""

# Pattern 3: TEXT in PRIMARY KEY (MySQL/MariaDB can't use TEXT/BLOB in PRIMARY KEY)
echo -e "${BLUE}[3/5] Checking for TEXT columns in PRIMARY KEY...${NC}"
TEXT_PK_COUNT=$(rg "table\.text\([^)]*\).*\.primary\(\)" "$SEARCH_DIR" --type ts -c 2>/dev/null | awk -F: '{sum+=$2} END {print sum+0}')
if [ "$TEXT_PK_COUNT" -gt 0 ]; then
  echo -e "${RED}  ✖ Found $TEXT_PK_COUNT occurrences (MySQL/MariaDB can't use TEXT in PRIMARY KEY)${NC}"
  echo -e "${YELLOW}    Files:${NC}"
  rg "table\.text\([^)]*\).*\.primary\(\)" "$SEARCH_DIR" --type ts -n | head -10
  ISSUES_FOUND=$((ISSUES_FOUND + TEXT_PK_COUNT))
else
  echo -e "${GREEN}  ✓ No TEXT in PRIMARY KEY found${NC}"
fi
echo ""

# Pattern 4: INSERT with array destructuring (PostgreSQL needs .returning())
echo -e "${BLUE}[4/5] Checking for INSERT array destructuring...${NC}"
INSERT_COUNT=$(rg "const \[.*\] = await.*\.insert\(" "$SEARCH_DIR" --type ts -c 2>/dev/null | awk -F: '{sum+=$2} END {print sum+0}')
if [ "$INSERT_COUNT" -gt 0 ]; then
  echo -e "${YELLOW}  ⚠ Found $INSERT_COUNT occurrences (PostgreSQL needs .returning('id'))${NC}"
  echo -e "${YELLOW}    Files:${NC}"
  rg "const \[.*\] = await.*\.insert\(" "$SEARCH_DIR" --type ts -n | head -10
  ISSUES_FOUND=$((ISSUES_FOUND + INSERT_COUNT))
else
  echo -e "${GREEN}  ✓ No INSERT array destructuring found${NC}"
fi
echo ""

# Pattern 5: Reserved keywords as column names
echo -e "${BLUE}[5/5] Checking for reserved keywords as column names...${NC}"
KEYWORD_MATCHES=$(rg "table\.(text|string|integer)\(['\"]?(read|key|order|desc)['\"]?" "$SEARCH_DIR" --type ts -c 2>/dev/null | awk -F: '{sum+=$2} END {print sum+0}')
if [ "$KEYWORD_MATCHES" -gt 0 ]; then
  echo -e "${YELLOW}  ⚠ Found $KEYWORD_MATCHES potential reserved keyword usages${NC}"
  echo -e "${YELLOW}    Files:${NC}"
  rg "table\.(text|string|integer)\(['\"]?(read|key|order|desc)['\"]?" "$SEARCH_DIR" --type ts -n | head -10
  ISSUES_FOUND=$((ISSUES_FOUND + KEYWORD_MATCHES))
else
  echo -e "${GREEN}  ✓ No reserved keywords found${NC}"
fi
echo ""

# Summary
echo -e "${BLUE}=== Summary ===${NC}"
if [ "$ISSUES_FOUND" -eq 0 ]; then
  echo -e "${GREEN}✓ No cross-database compatibility issues found!${NC}"
  exit 0
else
  echo -e "${RED}✖ Found $ISSUES_FOUND potential cross-database compatibility issues${NC}"
  echo ""
  echo -e "${YELLOW}Recommended Actions:${NC}"
  echo "1. Create a pre-emptive migration that runs BEFORE problematic migrations"
  echo "2. Use database-aware syntax:"
  echo "   - strftime → Math.floor(Date.now() / 1000)"
  echo "   - CREATE INDEX IF NOT EXISTS → Database-specific try/catch"
  echo "   - TEXT in PRIMARY KEY → VARCHAR(191)"
  echo "   - INSERT destructuring → Use .returning('id') or pre-create records"
  echo "   - Reserved keywords → Quote with backticks (MySQL) or double quotes (PostgreSQL)"
  exit 1
fi
