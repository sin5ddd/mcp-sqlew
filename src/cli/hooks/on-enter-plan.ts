/**
 * On-Enter-Plan Hook Command
 *
 * PostToolUse hook for EnterPlanMode - clears stale caches when plan mode starts.
 *
 * NOTE: Template injection removed in v4.2.2.
 * Using Skills-based template injection instead (sqlew-decision-format skill).
 *
 * Usage:
 *   echo '{"tool_name": "EnterPlanMode"}' | sqlew on-enter-plan
 *
 * @since v4.2.0
 * @modified v4.2.2 - Removed template injection, simplified to cache management
 */

import { readStdinJson, sendContinue, getProjectPath } from './stdin-parser.js';
import { clearCurrentPlan, clearPlanCache } from '../../config/global-config.js';

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main on-enter-plan command entry point
 *
 * Called as PostToolUse hook when EnterPlanMode is invoked.
 * Clears stale caches from previous sessions.
 */
export async function onEnterPlanCommand(): Promise<void> {
  try {
    const input = await readStdinJson();

    // Only process EnterPlanMode
    if (input.tool_name !== 'EnterPlanMode') {
      sendContinue();
      return;
    }

    const projectPath = getProjectPath(input);
    if (projectPath) {
      // Clear stale caches from previous sessions
      // This ensures fresh start for new plan mode session
      clearCurrentPlan(projectPath);
      clearPlanCache(projectPath);
    }

    // Continue without additional context
    // Skills will handle template injection
    sendContinue();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sqlew on-enter-plan] Error: ${message}`);
    sendContinue();
  }
}
