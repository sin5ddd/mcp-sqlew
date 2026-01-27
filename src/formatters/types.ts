/**
 * Formatter type definitions
 * Shared types for document formatters (v5.0.0)
 */

import type { ExportBlocks } from '../types.js';

/**
 * Options for document formatters
 */
export interface FormatterOptions {
  /** Include metadata (timestamps, versions) in output */
  include_metadata?: boolean;
  /** Include decision context (rationale, alternatives, tradeoffs) */
  include_context?: boolean;
  /** Include table of contents (Markdown/ADR only) */
  include_toc?: boolean;
}

/**
 * Document formatter interface
 * All formatters must implement this interface
 */
export interface DocumentFormatter {
  /**
   * Format export blocks to output string
   * @param blocks - Structured blocks from SaaS
   * @param options - Formatting options
   * @returns Formatted document string
   */
  format(blocks: ExportBlocks, options?: FormatterOptions): string;
}

// Re-export for convenience
export type { ExportBlocks, ExportBlockItem, ExportBlockSection, ExportBlockConstraint } from '../types.js';
