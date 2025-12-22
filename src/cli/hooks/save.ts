/**
 * Save Hook Command
 *
 * PostToolUse hook for Edit|Write tools - updates decision status when code is edited.
 * When code editing starts, updates the plan's decision from draft to in_progress.
 *
 * Usage:
 *   echo '{"tool_input": {"file_path": "src/foo.ts"}}' | sqlew save
 *
 * @since v4.1.0
 */

import { readStdinJson, sendContinue, isPlanFile, getProjectPath } from './stdin-parser.js';
import { loadCurrentPlan, saveCurrentPlan, type CurrentPlanInfo } from '../../config/global-config.js';
import { initializeDatabase, getAdapter } from '../../database.js';
import { setDecision } from '../../tools/context/actions/set.js';
import { ProjectContext } from '../../utils/project-context.js';
import { join, basename } from 'path';

// ============================================================================
// Constants
// ============================================================================

/** Decision key prefix for plan-based decisions */
const PLAN_DECISION_PREFIX = 'plan/implementation';

/** Status for in-progress decisions */
const IN_PROGRESS_STATUS = 'in_progress' as const;

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

    // Initialize ProjectContext (required for decision operations)
    try {
      const adapter = getAdapter();
      const knex = adapter.getKnex();
      const projectName = basename(projectPath);
      const projectContext = ProjectContext.getInstance();
      await projectContext.ensureProject(knex, projectName, 'cli', {
        projectRootPath: projectPath,
      });
    } catch {
      // ProjectContext initialization failed - continue without saving
      sendContinue();
      return;
    }

    // Build decision key from plan file name
    const planName = planInfo.plan_file.replace(/\.md$/, '');
    const decisionKey = `${PLAN_DECISION_PREFIX}/${planName}`;

    // Update decision status from draft to in_progress
    try {
      await setDecision({
        key: decisionKey,
        value: `Implementation in progress for plan: ${planInfo.plan_file}`,
        status: IN_PROGRESS_STATUS,
        layer: 'cross-cutting',
        tags: ['plan', 'implementation', 'in_progress', planInfo.plan_id.slice(0, 8)],
      });

      // Mark plan as recorded (status updated to in_progress)
      const updatedInfo: CurrentPlanInfo = {
        ...planInfo,
        recorded: true,
        plan_updated_at: new Date().toISOString(),
      };
      saveCurrentPlan(projectPath, updatedInfo);

      sendContinue(
        `[sqlew] Decision updated to in_progress for plan: ${planInfo.plan_file}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[sqlew save] Error updating decision: ${message}`);
      sendContinue();
    }
  } catch (error) {
    // On error, log to stderr but continue execution
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sqlew save] Error: ${message}`);
    sendContinue();
  }
}
