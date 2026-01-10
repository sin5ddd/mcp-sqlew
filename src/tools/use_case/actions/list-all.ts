/**
 * Use Case Tool - list_all Action
 * List all use cases with filtering and pagination
 *
 * TOML-based implementation (v5.0+)
 * Loads from src/help-data/use-cases/*.toml instead of database
 */

import { getHelpLoader } from '../../../help-loader.js';
import { UseCaseListAllParams, UseCaseListAllResult } from '../types.js';

/**
 * List all use cases with filtering
 * Uses HelpSystemLoader (TOML-based)
 */
export async function listAllUseCases(
  params: UseCaseListAllParams
): Promise<UseCaseListAllResult | { error: string; available_categories?: string[] }> {
  const loader = await getHelpLoader();

  // Validate category if provided
  if (params.category) {
    const categories = loader.getCategories();
    const categoryExists = categories.some(c => c.name === params.category);
    if (!categoryExists) {
      return {
        error: `Category "${params.category}" not found`,
        available_categories: categories.map(c => c.name)
      };
    }
  }

  // Validate complexity if provided
  if (params.complexity) {
    if (!['basic', 'intermediate', 'advanced'].includes(params.complexity)) {
      return { error: 'Complexity must be one of: basic, intermediate, advanced' };
    }
  }

  const result = loader.listUseCases({
    category: params.category,
    complexity: params.complexity,
    limit: params.limit || 20,
    offset: params.offset || 0
  });

  return {
    total: result.total,
    filtered: result.filtered,
    use_cases: result.use_cases.map(uc => ({
      use_case_id: uc.id,
      title: uc.title,
      complexity: uc.complexity,
      category: uc.category
    })),
    categories: result.categories
  };
}
