/**
 * On-Stop Hook Command
 *
 * Stop hook - fires when main Claude Code agent response completes.
 * Checks for tracked plan and processes TOML decisions/constraints.
 *
 * Usage:
 *   echo '{"hook_event_name": "Stop"}' | sqlew on-stop
 *
 * @since v4.2.0
 */

import { readStdinJson, sendContinue, getProjectPath, type HookInput } from './stdin-parser.js';
import {
  loadCurrentPlan,
  loadPlanTomlCache,
  savePlanTomlCache,
  type PlanTomlCache,
} from '../../config/global-config.js';
import { enqueueDecisionCreate } from '../../utils/hook-queue.js';

// ============================================================================
// TOML Decision/Constraint Processing
// ============================================================================

/**
 * Format constraint candidates as a registration prompt
 *
 * @param cache - Plan TOML cache with constraint candidates
 * @returns Formatted prompt string with MCP command examples
 */
function formatConstraintPrompt(cache: PlanTomlCache): string {
  if (cache.constraints.length === 0) {
    return '';
  }

  const lines: string[] = [
    '',
    '🎯 **Constraint Candidates Ready for Registration**',
    '',
    `Found ${cache.constraints.length} constraint candidate(s) from plan TOML:`,
    '',
  ];

  cache.constraints.forEach((c, i) => {
    const priority = c.priority || 'medium';
    lines.push(`${i + 1}. [${c.category}/${priority}] ${c.text}`);
    if (c.rationale) {
      lines.push(`   Rationale: ${c.rationale}`);
    }
  });

  lines.push('');
  lines.push('To register, use mcp__sqlew__constraint with action="add":');
  lines.push('```');

  // Show example for first constraint
  const first = cache.constraints[0];
  lines.push(`mcp__sqlew__constraint action="add" constraint_text="${first.text}" category="${first.category}" priority="${first.priority || 'medium'}"`);

  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

/**
 * Process TOML decisions and constraints from plan cache
 *
 * @param projectPath - Project root path
 * @param cache - Plan TOML cache
 * @returns Context message with results
 */
function processPlanTomlCache(projectPath: string, cache: PlanTomlCache): string {
  const messages: string[] = [];

  // Auto-register decisions (queued for MCP server processing)
  if (!cache.decisions_registered && cache.decisions.length > 0) {
    for (const d of cache.decisions) {
      enqueueDecisionCreate(projectPath, {
        key: d.key,
        value: d.value,
        status: d.status || 'active',
        layer: d.layer || 'cross-cutting',
        tags: d.tags || [],
      });
    }
    cache.decisions_registered = true;
    messages.push(`✅ Registered ${cache.decisions.length} decision(s) to queue`);
  }

  // Prompt for constraints (user decision required)
  if (!cache.constraints_prompted && cache.constraints.length > 0) {
    messages.push(formatConstraintPrompt(cache));
    cache.constraints_prompted = true;
  }

  // Save updated cache
  if (cache.decisions_registered || cache.constraints_prompted) {
    savePlanTomlCache(projectPath, cache);
  }

  return messages.join('\n');
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main on-stop command entry point
 *
 * Called as Stop hook when main agent response completes.
 * Processes TOML decisions/constraints if a plan is being tracked.
 */
export async function onStopCommand(): Promise<void> {
  try {
    const input = await readStdinJson();

    // Check stop_hook_active to prevent infinite loops
    if (isStopHookActive(input)) {
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
      // No plan being tracked
      sendContinue();
      return;
    }

    // Only process if the plan has been recorded (implementation in progress)
    if (!planInfo.recorded) {
      sendContinue();
      return;
    }

    // Process TOML decisions and constraints
    const tomlCache = loadPlanTomlCache(projectPath);
    if (tomlCache && tomlCache.plan_id === planInfo.plan_id) {
      const tomlContext = processPlanTomlCache(projectPath, tomlCache);
      if (tomlContext) {
        sendContinue(tomlContext);
        return;
      }
    }

    sendContinue();
  } catch (error) {
    // On error, log to stderr but continue execution
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sqlew on-stop] Error: ${message}`);
    sendContinue();
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if stop hook is already active (infinite loop prevention)
 *
 * @param input - Hook input
 * @returns true if stop hook is already active
 */
function isStopHookActive(input: HookInput): boolean {
  // stop_hook_active is set by Claude Code when a Stop/SubagentStop hook
  // is already in progress, to prevent infinite loops
  return input.stop_hook_active === true;
}
