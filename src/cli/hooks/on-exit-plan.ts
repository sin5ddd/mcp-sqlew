/**
 * On-Exit-Plan Hook Command
 *
 * PostToolUse hook for ExitPlanMode - extracts and auto-registers decisions/constraints.
 * Delegates to plan-processor.ts for actual processing.
 *
 * Usage:
 *   echo '{"tool_name": "ExitPlanMode"}' | sqlew on-exit-plan
 *
 * @since v4.2.0
 * @modified v4.2.5 - Refactored to use plan-processor.ts (DRY)
 */

import { readStdinJson, sendContinue, sendPostToolUseContext, getProjectPath } from './stdin-parser.js';
import { processPlanPatterns } from './plan-processor.js';

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main on-exit-plan command entry point
 *
 * Called as PostToolUse hook when ExitPlanMode is invoked.
 * Delegates to processPlanPatterns for extraction and registration.
 */
export async function onExitPlanCommand(): Promise<void> {
  try {
    const input = await readStdinJson();

    // Only process ExitPlanMode
    if (input.tool_name !== 'ExitPlanMode') {
      sendContinue();
      return;
    }

    const projectPath = getProjectPath(input);
    if (!projectPath) {
      sendContinue();
      return;
    }

    // Delegate to shared processor
    const result = processPlanPatterns(projectPath);

    if (!result.processed) {
      // Map skip reasons to user-friendly messages
      const messages: Record<string, string> = {
        no_active_plan: '[sqlew] No active plan tracked.',
        already_recorded: '[sqlew] Patterns already extracted.',
        plan_file_not_found: '[sqlew] Plan file not found.',
        read_error: '[sqlew] Could not read plan file.',
        no_patterns: '[sqlew] No decisions or constraints detected in plan.',
        no_valid_patterns: '[sqlew] No valid decisions or constraints found.',
      };
      sendContinue(messages[result.skipReason || ''] || '');
      return;
    }

    // Send confirmation message
    if (result.confirmationMessage) {
      sendPostToolUseContext(result.confirmationMessage);
    } else {
      sendContinue();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sqlew on-exit-plan] Error: ${message}`);
    sendContinue();
  }
}
