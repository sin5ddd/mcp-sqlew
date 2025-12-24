/**
 * Check Completion Hook Command
 *
 * PostToolUse hook for TodoWrite tool - checks if all tasks are completed.
 * When all todos are completed, updates the decision status to "in_review".
 *
 * Usage:
 *   echo '{"tool_input": {"todos": [...]}}' | sqlew check-completion
 *
 * @since v4.1.0
 */

import { readStdinJson, sendContinue, areAllTodosCompleted, getProjectPath } from './stdin-parser.js';
import { loadCurrentPlan } from '../../config/global-config.js';
import { initializeDatabase } from '../../database.js';
import { setDecision } from '../../tools/context/actions/set.js';
import { join } from 'path';

// ============================================================================
// Constants
// ============================================================================

/** Decision key prefix for plan-based decisions */
const PLAN_DECISION_PREFIX = 'plan/implementation';

/** Status for in-review decisions (using 'active' as DB only supports active/deprecated/draft) */
const IN_REVIEW_STATUS = 'active' as const;

/** Workflow tag for in-review state */
const WORKFLOW_TAG_IN_REVIEW = 'workflow:in_review';

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main check-completion command entry point
 *
 * Called as PostToolUse hook when TodoWrite tool completes.
 * Updates decision to in_review when all todos are completed.
 */
export async function checkCompletionCommand(): Promise<void> {
  try {
    const input = await readStdinJson();

    // Only process TodoWrite tool
    if (input.tool_name !== 'TodoWrite') {
      sendContinue();
      return;
    }

    // Check if all todos are completed
    if (!areAllTodosCompleted(input)) {
      // Not all completed - continue without action
      sendContinue();
      return;
    }

    const projectPath = getProjectPath(input);
    if (!projectPath) {
      sendContinue();
      return;
    }

    // Check if there's a current plan being tracked
    const planInfo = loadCurrentPlan(projectPath);
    if (!planInfo) {
      // No plan being tracked - continue without action
      sendContinue();
      return;
    }

    // Only update if the decision was recorded
    if (!planInfo.recorded) {
      sendContinue();
      return;
    }

    // Initialize database
    const dbPath = join(projectPath, '.sqlew', 'sqlew.db');
    try {
      await initializeDatabase({ configPath: dbPath });
    } catch {
      // Database not initialized - continue without updating
      sendContinue();
      return;
    }

    // Build decision key from plan file name
    const planName = planInfo.plan_file.replace(/\.md$/, '');
    const decisionKey = `${PLAN_DECISION_PREFIX}/${planName}`;

    // Update decision status to active (in_review tracked via tag)
    try {
      await setDecision({
        key: decisionKey,
        value: `All tasks completed for plan: ${planInfo.plan_file}`,
        status: IN_REVIEW_STATUS,
        layer: 'cross-cutting',
        tags: ['plan', 'implementation', WORKFLOW_TAG_IN_REVIEW, planInfo.plan_id.slice(0, 8)],
      });

      sendContinue(
        `[sqlew] All tasks completed! Decision updated to status: ${IN_REVIEW_STATUS}`
      );
    } catch (error) {
      // Log error but continue
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[sqlew check-completion] Error updating decision: ${message}`);
      sendContinue();
    }
  } catch (error) {
    // On error, log to stderr but continue execution
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sqlew check-completion] Error: ${message}`);
    sendContinue();
  }
}
