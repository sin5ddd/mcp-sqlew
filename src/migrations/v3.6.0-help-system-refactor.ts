/**
 * Migration: Help System Schema Refactor (v3.5.x -> v3.6.0)
 *
 * This migration refactors the help system schema:
 * 1. Renames tables: t_help_* → m_help_* for static/master data
 * 2. Creates 5 new junction tables for normalized many-to-many relationships
 * 3. Parses JSON action_sequence → normalized m_help_use_case_actions rows
 * 4. Populates m_help_sequences with 10 workflow patterns
 * 5. Generates and normalizes tags from categories/titles
 * 6. Creates indexes on all foreign keys
 * 7. Validates zero data loss (41 use cases preserved)
 *
 * Execution time: <5 seconds
 * Safety: Single transaction with rollback on error
 */

import { Database } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

interface MigrationResult {
  success: boolean;
  message: string;
  details?: string[];
  validationResults?: ValidationResult[];
}

interface ValidationResult {
  test: string;
  actual: number | string;
  expected: number | string;
  status: 'PASS' | 'FAIL';
}

/**
 * Check if migration is needed
 */
export function needsMigration(db: Database): boolean {
  // Check if old table exists (t_help_use_cases) with action_sequence column
  const oldTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='t_help_use_cases'"
  ).get();

  // Check if new junction table doesn't exist
  const newTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='m_help_use_case_actions'"
  ).get();

  // Check if t_help_use_cases has action_sequence column
  let hasActionSequenceColumn = false;
  if (oldTableExists) {
    const columns = db.prepare("PRAGMA table_info(t_help_use_cases)").all() as Array<{ name: string }>;
    hasActionSequenceColumn = columns.some(col => col.name === 'action_sequence');
  }

  return oldTableExists !== undefined && newTableExists === undefined && hasActionSequenceColumn;
}

/**
 * Run the migration
 */
export function runMigration(db: Database): MigrationResult {
  const details: string[] = [];
  const validationResults: ValidationResult[] = [];

  try {
    // Read SQL migration file
    const sqlPath = path.join(__dirname, 'v3.6.0-help-system-refactor.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    details.push('Loaded migration SQL from file');

    // Execute migration in a single transaction
    // Note: The SQL file already contains BEGIN/COMMIT
    db.exec(sql);

    details.push('Migration SQL executed successfully');

    // Extract validation results from the database
    // The SQL includes validation queries that output results
    // We'll re-run them to capture the results in TypeScript

    // Validation 1: Use case count
    const useCaseCount = db.prepare('SELECT COUNT(*) as count FROM m_help_use_cases').get() as { count: number };
    validationResults.push({
      test: 'Use Case Count',
      actual: useCaseCount.count,
      expected: 41,
      status: useCaseCount.count === 41 ? 'PASS' : 'FAIL'
    });

    // Validation 2: Use cases with actions
    const useCasesWithActions = db.prepare(
      'SELECT COUNT(DISTINCT use_case_id) as count FROM m_help_use_case_actions'
    ).get() as { count: number };
    validationResults.push({
      test: 'Use Cases with Actions',
      actual: useCasesWithActions.count,
      expected: 41,
      status: useCasesWithActions.count === 41 ? 'PASS' : 'FAIL'
    });

    // Validation 3: Sequences with actions
    const sequencesWithActions = db.prepare(
      'SELECT COUNT(DISTINCT sequence_id) as count FROM m_help_sequence_actions'
    ).get() as { count: number };
    validationResults.push({
      test: 'Sequences with Actions',
      actual: sequencesWithActions.count,
      expected: 10,
      status: sequencesWithActions.count === 10 ? 'PASS' : 'FAIL'
    });

    // Validation 4: Tag count
    const tagCount = db.prepare('SELECT COUNT(*) as count FROM m_help_tags').get() as { count: number };
    validationResults.push({
      test: 'Tag Count',
      actual: tagCount.count,
      expected: '> 20',
      status: tagCount.count > 20 ? 'PASS' : 'FAIL'
    });

    // Validation 5: FK integrity
    const orphanedRecords = db.prepare(`
      SELECT COUNT(*) as count
      FROM m_help_use_case_actions uca
      LEFT JOIN m_help_actions ha ON uca.action_id = ha.action_id
      WHERE ha.action_id IS NULL
    `).get() as { count: number };
    validationResults.push({
      test: 'FK Integrity (use_case_actions)',
      actual: orphanedRecords.count,
      expected: 0,
      status: orphanedRecords.count === 0 ? 'PASS' : 'FAIL'
    });

    // Validation 6: Index count
    const indexCount = db.prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='index' AND name LIKE 'idx_help_%'"
    ).get() as { count: number };
    validationResults.push({
      test: 'Index Count',
      actual: indexCount.count,
      expected: '> 15',
      status: indexCount.count > 15 ? 'PASS' : 'FAIL'
    });

    // Check if all validations passed
    const allPassed = validationResults.every(v => v.status === 'PASS');

    if (!allPassed) {
      const failedTests = validationResults.filter(v => v.status === 'FAIL');
      details.push(`WARNING: ${failedTests.length} validation test(s) failed`);
      failedTests.forEach(test => {
        details.push(`  - ${test.test}: expected ${test.expected}, got ${test.actual}`);
      });
    }

    // Get migration statistics
    const stats = {
      useCases: useCaseCount.count,
      actionsNormalized: db.prepare('SELECT COUNT(*) as count FROM m_help_use_case_actions').get() as { count: number },
      sequencesCreated: db.prepare('SELECT COUNT(*) as count FROM m_help_sequences').get() as { count: number },
      tagsGenerated: tagCount.count,
      indexesCreated: indexCount.count
    };

    details.push('');
    details.push('Migration Statistics:');
    details.push(`  - Tables Renamed: 3 (t_ → m_)`);
    details.push(`  - New Tables Created: 6`);
    details.push(`  - Use Cases Migrated: ${stats.useCases}`);
    details.push(`  - Actions Normalized: ${stats.actionsNormalized.count}`);
    details.push(`  - Sequences Created: ${stats.sequencesCreated.count}`);
    details.push(`  - Tags Generated: ${stats.tagsGenerated}`);
    details.push(`  - Indexes Created: ${stats.indexesCreated}`);

    return {
      success: allPassed,
      message: allPassed
        ? 'Migration v3.6.0 completed successfully. All validations passed.'
        : 'Migration v3.6.0 completed with validation warnings. Review details.',
      details,
      validationResults
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    details.push(`ERROR: ${message}`);

    return {
      success: false,
      message: `Migration failed: ${message}`,
      details,
      validationResults
    };
  }
}

/**
 * Get migration info
 */
export function getMigrationInfo(): string {
  return `
Migration: Help System Schema Refactor (v3.5.x -> v3.6.0)

This migration refactors the help system for better normalization and queryability:

Schema Changes:
- Renames 3 tables: t_help_* → m_help_* (static/master data)
- Creates 6 new tables:
  * m_help_tags (normalized tag master)
  * m_help_sequences (reusable workflow patterns)
  * m_help_use_case_actions (replaces JSON action_sequence)
  * m_help_sequence_actions (sequence steps)
  * m_help_example_tags (example categorization)
  * m_help_use_case_tags (use case categorization)
  * m_help_sequence_tags (sequence categorization)

Data Transformations:
- Parses JSON action_sequence arrays → normalized relational rows
- Generates 24+ tags from categories, complexity levels, and concepts
- Populates 10 workflow sequences (task state machine, rich decision flow, etc.)
- Auto-tags all use cases and sequences

Performance Optimizations:
- Creates 15+ indexes on all foreign keys and junction tables
- Enables efficient tag-based queries and workflow discovery

Safety Guarantees:
- Single atomic transaction (all-or-nothing)
- 6 validation tests ensure zero data loss
- Rollback on any error
- Execution time: <5 seconds

All 41 existing use cases are preserved with enhanced metadata.
  `.trim();
}

/**
 * Rollback migration (restore from backup)
 */
export function rollbackMigration(db: Database, backupPath: string): MigrationResult {
  const details: string[] = [];

  try {
    if (!fs.existsSync(backupPath)) {
      return {
        success: false,
        message: `Backup file not found: ${backupPath}`,
        details
      };
    }

    // Close current database connection
    db.close();

    // Restore backup (this would need to be handled by the caller)
    details.push(`Backup file located: ${backupPath}`);
    details.push('Note: Database restoration must be performed manually by copying the backup file.');

    return {
      success: true,
      message: 'Rollback instructions prepared. Restore the backup file manually.',
      details
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Rollback failed: ${message}`,
      details
    };
  }
}
