/**
 * Quality Checks - Validation functions for smart review detection
 * Determines when tasks are ready for review based on quality gates
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { Database } from 'better-sqlite3';

const execAsync = promisify(exec);

/**
 * Quality check result
 */
export interface QualityCheckResult {
  passed: boolean;
  message: string;
  details?: string;
}

/**
 * Check if all watched files for a task have been modified at least once
 *
 * @param db - Database connection
 * @param taskId - Task ID to check
 * @param modifiedFiles - Set of files that have been modified
 * @returns True if all watched files have been modified, false otherwise
 */
export function checkAllFilesModified(
  db: Database,
  taskId: number,
  modifiedFiles: Set<string>
): QualityCheckResult {
  try {
    // Get all watched files for this task
    const stmt = db.prepare(`
      SELECT f.path
      FROM t_task_file_links tfl
      JOIN m_files f ON f.id = tfl.file_id
      WHERE tfl.task_id = ?
    `);

    const watchedFiles = stmt.all(taskId) as Array<{ path: string }>;

    if (watchedFiles.length === 0) {
      // No files to watch - consider this check passed
      return {
        passed: true,
        message: 'No files being watched (check skipped)',
      };
    }

    // Check if all watched files have been modified
    const unmodifiedFiles: string[] = [];
    for (const { path } of watchedFiles) {
      if (!modifiedFiles.has(path)) {
        unmodifiedFiles.push(path);
      }
    }

    if (unmodifiedFiles.length === 0) {
      return {
        passed: true,
        message: `All ${watchedFiles.length} watched files have been modified`,
      };
    } else {
      return {
        passed: false,
        message: `${unmodifiedFiles.length} of ${watchedFiles.length} watched files not yet modified`,
        details: `Unmodified: ${unmodifiedFiles.slice(0, 3).join(', ')}${unmodifiedFiles.length > 3 ? '...' : ''}`,
      };
    }
  } catch (error) {
    return {
      passed: false,
      message: `Error checking file modifications: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check if TypeScript files compile without syntax errors
 *
 * @param filePaths - Array of file paths to check
 * @returns Promise resolving to true if TypeScript compiles, false otherwise
 */
export async function checkTypeScriptCompiles(filePaths: string[]): Promise<QualityCheckResult> {
  try {
    // Filter for TypeScript files
    const tsFiles = filePaths.filter(
      path => path.endsWith('.ts') || path.endsWith('.tsx')
    );

    if (tsFiles.length === 0) {
      return {
        passed: true,
        message: 'No TypeScript files to check (check skipped)',
      };
    }

    // Run tsc --noEmit to check for syntax errors
    // This checks the entire project, not just individual files,
    // because TypeScript needs full context for type checking
    try {
      const { stdout, stderr } = await execAsync('npx tsc --noEmit', {
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024 * 5, // 5MB buffer
      });

      return {
        passed: true,
        message: `TypeScript compilation successful (${tsFiles.length} .ts/.tsx files)`,
      };
    } catch (error: any) {
      // tsc returns non-zero exit code if there are errors
      const output = (error.stdout || '') + (error.stderr || '');
      const errorLines = output.split('\n').filter((line: string) =>
        line.includes('error TS')
      ).slice(0, 3); // First 3 errors

      return {
        passed: false,
        message: 'TypeScript compilation failed',
        details: errorLines.join('\n') || output.slice(0, 300),
      };
    }
  } catch (error) {
    return {
      passed: false,
      message: `Error running TypeScript check: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check if tests pass for the task
 *
 * @param db - Database connection
 * @param taskId - Task ID to check
 * @param filePaths - Array of file paths being watched
 * @returns Promise resolving to true if tests pass, false otherwise
 */
export async function checkTestsPass(
  db: Database,
  taskId: number,
  filePaths: string[]
): Promise<QualityCheckResult> {
  try {
    // Check if any files match test patterns
    const testPatterns = [/\.test\.(ts|tsx|js|jsx)$/, /\.spec\.(ts|tsx|js|jsx)$/];
    const testFiles = filePaths.filter(path =>
      testPatterns.some(pattern => pattern.test(path))
    );

    if (testFiles.length === 0) {
      return {
        passed: true,
        message: 'No test files found (check skipped)',
      };
    }

    // Look for acceptance_criteria with tests_pass type
    const stmt = db.prepare(`
      SELECT acceptance_criteria
      FROM t_task_details
      WHERE task_id = ?
    `);

    const row = stmt.get(taskId) as { acceptance_criteria: string | null } | undefined;

    if (!row?.acceptance_criteria) {
      // No acceptance criteria - run default test command if package.json has test script
      return {
        passed: true,
        message: 'No test acceptance criteria defined (check skipped)',
      };
    }

    const criteria = JSON.parse(row.acceptance_criteria);
    const testCriteria = criteria.find((c: any) => c.type === 'tests_pass');

    if (!testCriteria) {
      return {
        passed: true,
        message: 'No test acceptance criteria defined (check skipped)',
      };
    }

    // Execute the test command
    const command = testCriteria.command || 'npm test';
    const timeout = testCriteria.timeout || 60; // Default 60s timeout

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: timeout * 1000,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      });

      const output = stdout + stderr;

      // Check for expected pattern if specified
      if (testCriteria.expected_pattern) {
        const regex = new RegExp(testCriteria.expected_pattern);
        if (regex.test(output)) {
          return {
            passed: true,
            message: `Tests passed (${testFiles.length} test files)`,
            details: `Command: ${command}`,
          };
        } else {
          return {
            passed: false,
            message: 'Tests ran but output does not match expected pattern',
            details: output.slice(0, 300),
          };
        }
      }

      // No pattern specified - success if exit code is 0
      return {
        passed: true,
        message: `Tests passed (${testFiles.length} test files)`,
        details: `Command: ${command}`,
      };
    } catch (error: any) {
      const output = (error.stdout || '') + (error.stderr || '');
      return {
        passed: false,
        message: error.killed ? 'Tests timed out' : 'Tests failed',
        details: output.slice(0, 300),
      };
    }
  } catch (error) {
    return {
      passed: false,
      message: `Error running tests: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check if task is ready for review based on all quality gates
 *
 * @param db - Database connection
 * @param taskId - Task ID to check
 * @param filePaths - Array of file paths being watched
 * @param modifiedFiles - Set of files that have been modified
 * @param config - Configuration flags for which checks to run
 * @returns Promise resolving to object with overall result and individual check results
 */
export async function checkReadyForReview(
  db: Database,
  taskId: number,
  filePaths: string[],
  modifiedFiles: Set<string>,
  config: {
    requireAllFilesModified: boolean;
    requireTestsPass: boolean;
    requireCompile: boolean;
  }
): Promise<{
  ready: boolean;
  results: Array<{ check: string; result: QualityCheckResult }>;
}> {
  const results: Array<{ check: string; result: QualityCheckResult }> = [];

  // Run all enabled checks
  if (config.requireAllFilesModified) {
    const result = checkAllFilesModified(db, taskId, modifiedFiles);
    results.push({ check: 'all_files_modified', result });
  }

  if (config.requireCompile) {
    const result = await checkTypeScriptCompiles(filePaths);
    results.push({ check: 'typescript_compiles', result });
  }

  if (config.requireTestsPass) {
    const result = await checkTestsPass(db, taskId, filePaths);
    results.push({ check: 'tests_pass', result });
  }

  // All enabled checks must pass
  const ready = results.every(({ result }) => result.passed);

  return { ready, results };
}
