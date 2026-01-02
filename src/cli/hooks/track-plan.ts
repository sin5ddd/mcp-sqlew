/**
 * Track Plan Hook Command
 *
 * PreToolUse hook for Write tool - tracks plan files.
 * When a .claude/plans/*.md file is being written:
 * 1. Ensures plan has sqlew-plan-id in YAML frontmatter
 * 2. Saves current plan info to session cache
 *
 * NOTE: Decision/constraint extraction moved to on-exit-plan.ts (v4.2.2)
 * Uses pattern matching instead of LLM extraction.
 *
 * Usage:
 *   echo '{"tool_input": {"file_path": ".claude/plans/my-plan.md"}}' | sqlew track-plan
 *
 * @since v4.1.0
 * @modified v4.2.2 - Removed LLM extraction, simplified to plan tracking only
 */

import { readStdinJson, sendContinue, isPlanFile, getProjectPath } from './stdin-parser.js';
import { extractPlanFileName, parseFrontmatter, generatePlanId, getPlanId } from './plan-id-utils.js';
import {
  saveCurrentPlan,
  loadCurrentPlan,
  clearPlanTomlCache,
  type CurrentPlanInfo,
} from '../../config/global-config.js';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main track-plan command entry point
 *
 * Called as PreToolUse hook when Write tool is invoked.
 * Only processes .claude/plans/*.md files.
 *
 * v4.2.2: Simplified to plan tracking only. Pattern extraction happens in on-exit-plan.
 */
export async function trackPlanCommand(): Promise<void> {
  try {
    const input = await readStdinJson();

    // Only process plan files
    if (!isPlanFile(input)) {
      sendContinue();
      return;
    }

    const projectPath = getProjectPath(input);
    if (!projectPath) {
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

    // Parse frontmatter for plan ID (from tool_input content if available)
    let content: string | undefined;
    if (!existsSync(absolutePath)) {
      content = input.tool_input?.content as string | undefined;
    } else {
      content = (input.tool_input?.content as string | undefined) || readFileSync(absolutePath, 'utf-8');
    }

    // Get or generate plan ID
    let planId: string;
    if (content) {
      const frontmatter = parseFrontmatter(content);
      planId = frontmatter.data['sqlew-plan-id'] || generatePlanId();
    } else {
      planId = generatePlanId();
    }

    const planFileName = extractPlanFileName(absolutePath);

    // Check if we already have cached info for this plan
    const existingPlan = loadCurrentPlan(projectPath);
    const isNewPlan = !existingPlan || existingPlan.plan_id !== planId;

    // Clear old cache if switching plans
    if (isNewPlan) {
      clearPlanTomlCache(projectPath);
    }

    // Save current plan info to cache
    const planInfo: CurrentPlanInfo = {
      plan_id: planId,
      plan_file: planFileName,
      plan_updated_at: new Date().toISOString(),
      recorded: existingPlan?.recorded ?? false,
      decision_pending: isNewPlan ? true : (existingPlan?.decision_pending ?? false),
    };
    saveCurrentPlan(projectPath, planInfo);

    // Simple tracking message
    const contextMsg = `[sqlew] Tracking plan: ${planFileName} (ID: ${planId.slice(0, 8)}...)`;
    sendContinue(contextMsg);
  } catch (error) {
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
