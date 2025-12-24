/**
 * Save Hook Command
 *
 * PostToolUse hook for ExitPlanMode - enqueues decision status update.
 * When plan mode exits, enqueues update from draft to in_progress.
 * Actual DB operations happen when MCP server processes the queue.
 *
 * Usage:
 *   echo '{"tool_name": "ExitPlanMode"}' | sqlew save
 *
 * @since v4.1.0
 * @updated v4.1.0 - Changed trigger from Edit|Write to ExitPlanMode only (zero delay on code edits)
 * @updated v4.1.0 - File queue architecture (no DB operations in hooks)
 */

import { readStdinJson, sendContinue, getProjectPath } from './stdin-parser.js';
import { loadCurrentPlan, saveCurrentPlan, type CurrentPlanInfo } from '../../config/global-config.js';
import { enqueueDecisionUpdate } from '../../utils/hook-queue.js';

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
 * Called as PostToolUse hook when ExitPlanMode completes.
 * Enqueues decision status update if a plan is being tracked.
 * No DB operations - fast execution (<100ms).
 */
export async function saveCommand(): Promise<void> {
  try {
    const input = await readStdinJson();

    // Only process ExitPlanMode tool
    const toolName = input.tool_name;
    if (toolName !== 'ExitPlanMode') {
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

    // Build decision key from plan file name
    const planName = planInfo.plan_file.replace(/\.md$/, '');
    const decisionKey = `${PLAN_DECISION_PREFIX}/${planName}`;

    // Enqueue status update (no DB operations here)
    enqueueDecisionUpdate(projectPath, {
      key: decisionKey,
      value: `Implementation in progress for plan: ${planInfo.plan_file}`,
      status: IN_PROGRESS_STATUS,
      layer: 'cross-cutting',
      tags: ['plan', 'implementation', 'active', planInfo.plan_id.slice(0, 8)],
    });

    // Mark plan as recorded
    const updatedInfo: CurrentPlanInfo = {
      ...planInfo,
      recorded: true,
      decision_pending: false,
      plan_updated_at: new Date().toISOString(),
    };
    saveCurrentPlan(projectPath, updatedInfo);

    sendContinue(
      `[sqlew] Queued decision update for plan: ${planInfo.plan_file} (will process on MCP startup)`
    );
  } catch (error) {
    // On error, log to stderr but continue execution
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sqlew save] Error: ${message}`);
    sendContinue();
  }
}
