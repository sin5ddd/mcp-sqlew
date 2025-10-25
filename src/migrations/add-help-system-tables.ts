/**
 * Migration: Add Help System Tables (v3.5.3 -> v3.6.0)
 *
 * Creates database tables for the help system optimization to reduce token consumption
 * by moving help documentation from code to queryable database structures.
 *
 * Tables Created:
 * - m_help_tools: Master table for tool names
 * - m_help_actions: Master table for action names per tool
 * - t_help_action_params: Parameters for each action
 * - t_help_action_examples: Examples for each action
 * - m_help_use_case_categories: Use case taxonomy
 * - t_help_use_cases: Full use case documentation
 * - t_help_action_sequences: Common action patterns with usage tracking
 */

import { Database } from 'better-sqlite3';

interface MigrationResult {
  success: boolean;
  message: string;
  details?: string[];
}

/**
 * Check if migration is needed
 */
export function needsHelpSystemMigration(db: Database): boolean {
  // Check if help system tables don't exist yet
  const toolsExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='m_help_tools'"
  ).get();

  return toolsExists === undefined;
}

/**
 * Run the migration
 */
export function migrateToHelpSystem(db: Database): MigrationResult {
  const details: string[] = [];

  try {
    // Start transaction
    db.exec('BEGIN TRANSACTION');

    // 1. Create m_help_tools (Master table for tool names)
    db.exec(`
      CREATE TABLE IF NOT EXISTS m_help_tools (
        tool_name TEXT PRIMARY KEY,
        description TEXT NOT NULL
      )
    `);
    details.push('Created table: m_help_tools');

    // 2. Create m_help_actions (Master table for action names per tool)
    db.exec(`
      CREATE TABLE IF NOT EXISTS m_help_actions (
        action_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_name TEXT NOT NULL,
        action_name TEXT NOT NULL,
        description TEXT NOT NULL,
        FOREIGN KEY (tool_name) REFERENCES m_help_tools(tool_name) ON DELETE CASCADE,
        UNIQUE(tool_name, action_name)
      )
    `);
    details.push('Created table: m_help_actions');

    // Create index for fast action lookups by tool
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_help_actions_tool
      ON m_help_actions(tool_name)
    `);
    details.push('Created index: idx_help_actions_tool');

    // 3. Create t_help_action_params (Parameters for each action)
    db.exec(`
      CREATE TABLE IF NOT EXISTS t_help_action_params (
        param_id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_id INTEGER NOT NULL,
        param_name TEXT NOT NULL,
        param_type TEXT NOT NULL,
        required INTEGER NOT NULL DEFAULT 0,
        description TEXT NOT NULL,
        default_value TEXT,
        FOREIGN KEY (action_id) REFERENCES m_help_actions(action_id) ON DELETE CASCADE
      )
    `);
    details.push('Created table: t_help_action_params');

    // Create index for fast parameter lookups by action
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_help_action_params_action
      ON t_help_action_params(action_id)
    `);
    details.push('Created index: idx_help_action_params_action');

    // 4. Create t_help_action_examples (Examples for each action)
    db.exec(`
      CREATE TABLE IF NOT EXISTS t_help_action_examples (
        example_id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_id INTEGER NOT NULL,
        example_title TEXT NOT NULL,
        example_code TEXT NOT NULL,
        explanation TEXT NOT NULL,
        FOREIGN KEY (action_id) REFERENCES m_help_actions(action_id) ON DELETE CASCADE
      )
    `);
    details.push('Created table: t_help_action_examples');

    // Create index for fast example lookups by action
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_help_action_examples_action
      ON t_help_action_examples(action_id)
    `);
    details.push('Created index: idx_help_action_examples_action');

    // 5. Create m_help_use_case_categories (Use case taxonomy)
    db.exec(`
      CREATE TABLE IF NOT EXISTS m_help_use_case_categories (
        category_id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL
      )
    `);
    details.push('Created table: m_help_use_case_categories');

    // 6. Create t_help_use_cases (Full use case documentation)
    db.exec(`
      CREATE TABLE IF NOT EXISTS t_help_use_cases (
        use_case_id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        complexity TEXT NOT NULL CHECK(complexity IN ('basic', 'intermediate', 'advanced')),
        description TEXT NOT NULL,
        full_example TEXT NOT NULL,
        action_sequence TEXT NOT NULL,
        FOREIGN KEY (category_id) REFERENCES m_help_use_case_categories(category_id) ON DELETE CASCADE
      )
    `);
    details.push('Created table: t_help_use_cases');

    // Create index for fast use case lookups by category
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_help_use_cases_category
      ON t_help_use_cases(category_id)
    `);
    details.push('Created index: idx_help_use_cases_category');

    // Create index for fast use case lookups by complexity
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_help_use_cases_complexity
      ON t_help_use_cases(complexity)
    `);
    details.push('Created index: idx_help_use_cases_complexity');

    // 7. Create t_help_action_sequences (Common action patterns with usage tracking)
    db.exec(`
      CREATE TABLE IF NOT EXISTS t_help_action_sequences (
        sequence_id INTEGER PRIMARY KEY AUTOINCREMENT,
        sequence_name TEXT NOT NULL,
        actions TEXT NOT NULL,
        description TEXT NOT NULL,
        use_count INTEGER NOT NULL DEFAULT 0
      )
    `);
    details.push('Created table: t_help_action_sequences');

    // Create index for fast sequence lookups by use_count (most popular first)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_help_action_sequences_use_count
      ON t_help_action_sequences(use_count DESC)
    `);
    details.push('Created index: idx_help_action_sequences_use_count');

    // Commit transaction
    db.exec('COMMIT');

    return {
      success: true,
      message: 'Help system tables migration completed successfully (v3.5.3 → v3.6.0)',
      details
    };

  } catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');

    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Help system migration failed: ${message}`,
      details
    };
  }
}

/**
 * Get migration info
 */
export function getHelpSystemMigrationInfo(): string {
  return `
Migration: Add Help System Tables (v3.5.3 → v3.6.0)

This migration creates 7 new tables for the help system optimization feature:

Master Tables (m_ prefix):
  1. m_help_tools - Tool names and descriptions
  2. m_help_actions - Actions per tool with descriptions
  3. m_help_use_case_categories - Use case taxonomy

Transaction Tables (t_ prefix):
  4. t_help_action_params - Action parameters with type info
  5. t_help_action_examples - Code examples for each action
  6. t_help_use_cases - Full use case documentation
  7. t_help_action_sequences - Common patterns with usage tracking

The migration will:
1. Create all 7 tables with appropriate foreign key constraints
2. Add 6 indexes for optimal query performance:
   - idx_help_actions_tool (tool_name)
   - idx_help_action_params_action (action_id)
   - idx_help_action_examples_action (action_id)
   - idx_help_use_cases_category (category_id)
   - idx_help_use_cases_complexity (complexity)
   - idx_help_action_sequences_use_count (use_count DESC)

Benefits:
- Reduces token consumption by moving help docs to database
- Enables granular, query-based help retrieval
- Supports usage tracking for action sequences
- Maintains referential integrity with cascading deletes

This migration is safe and additive (no data loss).
  `.trim();
}
