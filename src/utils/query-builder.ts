/**
 * Query builder utilities for dynamic SQL query construction
 * Eliminates duplicated WHERE clause building across tool files
 */

/**
 * Filter condition types
 */
export type FilterCondition =
  | { type: 'equals'; field: string; value: any }
  | { type: 'like'; field: string; value: string }
  | { type: 'notLike'; field: string; value: string }
  | { type: 'greaterThanOrEqual'; field: string; value: number }
  | { type: 'lessThanOrEqual'; field: string; value: number }
  | { type: 'in'; field: string; values: any[]; operator: 'OR' | 'AND' }
  | { type: 'likeAny'; field: string; values: string[]; operator: 'OR' | 'AND' }
  | { type: 'likeExclude'; field: string; values: string[] };

/**
 * Build WHERE clause from filter conditions
 * Returns both the SQL fragment and parameter array
 *
 * @param conditions - Array of filter conditions
 * @returns Object with whereClause SQL and params array
 */
export function buildWhereClause(conditions: FilterCondition[]): {
  whereClause: string;
  params: any[]
} {
  if (conditions.length === 0) {
    return { whereClause: '', params: [] };
  }

  const clauses: string[] = [];
  const params: any[] = [];

  for (const condition of conditions) {
    switch (condition.type) {
      case 'equals':
        clauses.push(`${condition.field} = ?`);
        params.push(condition.value);
        break;

      case 'like':
        clauses.push(`${condition.field} LIKE ?`);
        params.push(`%${condition.value}%`);
        break;

      case 'notLike':
        clauses.push(`(${condition.field} IS NULL OR (${condition.field} NOT LIKE ? AND ${condition.field} != ?))`);
        params.push(`%${condition.value}%`, condition.value);
        break;

      case 'greaterThanOrEqual':
        clauses.push(`${condition.field} >= ?`);
        params.push(condition.value);
        break;

      case 'lessThanOrEqual':
        clauses.push(`${condition.field} <= ?`);
        params.push(condition.value);
        break;

      case 'in':
        if (condition.values.length > 0) {
          if (condition.operator === 'OR') {
            // Match any value (OR logic)
            const inConditions = condition.values.map(() => `${condition.field} = ?`).join(' OR ');
            clauses.push(`(${inConditions})`);
            params.push(...condition.values);
          } else {
            // Match all values (AND logic) - typically not used for IN, but included for completeness
            for (const value of condition.values) {
              clauses.push(`${condition.field} = ?`);
              params.push(value);
            }
          }
        }
        break;

      case 'likeAny':
        if (condition.values.length > 0) {
          if (condition.operator === 'OR') {
            // Match any value with LIKE (OR logic)
            const likeConditions = condition.values.map(() => `${condition.field} LIKE ?`).join(' OR ');
            clauses.push(`(${likeConditions})`);
            for (const value of condition.values) {
              params.push(`%${value}%`);
            }
          } else {
            // Match all values with LIKE (AND logic)
            for (const value of condition.values) {
              clauses.push(`${condition.field} LIKE ?`);
              params.push(`%${value}%`);
            }
          }
        }
        break;

      case 'likeExclude':
        if (condition.values.length > 0) {
          // Exclude all specified values (NOT LIKE for each)
          for (const value of condition.values) {
            clauses.push(`(${condition.field} IS NULL OR (${condition.field} NOT LIKE ? AND ${condition.field} != ?))`);
            params.push(`%${value}%`, value);
          }
        }
        break;
    }
  }

  const whereClause = clauses.length > 0 ? ' AND ' + clauses.join(' AND ') : '';
  return { whereClause, params };
}

/**
 * Build complete query with WHERE clause, ORDER BY, and LIMIT
 *
 * @param baseQuery - Base SELECT query (e.g., "SELECT * FROM table WHERE 1=1")
 * @param conditions - Filter conditions
 * @param orderBy - ORDER BY clause (e.g., "updated DESC")
 * @param limit - LIMIT value
 * @param offset - OFFSET value (optional)
 * @returns Object with complete SQL query and params array
 */
export function buildCompleteQuery(
  baseQuery: string,
  conditions: FilterCondition[],
  orderBy?: string,
  limit?: number,
  offset?: number
): {
  query: string;
  params: any[];
} {
  const { whereClause, params } = buildWhereClause(conditions);

  let query = baseQuery + whereClause;

  if (orderBy) {
    query += ` ORDER BY ${orderBy}`;
  }

  if (limit !== undefined) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  if (offset !== undefined && offset > 0) {
    query += ' OFFSET ?';
    params.push(offset);
  }

  return { query, params };
}
