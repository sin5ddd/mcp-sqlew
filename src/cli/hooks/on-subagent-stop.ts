/**
 * On-Subagent-Stop Hook Command
 *
 * SubagentStop hook - fires when any subagent (Plan, Explore, etc.) completes.
 * When a Plan agent completes and has a pending decision, enqueues status update.
 *
 * Usage:
 *   echo '{"hook_event_name": "SubagentStop"}' | sqlew on-subagent-stop
 *
 * @since v4.2.0
 */

import { readStdinJson, sendContinue, getProjectPath, type HookInput } from './stdin-parser.js';
import { loadCurrentPlan, saveCurrentPlan, type CurrentPlanInfo } from '../../config/global-config.js';
import { enqueueDecisionUpdate } from '../../utils/hook-queue.js';

// ============================================================================
// Constants
// ============================================================================

/** Decision key prefix for plan-based decisions */
const PLAN_DECISION_PREFIX = 'plan/implementation';

/** Status for in-progress decisions */
const IN_PROGRESS_STATUS = 'in_progress' as const;

/** Maximum age for plan cache to be considered valid (30 minutes in ms) */
const MAX_PLAN_CACHE_AGE_MS = 30 * 60 * 1000;

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main on-subagent-stop command entry point
 *
 * Called as SubagentStop hook when any subagent completes.
 * Checks session cache for pending plan decision and enqueues update.
 */
export async function onSubagentStopCommand(): Promise<void> {
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

    // Check if there's a current plan with pending decision
    const planInfo = loadCurrentPlan(projectPath);
    if (!planInfo || !planInfo.decision_pending) {
      // No plan being tracked or no pending decision
      sendContinue();
      return;
    }

    // Check if already recorded
    if (planInfo.recorded) {
      sendContinue();
      return;
    }

    // Check if plan cache is stale (older than 30 minutes)
    // This prevents false positives from old session caches
    if (isPlanCacheStale(planInfo)) {
      // Stale cache - clear it and continue
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
      `[sqlew] Plan agent completed. Queued decision update for: ${planInfo.plan_file}`
    );
  } catch (error) {
    // On error, log to stderr but continue execution
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sqlew on-subagent-stop] Error: ${message}`);
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

/**
 * Check if plan cache is stale (older than MAX_PLAN_CACHE_AGE_MS)
 *
 * Prevents false positives from old session caches that persist
 * across Claude Code restarts.
 *
 * @param planInfo - Current plan info from cache
 * @returns true if cache is stale and should be ignored
 */
function isPlanCacheStale(planInfo: CurrentPlanInfo): boolean {
  if (!planInfo.plan_updated_at) {
    // No timestamp - consider stale for safety
    return true;
  }

  try {
    const updatedAt = new Date(planInfo.plan_updated_at).getTime();
    const now = Date.now();
    const age = now - updatedAt;

    return age > MAX_PLAN_CACHE_AGE_MS;
  } catch {
    // Invalid date format - consider stale
    return true;
  }
}
