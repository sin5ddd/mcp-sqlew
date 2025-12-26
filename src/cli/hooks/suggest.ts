/**
 * Suggest Hook Command
 *
 * PreToolUse hook for Task tool - suggests related decisions.
 * Extracts keywords from task description/prompt and finds related decisions.
 *
 * Usage:
 *   echo '{"tool_input": {"description": "implement auth"}}' | sqlew suggest
 *
 * @since v4.1.0
 */

import { readStdinJson, sendContinue, sendUpdatedInput, isPlanAgent, getProjectPath } from './stdin-parser.js';
import { clearPlanTomlCache, clearCurrentPlan } from '../../config/global-config.js';

// ============================================================================
// Plan TOML Template (v4.2.0+)
// ============================================================================

/**
 * TOML template for Plan agent
 * Injected when Plan agent is invoked to guide structured decision/constraint documentation
 */
const PLAN_TOML_TEMPLATE = `
## Architectural Decisions & Constraints

When making architectural choices in this plan, document them using TOML format:

\`\`\`toml
# Record key decisions made during planning
[[decision]]
key = "component/topic"           # Required: hierarchical key
value = "What was decided"        # Required: the decision
status = "active"                 # active|deprecated|draft
layer = "business"                # presentation|business|data|infrastructure|cross-cutting
tags = ["tag1", "tag2"]
rationale = "Why this choice"
alternatives = ["Option B", "Option C"]
tradeoffs = "Gains vs sacrifices"

# Define constraints to enforce decisions
[[constraint]]
constraint_text = "Rule description"  # Required: what must be done/avoided
category = "security"             # Required: architecture|security|code-style|performance
priority = "high"                 # critical|high|medium|low
layer = "business"
tags = ["tag1"]
rationale = "Why this rule exists"
\`\`\`

Note: Decisions will be auto-registered on task completion. Constraints will prompt for confirmation.
`.trim();

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main suggest command entry point
 *
 * Called as PreToolUse hook when Task tool is invoked.
 * Finds related decisions and injects them as context.
 */
export async function suggestCommand(): Promise<void> {
  try {
    const input = await readStdinJson();

    // Only process Task tool (PreToolUse hook)
    if (input.tool_name !== 'Task') {
      sendContinue();
      return;
    }

    // Check if this is a Plan agent via Task tool - inject TOML template via updatedInput
    // This modifies the Task tool's prompt to include the TOML template
    if (isPlanAgent(input)) {
      // Clear stale caches from previous sessions (v4.2.0+)
      // This prevents false positives in on-subagent-stop hook
      const projectPath = getProjectPath(input);
      if (projectPath) {
        clearCurrentPlan(projectPath);
        clearPlanTomlCache(projectPath);
      }

      const originalPrompt = input.tool_input?.prompt || '';
      const enrichedPrompt = `${originalPrompt}\n\n---\n\n${PLAN_TOML_TEMPLATE}`;

      sendUpdatedInput(input.tool_input || {}, {
        prompt: enrichedPrompt,
      });
      return;
    }

    // Non-Plan agents (Explore, etc.) - skip DB connection for performance (v4.2.0+)
    // Only Plan agents need sqlew context injection
    sendContinue();
  } catch (error) {
    // On error, log to stderr but continue execution
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sqlew suggest] Error: ${message}`);
    sendContinue();
  }
}
