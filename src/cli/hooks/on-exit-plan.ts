/**
 * On-Exit-Plan Hook Command
 *
 * PostToolUse hook for ExitPlanMode - extracts and auto-registers decisions/constraints.
 * Uses pattern matching (📌 Decision / 🚫 Constraint) instead of LLM.
 *
 * Flow:
 * 1. Read plan file content
 * 2. Extract decisions/constraints using regex patterns
 * 3. Auto-register as draft via queue
 * 4. Show confirmation message to user
 *
 * Usage:
 *   echo '{"tool_name": "ExitPlanMode"}' | sqlew on-exit-plan
 *
 * @since v4.2.0
 * @modified v4.2.2 - Uses pattern extraction instead of TOML/LLM
 */

import { readStdinJson, sendContinue, sendPostToolUseContext, getProjectPath } from './stdin-parser.js';
import { loadCurrentPlan } from '../../config/global-config.js';
import { extractPatternsFromPlan, hasPatterns, type ExtractionResult } from './plan-pattern-extractor.js';
import { enqueueDecisionCreate, enqueueConstraintCreate } from '../../utils/hook-queue.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ============================================================================
// Constants
// ============================================================================

/** User's global plans directory */
const GLOBAL_PLANS_DIR = join(homedir(), '.claude', 'plans');

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main on-exit-plan command entry point
 *
 * Called as PostToolUse hook when ExitPlanMode is invoked.
 * Extracts decisions/constraints from plan and auto-registers as draft.
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

    // Get current plan info
    const planInfo = loadCurrentPlan(projectPath);
    if (!planInfo?.plan_file) {
      sendContinue('[sqlew] No active plan tracked.');
      return;
    }

    // Read plan file content
    const planPath = resolvePlanPath(planInfo.plan_file);
    if (!planPath || !existsSync(planPath)) {
      sendContinue(`[sqlew] Plan file not found: ${planInfo.plan_file}`);
      return;
    }

    const content = readFileSync(planPath, 'utf-8');

    // Check for patterns first (quick check)
    if (!hasPatterns(content)) {
      sendContinue('[sqlew] No decisions or constraints detected in plan.');
      return;
    }

    // Extract patterns
    const extracted = extractPatternsFromPlan(content);

    if (extracted.decisions.length === 0 && extracted.constraints.length === 0) {
      sendContinue('[sqlew] No valid decisions or constraints found.');
      return;
    }

    // Auto-register as draft via queue
    const planIdTag = planInfo.plan_id.slice(0, 8);

    for (const decision of extracted.decisions) {
      // Parse tags from comma-separated string
      const extractedTags = decision.tags
        ? decision.tags.split(',').map(t => t.trim()).filter(t => t)
        : [];
      const allTags = ['plan', 'auto-extracted', planIdTag, ...extractedTags];

      enqueueDecisionCreate(projectPath, {
        key: decision.key,
        value: decision.value,
        status: 'draft',
        layer: decision.layer || 'cross-cutting',
        tags: allTags,
      });
    }

    for (const constraint of extracted.constraints) {
      // Parse tags from comma-separated string
      const extractedTags = constraint.tags
        ? constraint.tags.split(',').map(t => t.trim()).filter(t => t)
        : [];
      const allTags = ['plan', 'auto-extracted', planIdTag, ...extractedTags];

      enqueueConstraintCreate(projectPath, {
        text: constraint.rule,
        category: constraint.category,
        priority: constraint.priority || 'medium',
        layer: 'cross-cutting',
        tags: allTags,
        active: true, // Active by default from plan
        plan_id: planInfo.plan_id,
      });
    }

    // Build confirmation message
    const confirmation = buildConfirmationMessage(extracted, planInfo.plan_file);
    sendPostToolUseContext(confirmation);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sqlew on-exit-plan] Error: ${message}`);
    sendContinue();
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Resolve plan file path
 * Plans are stored in user's global ~/.claude/plans/ directory
 */
function resolvePlanPath(planFileName: string): string | null {
  // Try global plans directory first
  const globalPath = join(GLOBAL_PLANS_DIR, planFileName);
  if (existsSync(globalPath)) {
    return globalPath;
  }

  // Not found
  return null;
}

/**
 * Build confirmation message for user
 */
function buildConfirmationMessage(extracted: ExtractionResult, planFile: string): string {
  const lines: string[] = [
    '',
    `📋 **Plan "${planFile}" から検出・登録しました**`,
    '',
  ];

  if (extracted.decisions.length > 0) {
    lines.push(`### ✅ Decision (${extracted.decisions.length}件) → draft で自動登録`);
    for (const d of extracted.decisions) {
      lines.push(`- **${d.key}**: ${d.value}`);
      if (d.layer) lines.push(`  - Layer: ${d.layer}`);
    }
    lines.push('');
  }

  if (extracted.constraints.length > 0) {
    lines.push(`### ✅ Constraint (${extracted.constraints.length}件) → inactive で自動登録`);
    for (const c of extracted.constraints) {
      lines.push(`- **[${c.category}]** ${c.rule} (${c.priority || 'medium'})`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('💡 実装ファイル編集時に自動で active に昇格します。');
  lines.push('手動で確認: `mcp__sqlew__decision({ action: "list", status: "draft" })`');

  return lines.join('\n');
}
