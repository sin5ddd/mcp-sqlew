import { Knex } from 'knex';
import { getProjectContext } from './project-context.js';

/**
 * Cross-database aggregation utilities
 *
 * Provides portable aggregation functions that work across SQLite, MySQL, and PostgreSQL.
 * Used by decision.analytics action for numeric decision analysis.
 */

export type AggregationType = 'avg' | 'sum' | 'max' | 'min' | 'count';

/**
 * Aggregation result structure
 */
export interface AggregationResult {
  count: number;
  min_value: number | null;
  max_value: number | null;
  avg_value: number | null;
  sum_value: number | null;
}

/**
 * Performs aggregation query on numeric decisions
 *
 * @param knex - Knex instance
 * @param keyPattern - SQL LIKE pattern for decision keys (e.g., "metric/%")
 * @param aggregation - Aggregation type
 * @param layer - Optional layer filter
 * @returns Aggregation result
 *
 * @example
 * const result = await aggregateNumericDecisions(knex, "metric/%", "avg");
 * // { count: 42, avg_value: 75.3, min_value: 12.5, max_value: 98.7, sum_value: 3162.6 }
 */
export async function aggregateNumericDecisions(
  knex: Knex,
  keyPattern: string,
  aggregation: AggregationType,
  layer?: string
): Promise<AggregationResult & { aggregation: AggregationType; pattern: string }> {
  const projectId = getProjectContext().getProjectId();

  // Build base query
  let query = knex('t_decisions_numeric as dn')
    .join('m_context_keys as ck', 'dn.key_id', 'ck.id')
    .where('ck.key', 'like', keyPattern)
    .where('dn.status', 1)  // Active decisions only
    .where('dn.project_id', projectId);  // Multi-project support (v3.7.0+)

  // Add layer filter if provided
  if (layer) {
    query = query
      .join('m_layers as l', 'dn.layer_id', 'l.id')
      .where('l.name', layer);
  }

  // Execute aggregation query (portable across all databases)
  const result = await query
    .select(
      knex.raw('COUNT(*) as count'),
      knex.raw('MIN(dn.value) as min_value'),
      knex.raw('MAX(dn.value) as max_value'),
      knex.raw('AVG(dn.value) as avg_value'),
      knex.raw('SUM(dn.value) as sum_value')
    )
    .first();

  return {
    pattern: keyPattern,
    aggregation,
    count: Number(result?.count ?? 0),
    min_value: result?.min_value !== null ? Number(result.min_value) : null,
    max_value: result?.max_value !== null ? Number(result.max_value) : null,
    avg_value: result?.avg_value !== null ? Number(result.avg_value) : null,
    sum_value: result?.sum_value !== null ? Number(result.sum_value) : null,
  };
}

/**
 * String aggregation helper (database-specific)
 *
 * Aggregates strings with comma separator.
 * Uses GROUP_CONCAT (MySQL/SQLite) or string_agg (PostgreSQL).
 *
 * @param knex - Knex instance
 * @param column - Column name to aggregate
 * @param separator - Separator string (default: ', ')
 * @returns Knex.Raw expression
 *
 * @example
 * const query = knex('table')
 *   .select('id', stringAgg(knex, 'tag_name'))
 *   .groupBy('id');
 */
export function stringAgg(
  knex: Knex,
  column: string,
  separator: string = ', '
): Knex.Raw {
  const client = knex.client.config.client;

  if (client === 'pg' || client === 'postgresql') {
    return knex.raw(`string_agg(${column}, ?)`, [separator]);
  } else {
    // MySQL, MariaDB, SQLite
    return knex.raw(`GROUP_CONCAT(${column}, ?)`, [separator]);
  }
}

/**
 * Time-series aggregation by time bucket
 *
 * Groups numeric decisions by time intervals (hour, day, week, month).
 *
 * @param knex - Knex instance
 * @param keyPattern - SQL LIKE pattern for decision keys
 * @param bucket - Time bucket size: 'hour' | 'day' | 'week' | 'month'
 * @param startTs - Start timestamp (Unix epoch)
 * @param endTs - End timestamp (Unix epoch)
 * @returns Array of time-bucketed aggregations
 *
 * @example
 * const hourly = await timeSeriesAggregation(knex, "metric/api-latency/%", "hour", startTs, endTs);
 * // [{ bucket: 1762800000, count: 120, avg_value: 245.5, ... }, ...]
 */
export async function timeSeriesAggregation(
  knex: Knex,
  keyPattern: string,
  bucket: 'hour' | 'day' | 'week' | 'month',
  startTs: number,
  endTs: number
): Promise<Array<AggregationResult & { bucket_ts: number }>> {
  const projectId = getProjectContext().getProjectId();

  // Calculate bucket size in seconds
  const bucketSize = {
    hour: 3600,
    day: 86400,
    week: 604800,
    month: 2592000, // Approximate 30 days
  }[bucket];

  // Query decisions in time range
  const results = await knex('t_decisions_numeric as dn')
    .join('m_context_keys as ck', 'dn.key_id', 'ck.id')
    .where('ck.key', 'like', keyPattern)
    .where('dn.status', 1)
    .where('dn.project_id', projectId)  // Multi-project support (v3.7.0+)
    .whereBetween('dn.updated_ts', [startTs, endTs])
    .select('dn.value', 'dn.updated_ts');

  // Group by bucket in JavaScript (portable)
  const buckets = new Map<number, number[]>();

  for (const row of results) {
    const bucketTs = Math.floor(row.updated_ts / bucketSize) * bucketSize;
    if (!buckets.has(bucketTs)) {
      buckets.set(bucketTs, []);
    }
    buckets.get(bucketTs)!.push(row.value);
  }

  // Calculate aggregations per bucket
  return Array.from(buckets.entries()).map(([bucketTs, values]) => ({
    bucket_ts: bucketTs,
    count: values.length,
    min_value: Math.min(...values),
    max_value: Math.max(...values),
    avg_value: values.reduce((a, b) => a + b, 0) / values.length,
    sum_value: values.reduce((a, b) => a + b, 0),
  })).sort((a, b) => a.bucket_ts - b.bucket_ts);
}

/**
 * Percentile calculation (portable)
 *
 * Calculates percentile values for numeric decisions.
 * Uses in-memory calculation (works on all databases).
 *
 * @param knex - Knex instance
 * @param keyPattern - SQL LIKE pattern for decision keys
 * @param percentiles - Array of percentiles (0-100)
 * @returns Map of percentile → value
 *
 * @example
 * const percentiles = await calculatePercentiles(knex, "metric/%", [50, 90, 95, 99]);
 * // { 50: 75.3, 90: 142.7, 95: 178.2, 99: 245.8 }
 */
export async function calculatePercentiles(
  knex: Knex,
  keyPattern: string,
  percentiles: number[]
): Promise<Record<number, number>> {
  const projectId = getProjectContext().getProjectId();

  // Fetch all values
  const results = await knex('t_decisions_numeric as dn')
    .join('m_context_keys as ck', 'dn.key_id', 'ck.id')
    .where('ck.key', 'like', keyPattern)
    .where('dn.status', 1)
    .where('dn.project_id', projectId)  // Multi-project support (v3.7.0+)
    .select('dn.value')
    .orderBy('dn.value');

  const values = results.map(r => r.value);

  if (values.length === 0) {
    return percentiles.reduce((acc, p) => ({ ...acc, [p]: 0 }), {});
  }

  // Calculate percentiles
  const result: Record<number, number> = {};

  for (const p of percentiles) {
    const index = Math.ceil((p / 100) * values.length) - 1;
    result[p] = values[Math.max(0, Math.min(index, values.length - 1))];
  }

  return result;
}
