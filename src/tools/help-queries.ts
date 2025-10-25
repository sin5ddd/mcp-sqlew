/**
 * Help Query Module - Granular Help System API
 *
 * Provides 6 query functions for accessing help system data with 80-95% token reduction:
 * 1. queryHelpAction - Query single action with parameters and examples (~50-100 tokens vs ~2,000 legacy)
 * 2. queryHelpParams - Query just parameter list for an action (~30-80 tokens vs ~1,500 legacy)
 * 3. queryHelpTool - Query tool overview + all actions (~100-200 tokens vs ~5,000 legacy)
 * 4. queryHelpUseCase - Query single use-case with full workflow (~150-200 tokens)
 * 5. queryHelpListUseCases - List use-cases by category/complexity with pagination (~100-300 tokens)
 * 6. queryHelpNextActions - Query common next actions after given action (~30-50 tokens)
 */

import { DatabaseAdapter, SQLiteAdapter } from '../adapters/index.js';
import { getAdapter } from '../database.js';

/**
 * Helper to get raw better-sqlite3 Database instance from adapter
 * For legacy code that uses db.prepare() directly
 */
function getRawDb(adapter: DatabaseAdapter): any {
  if (adapter instanceof SQLiteAdapter) {
    return adapter.getRawDatabase();
  }
  throw new Error('Help queries only supported for SQLite adapter');
}

interface HelpParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string;
}

interface HelpExample {
  title: string;
  code: string;
  explanation: string;
}

interface HelpActionResult {
  tool: string;
  action: string;
  description: string;
  parameters: HelpParameter[];
  examples: HelpExample[];
}

interface HelpParamsResult {
  tool: string;
  action: string;
  parameters: HelpParameter[];
}

interface HelpActionSummary {
  name: string;
  description: string;
}

interface HelpToolResult {
  tool: string;
  description: string;
  actions: HelpActionSummary[];
}

interface HelpUseCaseResult {
  use_case_id: number;
  category: string;
  title: string;
  complexity: string;
  description: string;
  full_example: any;
  action_sequence: string[];
}

interface HelpUseCaseSummary {
  use_case_id: number;
  title: string;
  complexity: string;
  category: string;
}

interface HelpListUseCasesResult {
  total: number;
  filtered: number;
  use_cases: HelpUseCaseSummary[];
  categories?: string[];
}

interface HelpNextAction {
  action: string;
  frequency: string;
  context: string;
}

interface HelpNextActionsResult {
  tool: string;
  action: string;
  next_actions: HelpNextAction[];
}

/**
 * Query single action with parameters and examples
 * Target: ~50-100 tokens (vs ~2,000 legacy)
 */
export function queryHelpAction(adapter: DatabaseAdapter, targetTool: string, targetAction: string): HelpActionResult | { error: string; available_actions?: string[] } {
  const db = getRawDb(adapter);
  try {
    // First, check if tool exists
    const toolExists = db.prepare('SELECT tool_name FROM m_help_tools WHERE tool_name = ?').get(targetTool);
    if (!toolExists) {
      const availableTools = db.prepare('SELECT tool_name FROM m_help_tools ORDER BY tool_name').all()
        .map((row: any) => row.tool_name);
      return {
        error: `Tool "${targetTool}" not found`,
        available_actions: availableTools
      };
    }

    // Get action info
    const actionRow = db.prepare(`
      SELECT action_id, action_name, description
      FROM m_help_actions
      WHERE tool_name = ? AND action_name = ?
    `).get(targetTool, targetAction) as { action_id: number; action_name: string; description: string } | undefined;

    if (!actionRow) {
      const availableActions = db.prepare(`
        SELECT action_name FROM m_help_actions WHERE tool_name = ? ORDER BY action_name
      `).all(targetTool).map((row: any) => row.action_name);
      return {
        error: `Action "${targetAction}" not found for tool "${targetTool}"`,
        available_actions: availableActions
      };
    }

    // Get parameters
    const paramRows = db.prepare(`
      SELECT param_name, param_type, required, description, default_value
      FROM t_help_action_params
      WHERE action_id = ?
      ORDER BY required DESC, param_name
    `).all(actionRow.action_id) as Array<{
      param_name: string;
      param_type: string;
      required: number;
      description: string;
      default_value: string | null;
    }>;

    const parameters: HelpParameter[] = paramRows.map(row => ({
      name: row.param_name,
      type: row.param_type,
      required: row.required === 1,
      description: row.description,
      ...(row.default_value !== null && { default: row.default_value })
    }));

    // Get examples
    const exampleRows = db.prepare(`
      SELECT example_title, example_code, explanation
      FROM t_help_action_examples
      WHERE action_id = ?
      ORDER BY example_id
    `).all(actionRow.action_id) as Array<{
      example_title: string;
      example_code: string;
      explanation: string;
    }>;

    const examples: HelpExample[] = exampleRows.map(row => ({
      title: row.example_title,
      code: row.example_code,
      explanation: row.explanation
    }));

    return {
      tool: targetTool,
      action: actionRow.action_name,
      description: actionRow.description,
      parameters,
      examples
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Failed to query help action: ${message}` };
  }
}

/**
 * Query just parameter list for an action
 * Target: ~30-80 tokens (vs ~1,500 legacy)
 */
export function queryHelpParams(adapter: DatabaseAdapter, targetTool: string, targetAction: string): HelpParamsResult | { error: string; available_actions?: string[] } {
  const db = getRawDb(adapter);
  try {
    // First, check if tool exists
    const toolExists = db.prepare('SELECT tool_name FROM m_help_tools WHERE tool_name = ?').get(targetTool);
    if (!toolExists) {
      const availableTools = db.prepare('SELECT tool_name FROM m_help_tools ORDER BY tool_name').all()
        .map((row: any) => row.tool_name);
      return {
        error: `Tool "${targetTool}" not found`,
        available_actions: availableTools
      };
    }

    // Get action info
    const actionRow = db.prepare(`
      SELECT action_id
      FROM m_help_actions
      WHERE tool_name = ? AND action_name = ?
    `).get(targetTool, targetAction) as { action_id: number } | undefined;

    if (!actionRow) {
      const availableActions = db.prepare(`
        SELECT action_name FROM m_help_actions WHERE tool_name = ? ORDER BY action_name
      `).all(targetTool).map((row: any) => row.action_name);
      return {
        error: `Action "${targetAction}" not found for tool "${targetTool}"`,
        available_actions: availableActions
      };
    }

    // Get parameters
    const paramRows = db.prepare(`
      SELECT param_name, param_type, required, description, default_value
      FROM t_help_action_params
      WHERE action_id = ?
      ORDER BY required DESC, param_name
    `).all(actionRow.action_id) as Array<{
      param_name: string;
      param_type: string;
      required: number;
      description: string;
      default_value: string | null;
    }>;

    const parameters: HelpParameter[] = paramRows.map(row => ({
      name: row.param_name,
      type: row.param_type,
      required: row.required === 1,
      description: row.description,
      ...(row.default_value !== null && { default: row.default_value })
    }));

    return {
      tool: targetTool,
      action: targetAction,
      parameters
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Failed to query help params: ${message}` };
  }
}

/**
 * Query tool overview + all actions
 * Target: ~100-200 tokens (vs ~5,000 legacy)
 */
export function queryHelpTool(adapter: DatabaseAdapter, tool: string): HelpToolResult | { error: string; available_tools?: string[] } {
  const db = getRawDb(adapter);
  try {
    // Get tool info
    const toolRow = db.prepare(`
      SELECT tool_name, description
      FROM m_help_tools
      WHERE tool_name = ?
    `).get(tool) as { tool_name: string; description: string } | undefined;

    if (!toolRow) {
      const availableTools = db.prepare('SELECT tool_name FROM m_help_tools ORDER BY tool_name').all()
        .map((row: any) => row.tool_name);
      return {
        error: `Tool "${tool}" not found`,
        available_tools: availableTools
      };
    }

    // Get all actions for this tool
    const actionRows = db.prepare(`
      SELECT action_name, description
      FROM m_help_actions
      WHERE tool_name = ?
      ORDER BY action_name
    `).all(tool) as Array<{
      action_name: string;
      description: string;
    }>;

    const actions: HelpActionSummary[] = actionRows.map(row => ({
      name: row.action_name,
      description: row.description
    }));

    return {
      tool: toolRow.tool_name,
      description: toolRow.description,
      actions
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Failed to query help tool: ${message}` };
  }
}

/**
 * Query single use-case with full workflow
 * Target: ~150-200 tokens per use-case
 */
export function queryHelpUseCase(adapter: DatabaseAdapter, use_case_id: number): HelpUseCaseResult | { error: string } {
  const db = getRawDb(adapter);
  try {
    const row = db.prepare(`
      SELECT
        uc.use_case_id,
        cat.category_name as category,
        uc.title,
        uc.complexity,
        uc.description,
        uc.full_example,
        uc.action_sequence
      FROM t_help_use_cases uc
      JOIN m_help_use_case_categories cat ON uc.category_id = cat.category_id
      WHERE uc.use_case_id = ?
    `).get(use_case_id) as {
      use_case_id: number;
      category: string;
      title: string;
      complexity: string;
      description: string;
      full_example: string;
      action_sequence: string;
    } | undefined;

    if (!row) {
      return { error: `Use-case with ID ${use_case_id} not found` };
    }

    return {
      use_case_id: row.use_case_id,
      category: row.category,
      title: row.title,
      complexity: row.complexity,
      description: row.description,
      full_example: JSON.parse(row.full_example),
      action_sequence: JSON.parse(row.action_sequence)
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Failed to query use-case: ${message}` };
  }
}

/**
 * List use-cases by category/complexity with pagination
 * Target: ~100-300 tokens depending on result count
 */
export function queryHelpListUseCases(
  adapter: DatabaseAdapter,
  options: {
    category?: string;
    complexity?: string;
    limit?: number;
    offset?: number;
  } = {}
): HelpListUseCasesResult | { error: string; available_categories?: string[] } {
  const db = getRawDb(adapter);
  try {
    const { category, complexity, limit = 20, offset = 0 } = options;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];

    if (category) {
      // Verify category exists
      const categoryExists = db.prepare(
        'SELECT category_name FROM m_help_use_case_categories WHERE category_name = ?'
      ).get(category);

      if (!categoryExists) {
        const availableCategories = db.prepare(
          'SELECT category_name FROM m_help_use_case_categories ORDER BY category_name'
        ).all().map((row: any) => row.category_name);
        return {
          error: `Category "${category}" not found`,
          available_categories: availableCategories
        };
      }
      conditions.push('cat.category_name = ?');
      params.push(category);
    }

    if (complexity) {
      if (!['basic', 'intermediate', 'advanced'].includes(complexity)) {
        return { error: 'Complexity must be one of: basic, intermediate, advanced' };
      }
      conditions.push('uc.complexity = ?');
      params.push(complexity);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count (all use-cases)
    const totalRow = db.prepare('SELECT COUNT(*) as count FROM t_help_use_cases').get() as { count: number };
    const total = totalRow.count;

    // Get filtered count
    const filteredRow = db.prepare(`
      SELECT COUNT(*) as count
      FROM t_help_use_cases uc
      JOIN m_help_use_case_categories cat ON uc.category_id = cat.category_id
      ${whereClause}
    `).get(...params) as { count: number };
    const filtered = filteredRow.count;

    // Get use-cases
    const rows = db.prepare(`
      SELECT
        uc.use_case_id,
        uc.title,
        uc.complexity,
        cat.category_name as category
      FROM t_help_use_cases uc
      JOIN m_help_use_case_categories cat ON uc.category_id = cat.category_id
      ${whereClause}
      ORDER BY
        CASE uc.complexity
          WHEN 'basic' THEN 1
          WHEN 'intermediate' THEN 2
          WHEN 'advanced' THEN 3
        END,
        uc.use_case_id
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Array<{
      use_case_id: number;
      title: string;
      complexity: string;
      category: string;
    }>;

    const use_cases: HelpUseCaseSummary[] = rows.map(row => ({
      use_case_id: row.use_case_id,
      title: row.title,
      complexity: row.complexity,
      category: row.category
    }));

    const result: HelpListUseCasesResult = {
      total,
      filtered,
      use_cases
    };

    // Add available categories if no category filter
    if (!category) {
      const categories = db.prepare(
        'SELECT category_name FROM m_help_use_case_categories ORDER BY category_name'
      ).all().map((row: any) => row.category_name);
      result.categories = categories;
    }

    return result;

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Failed to list use-cases: ${message}` };
  }
}

/**
 * Query common next actions after given action
 * Analyzes action sequences from use-cases to suggest next steps
 * Target: ~30-50 tokens
 */
export function queryHelpNextActions(adapter: DatabaseAdapter, targetTool: string, targetAction: string): HelpNextActionsResult | { error: string } {
  const db = getRawDb(adapter);
  try {
    // Verify tool and action exist
    const actionRow = db.prepare(`
      SELECT action_id
      FROM m_help_actions
      WHERE tool_name = ? AND action_name = ?
    `).get(targetTool, targetAction);

    if (!actionRow) {
      return { error: `Action "${targetTool}.${targetAction}" not found in help system` };
    }

    // Find use-cases containing this action in their sequence
    const useCases = db.prepare(`
      SELECT action_sequence, title, complexity
      FROM t_help_use_cases
      WHERE action_sequence LIKE ?
    `).all(`%"${targetAction}"%`) as Array<{
      action_sequence: string;
      title: string;
      complexity: string;
    }>;

    if (useCases.length === 0) {
      return {
        tool: targetTool,
        action: targetAction,
        next_actions: []
      };
    }

    // Analyze sequences to find what typically comes next
    const nextActionCounts: Map<string, { count: number; contexts: string[] }> = new Map();

    for (const useCase of useCases) {
      const sequence = JSON.parse(useCase.action_sequence) as string[];
      const actionIndex = sequence.indexOf(targetAction);

      if (actionIndex >= 0 && actionIndex < sequence.length - 1) {
        const nextAction = sequence[actionIndex + 1];
        const existing = nextActionCounts.get(nextAction) || { count: 0, contexts: [] };
        existing.count++;
        if (existing.contexts.length < 3) {
          existing.contexts.push(useCase.title);
        }
        nextActionCounts.set(nextAction, existing);
      }
    }

    // Sort by frequency and take top 5
    const sortedActions = Array.from(nextActionCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);

    const totalUseCases = useCases.length;
    const next_actions: HelpNextAction[] = sortedActions.map(([nextAction, data]) => {
      const percentage = (data.count / totalUseCases) * 100;
      let frequency: string;
      if (percentage >= 66) frequency = 'very common';
      else if (percentage >= 33) frequency = 'common';
      else frequency = 'occasional';

      return {
        action: nextAction,
        frequency,
        context: data.contexts[0] // Use first context as summary
      };
    });

    return {
      tool: targetTool,
      action: targetAction,
      next_actions
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Failed to query next actions: ${message}` };
  }
}
