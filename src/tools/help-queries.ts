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

import { DatabaseAdapter } from '../adapters/index.js';
import { getAdapter } from '../database.js';

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

// todo RAW SQL must be avoided
/**
 * Query single action with parameters and examples
 * Target: ~50-100 tokens (vs ~2,000 legacy)
 */
export async function queryHelpAction(adapter: DatabaseAdapter, targetTool: string, targetAction: string): Promise<HelpActionResult | { error: string; available_actions?: string[] }> {
  const knex = adapter.getKnex();
  try {
    // First, check if tool exists
    const toolExists = await knex('v4_help_tools')
      .where({ tool_name: targetTool })
      .select('tool_name')
      .first();

    if (!toolExists) {
      const availableTools = await knex('v4_help_tools')
        .orderBy('tool_name')
        .select('tool_name');
      return {
        error: `Tool "${targetTool}" not found`,
        available_actions: availableTools.map((row: any) => row.tool_name)
      };
    }

    // Get action info
    const actionRow = await knex('v4_help_actions')
      .where({ tool_name: targetTool, action_name: targetAction })
      .select('action_id', 'action_name', 'description')
      .first() as { action_id: number; action_name: string; description: string } | undefined;

    if (!actionRow) {
      const availableActions = await knex('v4_help_actions')
        .where({ tool_name: targetTool })
        .orderBy('action_name')
        .select('action_name');
      return {
        error: `Action "${targetAction}" not found for tool "${targetTool}"`,
        available_actions: availableActions.map((row: any) => row.action_name)
      };
    }

    // Get parameters
    const paramRows = await knex('v4_help_action_params')
      .where({ action_id: actionRow.action_id })
      .orderBy([
        { column: 'required', order: 'desc' },
        { column: 'param_name', order: 'asc' }
      ])
      .select('param_name', 'param_type', 'required', 'description', 'default_value') as Array<{
        param_name: string;
        param_type: string;
        required: number;
        description: string;
        default_value: string | null;
      }>;

    const parameters: HelpParameter[] = paramRows.map(row => {
      const marker = row.required === 1 ? '🔴 REQUIRED' : '⚪ OPTIONAL';
      return {
        name: row.param_name,
        type: row.param_type,
        required: row.required === 1,
        description: `${marker}: ${row.description}`,
        ...(row.default_value !== null && { default: row.default_value })
      };
    });

    // Get examples
    const exampleRows = await knex('v4_help_action_examples')
      .where({ action_id: actionRow.action_id })
      .orderBy('example_id')
      .select('example_title', 'example_code', 'explanation') as Array<{
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
export async function queryHelpParams(adapter: DatabaseAdapter, targetTool: string, targetAction: string): Promise<HelpParamsResult | { error: string; available_actions?: string[] }> {
  const knex = adapter.getKnex();
  try {
    // First, check if tool exists
    const toolExists = await knex('v4_help_tools')
      .where({ tool_name: targetTool })
      .select('tool_name')
      .first();

    if (!toolExists) {
      const availableTools = await knex('v4_help_tools')
        .orderBy('tool_name')
        .select('tool_name');
      return {
        error: `Tool "${targetTool}" not found`,
        available_actions: availableTools.map((row: any) => row.tool_name)
      };
    }

    // Get action info
    const actionRow = await knex('v4_help_actions')
      .where({ tool_name: targetTool, action_name: targetAction })
      .select('action_id')
      .first() as { action_id: number } | undefined;

    if (!actionRow) {
      const availableActions = await knex('v4_help_actions')
        .where({ tool_name: targetTool })
        .orderBy('action_name')
        .select('action_name');
      return {
        error: `Action "${targetAction}" not found for tool "${targetTool}"`,
        available_actions: availableActions.map((row: any) => row.action_name)
      };
    }

    // Get parameters
    const paramRows = await knex('v4_help_action_params')
      .where({ action_id: actionRow.action_id })
      .orderBy([
        { column: 'required', order: 'desc' },
        { column: 'param_name', order: 'asc' }
      ])
      .select('param_name', 'param_type', 'required', 'description', 'default_value') as Array<{
        param_name: string;
        param_type: string;
        required: number;
        description: string;
        default_value: string | null;
      }>;

    const parameters: HelpParameter[] = paramRows.map(row => {
      const marker = row.required === 1 ? '🔴 REQUIRED' : '⚪ OPTIONAL';
      return {
        name: row.param_name,
        type: row.param_type,
        required: row.required === 1,
        description: `${marker}: ${row.description}`,
        ...(row.default_value !== null && { default: row.default_value })
      };
    });

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
export async function queryHelpTool(adapter: DatabaseAdapter, tool: string): Promise<HelpToolResult | { error: string; available_tools?: string[] }> {
  const knex = adapter.getKnex();
  try {
    // Get tool info
    const toolRow = await knex('v4_help_tools')
      .where({ tool_name: tool })
      .select('tool_name', 'description')
      .first() as { tool_name: string; description: string } | undefined;

    if (!toolRow) {
      const availableTools = await knex('v4_help_tools')
        .orderBy('tool_name')
        .select('tool_name');
      return {
        error: `Tool "${tool}" not found`,
        available_tools: availableTools.map((row: any) => row.tool_name)
      };
    }

    // Get all actions for this tool
    const actionRows = await knex('v4_help_actions')
      .where({ tool_name: tool })
      .orderBy('action_name')
      .select('action_name', 'description') as Array<{
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
export async function queryHelpUseCase(adapter: DatabaseAdapter, use_case_id: number): Promise<HelpUseCaseResult | { error: string }> {
  const knex = adapter.getKnex();
  try {
    const row = await knex('v4_help_use_cases as uc')
      .join('v4_help_use_case_categories as cat', 'uc.category_id', 'cat.category_id')
      .where({ 'uc.use_case_id': use_case_id })
      .select(
        'uc.use_case_id',
        'cat.category_name as category',
        'uc.title',
        'uc.complexity',
        'uc.description',
        'uc.full_example',
        'uc.action_sequence'
      )
      .first() as {
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
export async function queryHelpListUseCases(
  adapter: DatabaseAdapter,
  options: {
    category?: string;
    complexity?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<HelpListUseCasesResult | { error: string; available_categories?: string[] }> {
  const knex = adapter.getKnex();
  try {
    const { category, complexity, limit = 20, offset = 0 } = options;

    if (category) {
      // Verify category exists
      const categoryExists = await knex('v4_help_use_case_categories')
        .where({ category_name: category })
        .select('category_name')
        .first();

      if (!categoryExists) {
        const availableCategories = await knex('v4_help_use_case_categories')
          .select('category_name')
          .orderBy('category_name')
          .then(rows => rows.map((row: any) => row.category_name));
        return {
          error: `Category "${category}" not found`,
          available_categories: availableCategories
        };
      }
    }

    if (complexity && !['basic', 'intermediate', 'advanced'].includes(complexity)) {
      return { error: 'Complexity must be one of: basic, intermediate, advanced' };
    }

    // Get total count (all use-cases)
    const totalRow = await knex('v4_help_use_cases').count('* as count').first() as { count: number };
    const total = totalRow.count;

    // Build filtered query
    let filteredQuery = knex('v4_help_use_cases as uc')
      .join('v4_help_use_case_categories as cat', 'uc.category_id', 'cat.category_id');

    if (category) {
      filteredQuery = filteredQuery.where({ 'cat.category_name': category });
    }
    if (complexity) {
      filteredQuery = filteredQuery.where({ 'uc.complexity': complexity });
    }

    // Get filtered count
    const filteredRow = await filteredQuery.clone().count('* as count').first() as { count: number };
    const filtered = filteredRow.count;

    // Get use-cases
    const rows = await filteredQuery
      .select(
        'uc.use_case_id',
        'uc.title',
        'uc.complexity',
        'cat.category_name as category'
      )
      .orderByRaw(`
        CASE uc.complexity
          WHEN 'basic' THEN 1
          WHEN 'intermediate' THEN 2
          WHEN 'advanced' THEN 3
        END
      `)
      .orderBy('uc.use_case_id')
      .limit(limit)
      .offset(offset) as Array<{
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
      const categories = await knex('v4_help_use_case_categories')
        .select('category_name')
        .orderBy('category_name')
        .then(rows => rows.map((row: any) => row.category_name));
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
export async function queryHelpNextActions(adapter: DatabaseAdapter, targetTool: string, targetAction: string): Promise<HelpNextActionsResult | { error: string }> {
  const knex = adapter.getKnex();
  try {
    // Verify tool and action exist
    const actionRow = await knex('v4_help_actions')
      .where({ tool_name: targetTool, action_name: targetAction })
      .select('action_id')
      .first();

    if (!actionRow) {
      return { error: `Action "${targetTool}.${targetAction}" not found in help system` };
    }

    // Find use-cases containing this action in their sequence
    const useCases = await knex('v4_help_use_cases')
      .where('action_sequence', 'like', `%"${targetAction}"%`)
      .select('action_sequence', 'title', 'complexity') as Array<{
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
