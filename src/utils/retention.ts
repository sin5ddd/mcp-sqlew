/**
 * Weekend-aware retention logic for auto-deletion
 * Calculates cutoff timestamps that skip weekends when configured
 */

import { Database } from '../types.js';
import { getConfigBool, getConfigInt } from '../database.js';
import { CONFIG_KEYS } from '../constants.js';

/**
 * Calculate cutoff timestamp for message retention
 * Respects weekend-awareness configuration
 *
 * @param db - Database instance
 * @returns Unix timestamp (seconds) for cutoff
 */
export function calculateMessageCutoff(db: Database): number {
  const ignoreWeekends = getConfigBool(db, CONFIG_KEYS.AUTODELETE_IGNORE_WEEKEND, false);
  const retentionHours = getConfigInt(db, CONFIG_KEYS.AUTODELETE_MESSAGE_HOURS, 24);

  return calculateCutoffTimestamp(retentionHours, ignoreWeekends, 'hours');
}

/**
 * Calculate cutoff timestamp for file change retention
 * Respects weekend-awareness configuration
 *
 * @param db - Database instance
 * @returns Unix timestamp (seconds) for cutoff
 */
export function calculateFileChangeCutoff(db: Database): number {
  const ignoreWeekends = getConfigBool(db, CONFIG_KEYS.AUTODELETE_IGNORE_WEEKEND, false);
  const retentionDays = getConfigInt(db, CONFIG_KEYS.AUTODELETE_FILE_HISTORY_DAYS, 7);

  return calculateCutoffTimestamp(retentionDays, ignoreWeekends, 'days');
}

/**
 * Calculate cutoff timestamp for task archive (done → archived)
 * Respects weekend-awareness configuration
 *
 * @param db - Database instance
 * @returns Unix timestamp (seconds) for cutoff
 */
export function calculateTaskArchiveCutoff(db: Database): number {
  const ignoreWeekends = getConfigBool(db, CONFIG_KEYS.AUTODELETE_IGNORE_WEEKEND, false);
  const retentionDays = getConfigInt(db, CONFIG_KEYS.AUTO_ARCHIVE_DONE_DAYS, 2); // Default: 2 days (48 hours)

  return calculateCutoffTimestamp(retentionDays, ignoreWeekends, 'days');
}

/**
 * Calculate cutoff timestamp with optional weekend-awareness
 *
 * @param retention - Retention period (hours or days)
 * @param ignoreWeekends - Whether to skip weekends in calculation
 * @param unit - Time unit ('hours' or 'days')
 * @returns Unix timestamp (seconds) for cutoff
 */
export function calculateCutoffTimestamp(
  retention: number,
  ignoreWeekends: boolean,
  unit: 'hours' | 'days'
): number {
  const now = new Date();

  if (!ignoreWeekends) {
    // Simple calculation: just subtract the retention period
    const milliseconds = unit === 'hours' ? retention * 60 * 60 * 1000 : retention * 24 * 60 * 60 * 1000;
    return Math.floor((now.getTime() - milliseconds) / 1000);
  }

  // Weekend-aware calculation
  const targetDate = subtractBusinessTime(now, retention, unit);
  return Math.floor(targetDate.getTime() / 1000);
}

/**
 * Subtract business time (skipping weekends) from a date
 *
 * @param date - Starting date
 * @param amount - Amount to subtract
 * @param unit - Time unit ('hours' or 'days')
 * @returns New date with business time subtracted
 */
function subtractBusinessTime(date: Date, amount: number, unit: 'hours' | 'days'): Date {
  const result = new Date(date);

  if (unit === 'days') {
    // Subtract days, skipping weekends
    let daysToSubtract = amount;

    while (daysToSubtract > 0) {
      result.setDate(result.getDate() - 1);

      // Only count weekdays (Monday=1, Sunday=0)
      const dayOfWeek = result.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        daysToSubtract--;
      }
    }
  } else {
    // Subtract hours, skipping weekends
    let hoursToSubtract = amount;

    while (hoursToSubtract > 0) {
      result.setHours(result.getHours() - 1);

      // Only count weekday hours (Monday=1, Sunday=0)
      const dayOfWeek = result.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        hoursToSubtract--;
      }
    }
  }

  return result;
}

/**
 * Count the number of weekend days between two dates (inclusive)
 *
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Number of weekend days (Saturdays and Sundays)
 */
export function countWeekendDays(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);

  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Add business days to a date (skipping weekends)
 *
 * @param date - Starting date
 * @param days - Number of business days to add
 * @returns New date with business days added
 */
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let daysToAdd = days;

  while (daysToAdd > 0) {
    result.setDate(result.getDate() + 1);

    // Only count weekdays (Monday=1, Sunday=0)
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysToAdd--;
    }
  }

  return result;
}
