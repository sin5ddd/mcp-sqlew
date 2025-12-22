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
import { saveCurrentPlan, loadCurrentPlan, type CurrentPlanInfo } from '../../config/global-config.js';
import { initializeDatabase, getAdapter } from '../../database.js';
import { quickSetDecision } from '../../tools/context/actions/quick-set.js';
import { ProjectContext } from '../../utils/project-context.js';
import { existsSync } from 'fs';
import { resolve, basename } from 'path';

// ============================================================================
// Constants
// ============================================================================

/** Decision key prefix for plan-based decisions */
const PLAN_DECISION_PREFIX = 'plan/implementation';

/** Status for draft decisions (planning stage) */
const DRAFT_STATUS = 'draft' as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Register a draft decision for a new plan
 *
 * @param projectPath - Project root path
 * @param planFileName - Plan file name (e.g., "my-plan.md")
 * @param planId - Plan ID (UUID)
 * @returns true if decision was registered, false otherwise
 */
async function registerDraftDecision(
  projectPath: string,
  planFileName: string,
  planId: string
): Promise<boolean> {
  try {
    // Initialize database
    await initializeDatabase();

    // Initialize ProjectContext
    const adapter = getAdapter();
    const knex = adapter.getKnex();
    const projectName = basename(projectPath);
    const projectContext = ProjectContext.getInstance();
    await projectContext.ensureProject(knex, projectName, 'cli', {
      projectRootPath: projectPath,
    });

    // Build decision key from plan file name
    const planName = planFileName.replace(/\.md$/, '');
    const decisionKey = `${PLAN_DECISION_PREFIX}/${planName}`;

    // Register decision with draft status
    await quickSetDecision({
      key: decisionKey,
      value: `Plan created: ${planFileName}`,
      status: DRAFT_STATUS,
      layer: 'planning',
      tags: ['plan', 'draft', planId.slice(0, 8)],
    });

    return true;
  } catch (error) {
    // Log error but don't fail the hook
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sqlew track-plan] Failed to register decision: ${message}`);
    return false;
  }
}

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

      // Register draft decision for the new plan
      const decisionRegistered = await registerDraftDecision(projectPath, planFileName, planId);

      // Save current plan info to session cache
      // recorded: false means "not yet updated to in_progress"
      const planInfo: CurrentPlanInfo = {
        plan_id: planId,
        plan_file: planFileName,
        plan_updated_at: new Date().toISOString(),
        recorded: false,
      };

      saveCurrentPlan(projectPath, planInfo);

      // Continue with context about the tracked plan
      const statusMsg = decisionRegistered ? ' Decision registered (draft).' : '';
      sendContinue(
        `[sqlew] Tracking new plan: ${planFileName} (ID: ${planId.slice(0, 8)}...).${statusMsg}`
      );
      return;
    }

    // Ensure plan has an ID (creates one if missing)
    const planId = ensurePlanId(absolutePath);
    const planFileName = extractPlanFileName(absolutePath);

    // Save current plan info to session cache
    const planInfo: CurrentPlanInfo = {
      plan_id: planId,
      plan_file: planFileName,
      plan_updated_at: new Date().toISOString(),
      recorded: false,
    };

    saveCurrentPlan(projectPath, planInfo);

    // Continue with context about the tracked plan
    sendContinue(
      `[sqlew] Tracking plan: ${planFileName} (ID: ${planId.slice(0, 8)}...)`
    );
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
