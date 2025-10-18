# Acceptance Criteria Reference

Complete guide to all acceptance check types supported by the Auto File Tracking system.

## Overview

Acceptance criteria define automated validation checks that determine when a task is complete. Each check returns `success: true` or `success: false`, and tasks only auto-complete when **all** checks pass.

## Check Types

### 1. tests_pass

Execute a shell command and validate the output.

**Use Cases:**
- Run unit tests, integration tests, E2E tests
- Execute linters, type checkers, formatters
- Run build commands
- Execute custom validation scripts

**Parameters:**
- `type`: `"tests_pass"` (required)
- `command`: Shell command to execute (required)
- `expected_pattern`: Regex pattern to match in output (optional)
- `timeout`: Timeout in seconds (optional, default: 60)

**Examples:**

```typescript
// Basic test execution (passes if exit code is 0)
{
  type: "tests_pass",
  command: "npm test"
}

// Test with pattern matching
{
  type: "tests_pass",
  command: "npm test -- auth.test.ts",
  expected_pattern: "5 passing"
}

// Multiple patterns (OR logic using regex)
{
  type: "tests_pass",
  command: "npm run build",
  expected_pattern: "(success|completed|built)"
}

// Custom timeout for slow tests
{
  type: "tests_pass",
  command: "npm run e2e-tests",
  expected_pattern: "passing",
  timeout: 300  // 5 minutes
}

// Linting
{
  type: "tests_pass",
  command: "npm run lint",
  expected_pattern: "0 errors"
}

// Type checking
{
  type: "tests_pass",
  command: "npx tsc --noEmit",
  expected_pattern: "0 errors"
}
```

**Success Criteria:**
- Command exits with code 0 (success)
- If `expected_pattern` specified, output must match the regex

**Failure Cases:**
- Command exits with non-zero code
- Command times out
- Output doesn't match `expected_pattern` (if specified)

---

### 2. code_removed

Verify that a specific code pattern has been removed from a file.

**Use Cases:**
- Confirm deprecated code removed
- Verify TODO comments removed
- Ensure debug statements removed
- Validate old API usage eliminated

**Parameters:**
- `type`: `"code_removed"` (required)
- `file`: Path to file (required)
- `pattern`: Regex pattern that should NOT exist (required)

**Examples:**

```typescript
// Remove TODO comment
{
  type: "code_removed",
  file: "src/api.ts",
  pattern: "// TODO: implement error handling"
}

// Remove deprecated function
{
  type: "code_removed",
  file: "src/utils.ts",
  pattern: "function oldMethod\\("
}

// Remove console.log statements
{
  type: "code_removed",
  file: "src/auth.ts",
  pattern: "console\\.log\\("
}

// Remove debug flags
{
  type: "code_removed",
  file: "src/config.ts",
  pattern: "DEBUG\\s*=\\s*true"
}

// Flexible pattern (any whitespace)
{
  type: "code_removed",
  file: "src/legacy.ts",
  pattern: "class\\s+LegacyService"
}
```

**Success Criteria:**
- Pattern NOT found in file
- File doesn't exist (pattern is definitely removed!)

**Failure Cases:**
- Pattern still exists in file
- Cannot read file (permissions error, etc.)

---

### 3. code_contains

Verify that a specific code pattern exists in a file.

**Use Cases:**
- Confirm new function/class added
- Verify import statements added
- Ensure specific logic implemented
- Validate documentation comments added

**Parameters:**
- `type`: `"code_contains"` (required)
- `file`: Path to file (required)
- `pattern`: Regex pattern that MUST exist (required)

**Examples:**

```typescript
// Verify class exists
{
  type: "code_contains",
  file: "src/auth.ts",
  pattern: "export class AuthService"
}

// Verify function signature
{
  type: "code_contains",
  file: "src/api.ts",
  pattern: "async function fetchUserData\\("
}

// Verify import added
{
  type: "code_contains",
  file: "src/components/Login.tsx",
  pattern: "import.*useState.*from 'react'"
}

// Verify error handling
{
  type: "code_contains",
  file: "src/database.ts",
  pattern: "try\\s*\\{[\\s\\S]*catch\\s*\\("
}

// Verify JSDoc comment
{
  type: "code_contains",
  file: "src/utils.ts",
  pattern: "/\\*\\*[\\s\\S]*@param[\\s\\S]*\\*/"
}

// Verify specific value
{
  type: "code_contains",
  file: "src/config.ts",
  pattern: "API_VERSION\\s*=\\s*['\"]v2['\"]"
}
```

**Success Criteria:**
- Pattern found in file

**Failure Cases:**
- Pattern not found in file
- File doesn't exist
- Cannot read file (permissions error, etc.)

---

### 4. file_exists

Verify that a file exists.

**Use Cases:**
- Confirm documentation created
- Verify migration file generated
- Ensure config file exists
- Validate new component created

**Parameters:**
- `type`: `"file_exists"` (required)
- `file`: Path to file (required)

**Examples:**

```typescript
// Verify documentation created
{
  type: "file_exists",
  file: "docs/api/authentication.md"
}

// Verify test file created
{
  type: "file_exists",
  file: "src/auth.test.ts"
}

// Verify migration file
{
  type: "file_exists",
  file: "migrations/001_add_users_table.sql"
}

// Verify config file
{
  type: "file_exists",
  file: ".env.production"
}

// Verify component created
{
  type: "file_exists",
  file: "src/components/UserProfile.tsx"
}
```

**Success Criteria:**
- File exists at specified path

**Failure Cases:**
- File doesn't exist
- Path is a directory (not a file)

---

## Combining Check Types

Use multiple checks to create comprehensive validation:

### Example: Complete Feature Implementation

```typescript
acceptance_criteria: [
  // 1. Verify implementation file created
  {
    type: "file_exists",
    file: "src/features/notifications.ts"
  },

  // 2. Verify main class implemented
  {
    type: "code_contains",
    file: "src/features/notifications.ts",
    pattern: "export class NotificationService"
  },

  // 3. Verify error handling added
  {
    type: "code_contains",
    file: "src/features/notifications.ts",
    pattern: "try\\s*\\{[\\s\\S]*catch"
  },

  // 4. Verify TODO removed
  {
    type: "code_removed",
    file: "src/features/notifications.ts",
    pattern: "// TODO"
  },

  // 5. Verify tests created and passing
  {
    type: "file_exists",
    file: "src/features/notifications.test.ts"
  },
  {
    type: "tests_pass",
    command: "npm test -- notifications.test.ts",
    expected_pattern: "passing"
  },

  // 6. Verify documentation created
  {
    type: "file_exists",
    file: "docs/features/notifications.md"
  }
]
```

### Example: Bug Fix Validation

```typescript
acceptance_criteria: [
  // 1. Verify bug fix code added
  {
    type: "code_contains",
    file: "src/utils/validation.ts",
    pattern: "if \\(!input\\) return false"
  },

  // 2. Verify debug logging removed
  {
    type: "code_removed",
    file: "src/utils/validation.ts",
    pattern: "console\\.log"
  },

  // 3. Verify tests pass
  {
    type: "tests_pass",
    command: "npm test -- validation.test.ts",
    expected_pattern: "0 failing"
  },

  // 4. Verify no regressions
  {
    type: "tests_pass",
    command: "npm test",
    expected_pattern: "0 failing"
  }
]
```

### Example: Refactoring Validation

```typescript
acceptance_criteria: [
  // 1. Verify old code removed
  {
    type: "code_removed",
    file: "src/api/legacy.ts",
    pattern: "function oldImplementation"
  },

  // 2. Verify new code added
  {
    type: "code_contains",
    file: "src/api/modern.ts",
    pattern: "async function newImplementation"
  },

  // 3. Verify imports updated
  {
    type: "code_removed",
    file: "src/index.ts",
    pattern: "import.*oldImplementation"
  },
  {
    type: "code_contains",
    file: "src/index.ts",
    pattern: "import.*newImplementation"
  },

  // 4. Verify all tests still pass
  {
    type: "tests_pass",
    command: "npm test",
    expected_pattern: "0 failing"
  }
]
```

## Advanced Patterns

### Regex Best Practices

**Escape Special Characters:**
```typescript
// GOOD: Escaped dots, parentheses, brackets
pattern: "function\\s+getData\\(\\)"

// BAD: Unescaped special characters
pattern: "function getData()"  // ❌ Matches "function.getData."
```

**Use Non-Greedy Quantifiers:**
```typescript
// GOOD: Non-greedy (matches minimal text)
pattern: "class\\s+\\w+?\\s*\\{"

// BAD: Greedy (matches too much text)
pattern: "class.*\\{"  // ❌ May match multiple classes
```

**Flexible Whitespace:**
```typescript
// GOOD: Flexible whitespace
pattern: "if\\s*\\(\\s*condition\\s*\\)"

// BAD: Fixed whitespace
pattern: "if \\( condition \\)"  // ❌ Won't match "if(condition)"
```

**Case Sensitivity:**
```typescript
// Case-insensitive matching
pattern: "(?i)todo"  // Matches "TODO", "Todo", "todo"

// Case-sensitive (default)
pattern: "TODO"  // Only matches "TODO"
```

### Complex Validation Scenarios

**Verify Multi-Line Code Blocks:**
```typescript
{
  type: "code_contains",
  file: "src/api.ts",
  pattern: "try\\s*\\{[\\s\\S]*?fetch\\([\\s\\S]*?\\}\\s*catch"
}
```

**Verify Function with Specific Parameters:**
```typescript
{
  type: "code_contains",
  file: "src/utils.ts",
  pattern: "function\\s+formatDate\\s*\\(\\s*date:\\s*Date\\s*,\\s*format:\\s*string\\s*\\)"
}
```

**Verify Specific Version Number:**
```typescript
{
  type: "code_contains",
  file: "package.json",
  pattern: "\"version\":\\s*\"2\\.0\\.0\""
}
```

**Verify No Unused Imports:**
```typescript
{
  type: "tests_pass",
  command: "npx eslint src/ --rule 'no-unused-vars: error'",
  expected_pattern: "0 errors"
}
```

## Error Handling

### Timeout Errors

```typescript
// Increase timeout for slow commands
{
  type: "tests_pass",
  command: "npm run integration-tests",
  timeout: 600  // 10 minutes
}
```

### Pattern Matching Failures

```typescript
// Use more flexible patterns
{
  type: "code_contains",
  file: "src/api.ts",
  // Before: pattern: "export class ApiService {" (too strict)
  // After: pattern: "export\\s+class\\s+ApiService" (flexible)
  pattern: "export\\s+class\\s+ApiService"
}
```

### File Not Found Errors

```typescript
// Use absolute paths or verify files exist first
{
  type: "file_exists",
  file: "/absolute/path/to/file.ts"  // More reliable
}
```

## Best Practices

### 1. Start Simple, Add Complexity

```typescript
// Start with basic checks
acceptance_criteria: [
  {type: "tests_pass", command: "npm test"}
]

// Add specific validations as needed
acceptance_criteria: [
  {type: "tests_pass", command: "npm test", expected_pattern: "passing"},
  {type: "code_contains", file: "src/feature.ts", pattern: "export class"}
]
```

### 2. Order Checks by Speed

```typescript
// Fast checks first (fail fast)
acceptance_criteria: [
  {type: "file_exists", file: "src/feature.ts"},  // Instant
  {type: "code_contains", file: "src/feature.ts", pattern: "export"},  // Fast
  {type: "tests_pass", command: "npm test"}  // Slowest
]
```

### 3. Use Descriptive Patterns

```typescript
// GOOD: Clear, specific patterns
{type: "code_contains", file: "src/auth.ts", pattern: "export class AuthService"}

// BAD: Vague patterns
{type: "code_contains", file: "src/auth.ts", pattern: "class"}  // Too broad
```

### 4. Test Patterns Manually

Before using patterns in acceptance criteria, test them manually:

```bash
# Test regex pattern
grep -P "export\\s+class\\s+AuthService" src/auth.ts

# Test command output
npm test | grep -P "passing"
```

### 5. Handle Edge Cases

```typescript
// Handle optional whitespace, different quote styles
{
  type: "code_contains",
  file: "src/config.ts",
  pattern: "API_KEY\\s*=\\s*['\"][^'\"]+['\"]"  // Matches both ' and "
}
```

## Debugging Acceptance Criteria

### Enable Detailed Logging

Check MCP server console output for detailed check results:

```
🔍 Checking acceptance criteria for task #123...
  ✓ Check 1: Command succeeded and output matches pattern "passing"
    Details: ✔ 5 tests passing (50ms)
  ✗ Check 2: Pattern "export class AuthService" not found in "src/auth.ts"
⏳ Task #123: 1/2 checks failed, staying in_progress
```

### Manual Validation

Run checks manually to debug failures:

```bash
# Test command execution
npm test -- auth.test.ts

# Test file patterns
grep -P "export class AuthService" src/auth.ts

# Test file existence
ls -la src/auth.ts
```

### Common Issues

**Issue: Pattern not matching despite code being present**
- **Solution**: Check for whitespace differences, use `\\s*` for flexible whitespace
- **Solution**: Escape special regex characters: `.`, `(`, `)`, `[`, `]`, `{`, `}`, `*`, `+`, `?`

**Issue: Tests passing locally but failing in acceptance criteria**
- **Solution**: Check working directory (chokidar runs from project root)
- **Solution**: Use absolute paths in test commands

**Issue: Timeout errors on CI/CD**
- **Solution**: Increase timeout: `{timeout: 300}`
- **Solution**: Run tests in parallel: `npm test -- --maxWorkers=4`

## See Also

- [AUTO_FILE_TRACKING.md](./AUTO_FILE_TRACKING.md) - Overview and setup
- [WORKFLOWS.md](./WORKFLOWS.md) - Multi-step validation workflows
- [BEST_PRACTICES.md](./BEST_PRACTICES.md) - Common patterns and anti-patterns
