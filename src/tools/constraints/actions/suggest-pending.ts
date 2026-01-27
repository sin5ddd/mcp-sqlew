/**
 * Suggest Pending Constraints Action (v4.2.0+)
 *
 * Returns constraint candidates from plan TOML cache that haven't been registered yet.
 * Allows AI to re-suggest constraints after task completion.
 *
 * This action does NOT require database access - it reads from the session cache.
 */

import {
  loadPlanCache,
  loadCurrentPlan,
  getGlobalConfigDir,
  type PlanCache,
  type ConstraintCandidate,
} from '../../../config/global-config.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Parameters for suggest_pending action
 */
export interface SuggestPendingParams {
  /** Project path (optional, uses CWD if not specified) */
  project_path?: string;
}

/**
 * Response from suggest_pending action
 */
export interface SuggestPendingResponse {
  /** Whether there are pending constraints */
  has_pending: boolean;
  /** Plan ID associated with the constraints */
  plan_id: string | null;
  /** Plan file name */
  plan_file: string | null;
  /** Pending constraint candidates */
  constraints: ConstraintCandidate[];
  /** MCP command examples for registration */
  commands: string[];
  /** User-friendly message */
  message: string;
}

// ============================================================================
// Action Implementation
// ============================================================================

/**
 * Get pending constraint candidates from plan TOML cache
 *
 * @param params - Action parameters
 * @returns Pending constraints with registration commands
 */
export async function suggestPendingConstraints(
  params: SuggestPendingParams = {}
): Promise<SuggestPendingResponse> {
  const projectPath = params.project_path || process.cwd();

  // Load current plan info
  const planInfo = loadCurrentPlan(projectPath);
  if (!planInfo) {
    return {
      has_pending: false,
      plan_id: null,
      plan_file: null,
      constraints: [],
      commands: [],
      message: 'No active plan found. Use Plan agent to create a plan first.',
    };
  }

  // Load plan TOML cache
  const cache = loadPlanCache(projectPath);
  if (!cache || cache.plan_id !== planInfo.plan_id) {
    return {
      has_pending: false,
      plan_id: planInfo.plan_id,
      plan_file: planInfo.plan_file,
      constraints: [],
      commands: [],
      message: `Plan "${planInfo.plan_file}" has no TOML-defined constraints.`,
    };
  }

  if (cache.constraints.length === 0) {
    return {
      has_pending: false,
      plan_id: cache.plan_id,
      plan_file: planInfo.plan_file,
      constraints: [],
      commands: [],
      message: `Plan "${planInfo.plan_file}" has no constraint candidates.`,
    };
  }

  // Generate MCP commands for each constraint
  const commands = cache.constraints.map((c) => {
    const priority = c.priority || 'medium';
    const layer = c.layer ? ` layer="${c.layer}"` : '';
    const tags = c.tags && c.tags.length > 0 ? ` tags="${c.tags.join(',')}"` : '';
    return `mcp__sqlew__constraint action="add" constraint_text="${c.text}" category="${c.category}" priority="${priority}"${layer}${tags}`;
  });

  return {
    has_pending: true,
    plan_id: cache.plan_id,
    plan_file: planInfo.plan_file,
    constraints: cache.constraints,
    commands,
    message: `Found ${cache.constraints.length} constraint candidate(s) from plan "${planInfo.plan_file}".`,
  };
}
