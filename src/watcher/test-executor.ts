/**
 * Test Executor - Runs acceptance criteria checks for tasks
 * Supports multiple check types: tests_pass, code_removed, code_contains, file_exists
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync } from 'fs';
import { AcceptanceCheck } from '../types.js';

const execAsync = promisify(exec);

/**
 * Result of executing an acceptance check
 */
export interface CheckResult {
  success: boolean;
  message: string;
  details?: string;
}

/**
 * Execute all acceptance checks for a task
 * @param checks - Array of acceptance check definitions
 * @returns Object with overall success status and individual results
 */
export async function executeAcceptanceCriteria(
  checks: AcceptanceCheck[]
): Promise<{ allPassed: boolean; results: CheckResult[] }> {
  const results: CheckResult[] = [];

  for (const check of checks) {
    let result: CheckResult;

    try {
      switch (check.type) {
        case 'tests_pass':
          result = await executeTestsPass(check);
          break;
        case 'code_removed':
          result = executeCodeRemoved(check);
          break;
        case 'code_contains':
          result = executeCodeContains(check);
          break;
        case 'file_exists':
          result = executeFileExists(check);
          break;
        default:
          result = {
            success: false,
            message: `Unknown check type: ${(check as any).type}`
          };
      }
    } catch (error) {
      result = {
        success: false,
        message: `Error executing check: ${error instanceof Error ? error.message : String(error)}`
      };
    }

    results.push(result);
  }

  const allPassed = results.every(r => r.success);

  return { allPassed, results };
}

/**
 * Execute a shell command and check if it passes
 * Check type: tests_pass
 */
async function executeTestsPass(check: AcceptanceCheck): Promise<CheckResult> {
  if (!check.command) {
    return {
      success: false,
      message: 'tests_pass check requires "command" parameter'
    };
  }

  const timeout = check.timeout || 60; // Default 60s timeout

  try {
    const { stdout, stderr } = await execAsync(check.command, {
      timeout: timeout * 1000,
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });

    const output = stdout + stderr;

    // If expected_pattern specified, check for it in output
    if (check.expected_pattern) {
      const regex = new RegExp(check.expected_pattern);
      if (regex.test(output)) {
        return {
          success: true,
          message: `Command succeeded and output matches pattern "${check.expected_pattern}"`,
          details: output.slice(0, 500) // First 500 chars
        };
      } else {
        return {
          success: false,
          message: `Command succeeded but output does not match pattern "${check.expected_pattern}"`,
          details: output.slice(0, 500)
        };
      }
    }

    // No pattern specified, success if command exits with code 0
    return {
      success: true,
      message: `Command "${check.command}" executed successfully`,
      details: output.slice(0, 500)
    };

  } catch (error: any) {
    // Command failed or timed out
    const output = (error.stdout || '') + (error.stderr || '');
    return {
      success: false,
      message: error.killed
        ? `Command "${check.command}" timed out after ${timeout}s`
        : `Command "${check.command}" failed with exit code ${error.code || 'unknown'}`,
      details: output.slice(0, 500)
    };
  }
}

/**
 * Check if code pattern has been removed from file
 * Check type: code_removed
 */
function executeCodeRemoved(check: AcceptanceCheck): CheckResult {
  if (!check.file) {
    return {
      success: false,
      message: 'code_removed check requires "file" parameter'
    };
  }

  if (!check.pattern) {
    return {
      success: false,
      message: 'code_removed check requires "pattern" parameter'
    };
  }

  if (!existsSync(check.file)) {
    // File doesn't exist - pattern is definitely removed!
    return {
      success: true,
      message: `File "${check.file}" does not exist (pattern removed)`
    };
  }

  try {
    const content = readFileSync(check.file, 'utf-8');
    const regex = new RegExp(check.pattern);

    if (!regex.test(content)) {
      return {
        success: true,
        message: `Pattern "${check.pattern}" not found in "${check.file}" (removed)`
      };
    } else {
      const match = content.match(regex);
      return {
        success: false,
        message: `Pattern "${check.pattern}" still exists in "${check.file}"`,
        details: match ? `Found: ${match[0].slice(0, 100)}` : undefined
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Error reading file "${check.file}": ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Check if code pattern exists in file
 * Check type: code_contains
 */
function executeCodeContains(check: AcceptanceCheck): CheckResult {
  if (!check.file) {
    return {
      success: false,
      message: 'code_contains check requires "file" parameter'
    };
  }

  if (!check.pattern) {
    return {
      success: false,
      message: 'code_contains check requires "pattern" parameter'
    };
  }

  if (!existsSync(check.file)) {
    return {
      success: false,
      message: `File "${check.file}" does not exist`
    };
  }

  try {
    const content = readFileSync(check.file, 'utf-8');
    const regex = new RegExp(check.pattern);

    if (regex.test(content)) {
      const match = content.match(regex);
      return {
        success: true,
        message: `Pattern "${check.pattern}" found in "${check.file}"`,
        details: match ? `Match: ${match[0].slice(0, 100)}` : undefined
      };
    } else {
      return {
        success: false,
        message: `Pattern "${check.pattern}" not found in "${check.file}"`
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Error reading file "${check.file}": ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Check if file exists
 * Check type: file_exists
 */
function executeFileExists(check: AcceptanceCheck): CheckResult {
  if (!check.file) {
    return {
      success: false,
      message: 'file_exists check requires "file" parameter'
    };
  }

  if (existsSync(check.file)) {
    return {
      success: true,
      message: `File "${check.file}" exists`
    };
  } else {
    return {
      success: false,
      message: `File "${check.file}" does not exist`
    };
  }
}
