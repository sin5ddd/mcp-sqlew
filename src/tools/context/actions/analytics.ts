/**
 * Decision Analytics Action
 *
 * Provides aggregation and analysis capabilities for numeric decisions.
 * Supports basic aggregation (avg, sum, max, min, count), time-series bucketing,
 * and percentile calculation.
 *
 * @module tools/context/actions/analytics
 */

import { getAdapter } from '../../../database.js';
import {
  aggregateNumericDecisions,
  timeSeriesAggregation,
  calculatePercentiles,
  type AggregationType
} from '../../../utils/db-aggregations.js';

/**
 * Analytics action parameters
 */
export interface AnalyticsParams {
  action: 'analytics';
  key_pattern: string;  // SQL LIKE pattern for decision keys
  aggregation: AggregationType;  // 'avg' | 'sum' | 'max' | 'min' | 'count'
  layer?: string;  // Optional layer filter
  time_series?: {
    bucket: 'hour' | 'day' | 'week' | 'month';
    start_ts: number;  // Unix timestamp
    end_ts: number;    // Unix timestamp
  };
  percentiles?: number[];  // e.g., [50, 90, 95, 99]
}

/**
 * Analytics action response
 */
export interface AnalyticsResponse {
  pattern: string;
  aggregation: AggregationType;
  layer?: string;
  result: {
    count: number;
    min: number | null;
    max: number | null;
    avg: number | null;
    sum: number | null;
  };
  time_series?: Array<{
    bucket_ts: number;
    count: number;
    min_value: number | null;
    max_value: number | null;
    avg_value: number | null;
    sum_value: number | null;
  }>;
  percentiles?: Record<number, number>;
}

/**
 * Execute analytics query on numeric decisions
 *
 * @param params - Analytics parameters
 * @returns Analytics result with aggregations, time series, and percentiles
 *
 * @example
 * // Basic aggregation
 * await handleAnalytics({
 *   action: 'analytics',
 *   key_pattern: 'metric/api-latency/%',
 *   aggregation: 'avg',
 *   layer: 'infrastructure'
 * });
 *
 * @example
 * // With time series
 * await handleAnalytics({
 *   action: 'analytics',
 *   key_pattern: 'metric/cpu-usage/%',
 *   aggregation: 'avg',
 *   time_series: {
 *     bucket: 'hour',
 *     start_ts: 1762800000,
 *     end_ts: 1762886400
 *   }
 * });
 *
 * @example
 * // With percentiles
 * await handleAnalytics({
 *   action: 'analytics',
 *   key_pattern: 'metric/response-time/%',
 *   aggregation: 'avg',
 *   percentiles: [50, 90, 95, 99]
 * });
 */
export async function handleAnalytics(params: AnalyticsParams): Promise<AnalyticsResponse> {
  // Validate required parameters
  if (!params.key_pattern) {
    throw new Error('Missing required parameter: key_pattern');
  }

  if (!params.aggregation) {
    throw new Error('Missing required parameter: aggregation');
  }

  const validAggregations: AggregationType[] = ['avg', 'sum', 'max', 'min', 'count'];
  if (!validAggregations.includes(params.aggregation)) {
    throw new Error(
      `Invalid aggregation: ${params.aggregation}. Valid: ${validAggregations.join(', ')}`
    );
  }

  // Get database adapter
  const adapter = getAdapter();
  const knex = adapter.getKnex();

  // Basic aggregation
  const aggregationResult = await aggregateNumericDecisions(
    knex,
    params.key_pattern,
    params.aggregation,
    params.layer
  );

  // Time series analysis (optional)
  let timeSeries: Array<{
    bucket_ts: number;
    count: number;
    min_value: number | null;
    max_value: number | null;
    avg_value: number | null;
    sum_value: number | null;
  }> | undefined;

  if (params.time_series) {
    timeSeries = await timeSeriesAggregation(
      knex,
      params.key_pattern,
      params.time_series.bucket,
      params.time_series.start_ts,
      params.time_series.end_ts
    );
  }

  // Percentile analysis (optional)
  let percentiles: Record<number, number> | undefined;
  if (params.percentiles && params.percentiles.length > 0) {
    percentiles = await calculatePercentiles(
      knex,
      params.key_pattern,
      params.percentiles
    );
  }

  // Build response
  return {
    pattern: params.key_pattern,
    aggregation: params.aggregation,
    layer: params.layer,
    result: {
      count: aggregationResult.count,
      min: aggregationResult.min_value,
      max: aggregationResult.max_value,
      avg: aggregationResult.avg_value,
      sum: aggregationResult.sum_value,
    },
    time_series: timeSeries,
    percentiles,
  };
}
