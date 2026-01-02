/**
 * Suggest Hook Command
 *
 * PreToolUse hook for Task tool - manages Plan agent sessions.
 * Clears stale caches when a new Plan agent starts.
 *
 * NOTE: Template injection removed in v4.2.2 - didn't work reliably.
 * Using Skills-based template injection instead.
 *
 * Usage:
 *   echo '{"tool_input": {"subagent_type": "Plan"}}' | sqlew suggest
 *
 * @since v4.1.0
 * @modified v4.2.2 - Removed template injection, simplified to cache management
 */

import { readStdinJson, sendContinue, isPlanAgent, getProjectPath } from './stdin-parser.js';
import { clearPlanTomlCache, clearCurrentPlan } from '../../config/global-config.js';

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main suggest command entry point
 *
 * Called as PreToolUse hook when Task tool is invoked.
 * For Plan agents: clears stale caches from previous sessions.
 */
export async function suggestCommand(): Promise<void> {
  try {
    const input = await readStdinJson();

    // Only process Task tool (PreToolUse hook)
    if (input.tool_name !== 'Task') {
      sendContinue();
      return;
    }

    // Check if this is a Plan agent - clear stale caches
    if (isPlanAgent(input)) {
      const projectPath = getProjectPath(input);
      if (projectPath) {
        // Clear stale caches from previous sessions (v4.2.0+)
        // This prevents false positives in on-subagent-stop hook
        clearCurrentPlan(projectPath);
        clearPlanTomlCache(projectPath);
      }
    }

    // Continue without modification
    sendContinue();
  } catch (error) {
    // On error, log to stderr but continue execution
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sqlew suggest] Error: ${message}`);
    sendContinue();
  }
}
