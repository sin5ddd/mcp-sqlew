/**
 * Export decisions/constraints to document formats
 * SaaS-only feature (v5.0.0)
 *
 * This action retrieves structured blocks from SaaS and formats them
 * into various document formats (Markdown, ADR, Notion, Confluence).
 *
 * Note: LocalBackend throws an error for this action.
 * Only SaaS backend can provide the data.
 */

import type {
  ExportDecisionParams,
  ExportDecisionResponse,
  ExportBlocks,
  ExportFormat
} from '../../../types.js';
import { formatBlocks } from '../../../formatters/index.js';

/**
 * SaaS-only error message
 * Thrown when LocalBackend attempts to call export action
 */
export const EXPORT_SAAS_ONLY_ERROR =
  'Export feature is SaaS-only. ' +
  'To use document export, connect to sqlew SaaS (set SQLEW_API_KEY). ' +
  'For local JSON backup, use: npm run db:export';

/**
 * Format export blocks from SaaS into the requested output format
 *
 * This function is called after receiving ExportBlocks from SaaS backend.
 * It applies the appropriate formatter based on the requested format.
 *
 * @param blocks - Structured blocks from SaaS
 * @param params - Export parameters including format and options
 * @returns Formatted export response
 */
export function formatExportBlocks(
  blocks: ExportBlocks,
  params: ExportDecisionParams
): ExportDecisionResponse {
  const { format, include_metadata, include_context } = params;

  let content: string | ExportBlocks;

  if (format === 'blocks') {
    // Return raw blocks without transformation
    content = blocks;
  } else {
    // Apply formatter
    content = formatBlocks(blocks, format, {
      include_metadata,
      include_context
    });
  }

  return {
    success: true,
    format,
    content,
    metadata: {
      total_decisions: blocks.metadata.total_decisions,
      total_constraints: blocks.metadata.total_constraints,
      exported_at: blocks.metadata.exported_at
    }
  };
}

/**
 * Validate export parameters
 *
 * @param params - Export parameters to validate
 * @throws Error if parameters are invalid
 */
export function validateExportParams(params: ExportDecisionParams): void {
  const validFormats: ExportFormat[] = ['blocks', 'markdown', 'adr', 'notion', 'confluence'];

  if (!params.format) {
    throw new Error('Missing required parameter: format');
  }

  if (!validFormats.includes(params.format)) {
    throw new Error(
      `Invalid format: "${params.format}". ` +
      `Valid formats: ${validFormats.join(', ')}`
    );
  }

  // Validate status array if provided
  if (params.status) {
    const validStatuses = ['active', 'deprecated', 'draft', 'in_progress', 'in_review', 'implemented'];
    for (const status of params.status) {
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: "${status}"`);
      }
    }
  }

  // Validate group_by if provided
  if (params.group_by) {
    const validGroupBy = ['layer', 'tag', 'none'];
    if (!validGroupBy.includes(params.group_by)) {
      throw new Error(`Invalid group_by: "${params.group_by}". Valid values: ${validGroupBy.join(', ')}`);
    }
  }

  // Validate since timestamp format if provided
  if (params.since) {
    const date = new Date(params.since);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid since timestamp: "${params.since}". Use ISO 8601 format.`);
    }
  }
}
