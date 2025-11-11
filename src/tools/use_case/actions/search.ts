/**
 * Use Case Tool - search Action
 * Search use cases by keyword/category
 */

import { DatabaseAdapter, SQLiteAdapter } from '../../../adapters/index.js';
import { getAdapter } from '../../../database.js';
import { UseCaseSearchParams, UseCaseSearchResult } from '../types.js';

/**
 * Helper to get raw better-sqlite3 Database instance from adapter
 */
function getRawDb(adapter: DatabaseAdapter): any {
  if (adapter instanceof SQLiteAdapter) {
    return adapter.getRawDatabase();
  }
  throw new Error('Use case queries only supported for SQLite adapter');
}

/**
 * Search use cases by keyword/category
 */
export async function searchUseCases(
  params: UseCaseSearchParams,
  adapter?: DatabaseAdapter
): Promise<UseCaseSearchResult | { error: string; available_categories?: string[] }> {
  const actualAdapter = adapter ?? getAdapter();
  const db = getRawDb(actualAdapter);

  try {
    const { keyword, category, complexity } = params;

    // Build WHERE clause
    const conditions: string[] = [];
    const queryParams: any[] = [];

    // Full-text search on title and description
    conditions.push('(uc.title LIKE ? OR uc.description LIKE ?)');
    queryParams.push(`%${keyword}%`, `%${keyword}%`);

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
      queryParams.push(category);
    }

    if (complexity) {
      if (!['basic', 'intermediate', 'advanced'].includes(complexity)) {
        return { error: 'Complexity must be one of: basic, intermediate, advanced' };
      }
      conditions.push('uc.complexity = ?');
      queryParams.push(complexity);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Get matching use cases (limit to 10 for search results)
    const rows = db.prepare(`
      SELECT
        uc.use_case_id,
        uc.title,
        uc.complexity,
        cat.category_name as category,
        uc.description
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
      LIMIT 10
    `).all(...queryParams) as Array<{
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
