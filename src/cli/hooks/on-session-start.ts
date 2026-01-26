/**
 * On-Session-Start Hook Command
 *
 * SessionStart hook - handles session start events.
 * When source is "clear", triggers Plan-to-ADR processing for cached plans
 * that weren't processed by PostToolUse:ExitPlanMode (due to session clear).
 *
 * This fixes the issue where "Yes, clear context and auto-accept edits"
 * selection skips PostToolUse:ExitPlanMode hook.
 *
 * Usage:
 *   echo '{"hook_event_name": "SessionStart", "source": "clear", "cwd": "/path"}' | sqlew on-session-start
 *
 * @since v5.0.0
 */

import { readStdinJson, sendContinue, getProjectPath } from './stdin-parser.js';
import { processPlanPatterns } from './plan-processor.js';
import { loadCurrentPlan, clearCurrentPlan } from '../../config/global-config.js';

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main on-session-start command entry point
 *
 * Called as SessionStart hook when a new session begins.
 * Only processes "clear" source to handle Plan-to-ADR for cached plans.
 */
export async function onSessionStartCommand(): Promise<void> {
  try {
    const input = await readStdinJson();

    // Only process "clear" source (Plan mode with "clear context" approval)
    if (input.source !== 'clear') {
      sendContinue();
      return;
    }

    const projectPath = getProjectPath(input);
    if (!projectPath) {
      sendContinue();
      return;
    }

    // Check if there's a cached plan waiting to be processed
    const cachedPlan = loadCurrentPlan(projectPath);
    if (!cachedPlan) {
      // No cached plan - nothing to process
      sendContinue();
      return;
    }

    // Skip if already recorded (shouldn't happen, but safety check)
    if (cachedPlan.recorded) {
      clearCurrentPlan(projectPath);
      sendContinue();
      return;
    }

    // Process the cached plan (extract patterns and queue to pending.json)
    const result = processPlanPatterns(projectPath);

    // Clear cache after processing (regardless of result)
    clearCurrentPlan(projectPath);

    if (result.processed && result.confirmationMessage) {
      // Log confirmation to stderr (visible in debug logs)
      console.error(`[sqlew on-session-start] ${result.confirmationMessage}`);
    }

    sendContinue();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sqlew on-session-start] Error: ${message}`);
    sendContinue();
  }
}
