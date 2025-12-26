/**
 * Track Plan Hook Command
 *
 * PreToolUse hook for Write tool - tracks plan files.
 * When a .claude/plans/*.md file is being written:
 * 1. Ensures plan has sqlew-plan-id in YAML frontmatter
 * 2. Saves current plan info to session cache
 *
 * Usage:
 *   echo '{"tool_input": {"file_path": ".claude/plans/my-plan.md"}}' | sqlew track-plan
 *
 * @since v4.1.0
 */

import { readStdinJson, sendContinue, isPlanFile, getProjectPath } from './stdin-parser.js';
import { ensurePlanId, extractPlanFileName, getPlanId, parseFrontmatter, generatePlanId } from './plan-id-utils.js';
import { parsePlanToml } from './plan-toml-parser.js';
import {
  saveCurrentPlan,
  loadCurrentPlan,
  savePlanTomlCache,
  loadPlanTomlCache,
  clearPlanTomlCache,
  type CurrentPlanInfo,
  type PlanTomlCache,
} from '../../config/global-config.js';
import { enqueueDecisionCreate } from '../../utils/hook-queue.js';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

// ============================================================================
// Constants
// ============================================================================

/** Decision key prefix for plan-based decisions */
const PLAN_DECISION_PREFIX = 'plan/implementation';

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main track-plan command entry point
 *
 * Called as PreToolUse hook when Write tool is invoked.
 * Only processes .claude/plans/*.md files.
 */
export async function trackPlanCommand(): Promise<void> {
  try {
    const input = await readStdinJson();

    // Only process plan files
    if (!isPlanFile(input)) {
      // Not a plan file - continue without action
      sendContinue();
      return;
    }

    const projectPath = getProjectPath(input);
    if (!projectPath) {
      // No project path - continue without action
      sendContinue();
      return;
    }

    const filePath = input.tool_input?.file_path;
    if (!filePath) {
      sendContinue();
      return;
    }

    // Resolve absolute path
    const absolutePath = resolve(projectPath, filePath);

    // Check if file exists (it might be a new file being created)
    if (!existsSync(absolutePath)) {
      // File doesn't exist yet - this is PreToolUse for new file creation
      // Try to extract plan_id from the content being written (tool_input.content)
      const content = input.tool_input?.content as string | undefined;
      if (!content) {
        // No content to parse - continue without action
        sendContinue(
          `[sqlew] New plan file detected: ${extractPlanFileName(absolutePath)}. ` +
          `No content provided, skipping tracking.`
        );
        return;
      }

      // Parse frontmatter from content being written
      const frontmatter = parseFrontmatter(content);
      let planId = frontmatter.data['sqlew-plan-id'];

      // Generate new plan ID if not present in content
      if (!planId) {
        planId = generatePlanId();
      }

      const planFileName = extractPlanFileName(absolutePath);

      // Clear old plan-toml cache if switching to a different plan (v4.2.0+)
      const oldTomlCache = loadPlanTomlCache(projectPath);
      if (oldTomlCache && oldTomlCache.plan_id !== planId) {
        clearPlanTomlCache(projectPath);
      }

      // Save current plan info to session cache
      const planInfo: CurrentPlanInfo = {
        plan_id: planId,
        plan_file: planFileName,
        plan_updated_at: new Date().toISOString(),
        recorded: false,
        decision_pending: true,
      };

      saveCurrentPlan(projectPath, planInfo);

      // Parse TOML blocks for decisions and constraints (v4.2.0+)
      const { decisions, constraints } = parsePlanToml(content);
      if (decisions.length > 0 || constraints.length > 0) {
        const tomlCache: PlanTomlCache = {
          plan_id: planId,
          decisions,
          constraints,
          updated_at: new Date().toISOString(),
          decisions_registered: false,
          constraints_prompted: false,
        };
        savePlanTomlCache(projectPath, tomlCache);
      }

      // Enqueue draft decision for later processing by MCP server
      const decisionKey = `${PLAN_DECISION_PREFIX}/${planFileName.replace(/\.md$/, '')}`;
      enqueueDecisionCreate(projectPath, {
        key: decisionKey,
        value: `Plan created: ${planFileName}`,
        status: 'draft',
        layer: 'cross-cutting',
        tags: ['plan', 'draft', planId.slice(0, 8)],
      });

      // Continue with context about the tracked plan
      sendContinue(
        `[sqlew] Tracking new plan: ${planFileName} (ID: ${planId.slice(0, 8)}...)`
      );
      return;
    }

    // Ensure plan has an ID (creates one if missing)
    const planId = ensurePlanId(absolutePath);
    const planFileName = extractPlanFileName(absolutePath);

    // Check if we already have cached info for this plan
    const existingPlan = loadCurrentPlan(projectPath);
    const isNewPlan = !existingPlan || existingPlan.plan_id !== planId;

    // Clear old plan-toml cache if switching to a different plan (v4.2.0+)
    if (isNewPlan) {
      const oldTomlCache = loadPlanTomlCache(projectPath);
      if (oldTomlCache && oldTomlCache.plan_id !== planId) {
        clearPlanTomlCache(projectPath);
      }
    }

    // Save current plan info to session cache
    const planInfo: CurrentPlanInfo = {
      plan_id: planId,
      plan_file: planFileName,
      plan_updated_at: new Date().toISOString(),
      recorded: existingPlan?.recorded ?? false,
      decision_pending: isNewPlan ? true : (existingPlan?.decision_pending ?? false),
    };

    saveCurrentPlan(projectPath, planInfo);

    // Parse TOML blocks for decisions and constraints (v4.2.0+)
    const planContent = readFileSync(absolutePath, 'utf-8');
    const { decisions, constraints } = parsePlanToml(planContent);
    if (decisions.length > 0 || constraints.length > 0) {
      const tomlCache: PlanTomlCache = {
        plan_id: planId,
        decisions,
        constraints,
        updated_at: new Date().toISOString(),
        decisions_registered: false,
        constraints_prompted: false,
      };
      savePlanTomlCache(projectPath, tomlCache);
    }

    // Enqueue draft decision for new plans
    if (isNewPlan) {
      const decisionKey = `${PLAN_DECISION_PREFIX}/${planFileName.replace(/\.md$/, '')}`;
      enqueueDecisionCreate(projectPath, {
        key: decisionKey,
        value: `Plan created: ${planFileName}`,
        status: 'draft',
        layer: 'cross-cutting',
        tags: ['plan', 'draft', planId.slice(0, 8)],
      });
    }

    // Build context message
    let contextMsg = `[sqlew] Tracking plan: ${planFileName} (ID: ${planId.slice(0, 8)}...)`;
    if (decisions.length > 0 || constraints.length > 0) {
      contextMsg += ` | Parsed: ${decisions.length} decision(s), ${constraints.length} constraint(s)`;
    }

    // Continue with context about the tracked plan
    sendContinue(contextMsg);
  } catch (error) {
    // On error, log to stderr but continue execution
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sqlew track-plan] Error: ${message}`);
    sendContinue();
  }
}

/**
 * Check if a plan is currently being tracked for a project
 *
 * @param projectPath - Project root path
 * @returns Current plan info or null
 */
export function getCurrentTrackedPlan(projectPath: string): CurrentPlanInfo | null {
  const { loadCurrentPlan } = require('../../config/global-config.js');
  return loadCurrentPlan(projectPath);
}

/**
 * Get plan ID from a file path (convenience wrapper)
 *
 * @param filePath - Path to plan file
 * @returns Plan ID or null
 */
export function getPlanIdFromFile(filePath: string): string | null {
  return getPlanId(filePath);
}
