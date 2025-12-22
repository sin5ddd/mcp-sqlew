/**
 * Save Hook Command
 *
 * PostToolUse hook for Edit|Write tools - saves decision when code is edited.
 * Only saves when a plan is being tracked (via track-plan).
 * Uses plan_id + timestamp for uniqueness - skips if already recorded.
 *
 * Usage:
 *   echo '{"tool_input": {"file_path": "src/foo.ts"}}' | sqlew save
 *
 * @since v4.1.0
 */

import { readStdinJson, sendContinue, isPlanFile, getProjectPath } from './stdin-parser.js';
import { loadCurrentPlan, saveCurrentPlan, type CurrentPlanInfo } from '../../config/global-config.js';
import { initializeDatabase } from '../../database.js';
import { quickSetDecision } from '../../tools/context/actions/quick-set.js';
import { join } from 'path';

// ============================================================================
// Constants
// ============================================================================

/** Decision key prefix for plan-based decisions */
const PLAN_DECISION_PREFIX = 'plan/implementation';

/** Status for in-progress decisions (using 'draft' as DB only supports active/deprecated/draft) */
const IN_PROGRESS_STATUS = 'draft' as const;

/** Workflow tag for in-progress state */
const WORKFLOW_TAG_IN_PROGRESS = 'workflow:in_progress';

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main save command entry point
 *
 * Called as PostToolUse hook when Edit or Write tool completes.
 * Saves a decision if a plan is currently being tracked.
 */
export async function saveCommand(): Promise<void> {
  try {
    const input = await readStdinJson();

    // Only process Edit and Write tools
    const toolName = input.tool_name;
    if (toolName !== 'Edit' && toolName !== 'Write') {
      sendContinue();
      return;
    }

    // Skip plan files themselves - we don't want to record editing the plan
    if (isPlanFile(input)) {
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

    // Check if already recorded for this plan
    if (planInfo.recorded) {
      // Already recorded - no need to record again
      sendContinue();
      return;
    }

    // Initialize database
    const dbPath = join(projectPath, '.sqlew', 'sqlew.db');
    try {
      await initializeDatabase({ configPath: dbPath });
    } catch {
      // Database not initialized - continue without saving
      sendContinue();
      return;
    }

    // Build decision key from plan file name
    const planName = planInfo.plan_file.replace(/\.md$/, '');
    const decisionKey = `${PLAN_DECISION_PREFIX}/${planName}`;

    // Get file path being edited for context
    const filePath = input.tool_input?.file_path || 'unknown';

    // Save decision with draft status (in_progress tracked via tag)
    try {
      await quickSetDecision({
        key: decisionKey,
        value: `Implementation started for plan: ${planInfo.plan_file}`,
        status: IN_PROGRESS_STATUS,
        layer: 'cross-cutting',
        tags: ['plan', 'implementation', WORKFLOW_TAG_IN_PROGRESS, planInfo.plan_id.slice(0, 8)],
      });

      // Mark plan as recorded
      const updatedInfo: CurrentPlanInfo = {
        ...planInfo,
        recorded: true,
        plan_updated_at: new Date().toISOString(),
      };
      saveCurrentPlan(projectPath, updatedInfo);

      sendContinue(
        `[sqlew] Decision recorded for plan: ${planInfo.plan_file} (status: ${IN_PROGRESS_STATUS})`
      );
    } catch (error) {
      // Decision might already exist - that's OK
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('already exists') || message.includes('duplicate')) {
        // Mark as recorded anyway
        const updatedInfo: CurrentPlanInfo = {
          ...planInfo,
          recorded: true,
        };
        saveCurrentPlan(projectPath, updatedInfo);
        sendContinue();
      } else {
        console.error(`[sqlew save] Error saving decision: ${message}`);
        sendContinue();
      }
    }
  } catch (error) {
    // On error, log to stderr but continue execution
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sqlew save] Error: ${message}`);
    sendContinue();
  }
}
