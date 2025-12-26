/**
 * On-Exit-Plan Hook Command
 *
 * PostToolUse hook for ExitPlanMode - prompts TOML documentation after plan approval.
 * When a plan is approved, reminds the user to document decisions/constraints in TOML format.
 *
 * Usage:
 *   echo '{"tool_name": "ExitPlanMode"}' | sqlew on-exit-plan
 *
 * @since v4.2.0
 */

import { readStdinJson, sendContinue, getProjectPath } from './stdin-parser.js';
import { loadCurrentPlan, loadPlanTomlCache } from '../../config/global-config.js';

// ============================================================================
// TOML Template Reminder
// ============================================================================

const TOML_REMINDER = `
## 📝 Record Architectural Decisions

Before implementing, please add any key decisions to the plan using TOML format:

\`\`\`toml
[[decision]]
key = "component/topic"           # Required: hierarchical key
value = "What was decided"        # Required: the decision
status = "active"                 # active|deprecated|draft
layer = "business"                # presentation|business|data|infrastructure|cross-cutting
tags = ["tag1", "tag2"]
rationale = "Why this choice"
alternatives = ["Option B", "Option C"]
tradeoffs = "Gains vs sacrifices"

[[constraint]]
constraint_text = "Rule description"  # Required: what must be done/avoided
category = "security"             # Required: architecture|security|code-style|performance
priority = "high"                 # critical|high|medium|low
\`\`\`

Decisions will be auto-registered to sqlew on task completion.
`.trim();

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main on-exit-plan command entry point
 *
 * Called as PostToolUse hook when ExitPlanMode is invoked.
 * Checks if plan has TOML blocks, if not, prompts user to add them.
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

    // Check if current plan has TOML blocks
    const planInfo = loadCurrentPlan(projectPath);
    if (!planInfo) {
      sendContinue();
      return;
    }

    const tomlCache = loadPlanTomlCache(projectPath);
    const hasToml = tomlCache &&
      (tomlCache.decisions.length > 0 || tomlCache.constraints.length > 0);

    if (hasToml) {
      // Plan already has TOML blocks - just continue
      const summary = `[sqlew] Plan has ${tomlCache.decisions.length} decision(s), ${tomlCache.constraints.length} constraint(s)`;
      sendContinue(summary);
      return;
    }

    // No TOML blocks - prompt user to add them
    sendContinue(TOML_REMINDER);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sqlew on-exit-plan] Error: ${message}`);
    sendContinue();
  }
}
