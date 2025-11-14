/**
 * Use Case Tool - search Action
 * Search use cases by keyword/category
 */

import { DatabaseAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { UseCaseSearchParams, UseCaseSearchResult } from '../types.js';

/**
* Search use cases by keyword/category
 */
export async function searchUseCases(
  params: UseCaseSearchParams,
  adapter?: DatabaseAdapter
): Promise<UseCaseSearchResult | { error: string; available_categories?: string[] }> {
  const actualAdapter = adapter ?? getAdapter();
  const knex = actualAdapter.getKnex();

  try {
    const { keyword, category, complexity } = params;

    if (category) {
      // Verify category exists
      const categoryExists = await knex('m_help_use_case_categories')
        .where({ category_name: category })
        .select('category_name')
        .first();

      if (!categoryExists) {
        const availableCategories = await knex('m_help_use_case_categories')
          .select('category_name')
          .orderBy('category_name')
          .then(rows => rows.map((row: any) => row.category_name));
        return {
          error: `Category "${category}" not found`,
          available_categories: availableCategories
        };
      }
    }

    if (complexity) {
      if (!['basic', 'intermediate', 'advanced'].includes(complexity)) {
        return { error: 'Complexity must be one of: basic, intermediate, advanced' };
      }
    }

    // Build query with JOIN
    let query = knex('t_help_use_cases as uc')
      .join('m_help_use_case_categories as cat', 'uc.category_id', 'cat.category_id');

    // Apply WHERE conditions
    query = query.where((builder) => {
      builder.where('uc.title', 'like', `%${keyword}%`)
             .orWhere('uc.description', 'like', `%${keyword}%`);
    });

    if (category) {
      query = query.andWhere('cat.category_name', category);
    }
    if (complexity) {
      query = query.andWhere('uc.complexity', complexity);
    }

    // Get matching use cases (limit to 10 for search results)
    const rows = await query
      .select('uc.use_case_id', 'uc.title', 'uc.complexity', 'cat.category_name as category', 'uc.description')
      .orderByRaw(`
        CASE uc.complexity
          WHEN 'basic' THEN 1
          WHEN 'intermediate' THEN 2
          WHEN 'advanced' THEN 3
        END
      `)
      .orderBy('uc.use_case_id')
      .limit(10) as Array<{
      use_case_id: number;
      title: string;
      complexity: string;
      category: string;
      description: string;
    }>;

    return {
      total: rows.length,
      use_cases: rows.map(row => ({
        use_case_id: row.use_case_id,
        title: row.title,
        complexity: row.complexity,
        category: row.category,
        description: row.description
      }))
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Failed to search use cases: ${message}` };
  }
}
