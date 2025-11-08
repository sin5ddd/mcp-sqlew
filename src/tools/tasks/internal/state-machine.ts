/**
 * Task status state machine logic
 */

import { VALID_TRANSITIONS, ID_TO_STATUS, STATUS_TO_ID } from '../types.js';

/**
 * Validate status transition
 */
export function validateStatusTransition(
  currentStatusId: number,
  newStatus: string
): void {
  const newStatusId = STATUS_TO_ID[newStatus];

  if (!newStatusId) {
    throw new Error(`Invalid new_status: ${newStatus}. Must be one of: todo, in_progress, waiting_review, blocked, done, archived`);
  }

  // Check if transition is valid
  const validNextStatuses = VALID_TRANSITIONS[currentStatusId] || [];
  if (!validNextStatuses.includes(newStatusId)) {
    throw new Error(
      `Invalid transition from ${ID_TO_STATUS[currentStatusId]} to ${newStatus}. ` +
      `Valid transitions: ${validNextStatuses.map(id => ID_TO_STATUS[id]).join(', ')}`
    );
  }
}

/**
 * Get status ID from status name
 */
export function getStatusId(status: string): number {
  const statusId = STATUS_TO_ID[status];
  if (!statusId) {
    throw new Error(`Invalid status: ${status}. Must be one of: todo, in_progress, waiting_review, blocked, done, archived`);
  }
  return statusId;
}

/**
 * Get status name from status ID
 */
export function getStatusName(statusId: number): string {
  return ID_TO_STATUS[statusId] || 'unknown';
}
