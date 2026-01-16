/**
 * Document Formatters (v5.0.0)
 *
 * Converts SaaS export blocks to various document formats:
 * - Markdown: Standard markdown for README, Wiki
 * - ADR: Architecture Decision Records format
 * - Notion: Notion Blocks API JSON
 * - Confluence: Confluence Storage Format (XHTML)
 */

// Types
export type { DocumentFormatter, FormatterOptions, ExportBlocks } from './types.js';

// Formatters
export { MarkdownFormatter } from './markdown-formatter.js';
export { AdrFormatter } from './adr-formatter.js';
export { NotionFormatter } from './notion-formatter.js';
export { ConfluenceFormatter } from './confluence-formatter.js';

// Import for factory
import type { ExportFormat } from '../types.js';
import type { DocumentFormatter, FormatterOptions, ExportBlocks } from './types.js';
import { MarkdownFormatter } from './markdown-formatter.js';
import { AdrFormatter } from './adr-formatter.js';
import { NotionFormatter } from './notion-formatter.js';
import { ConfluenceFormatter } from './confluence-formatter.js';

/**
 * Create a formatter instance for the given format
 * @param format - Output format type
 * @returns DocumentFormatter instance
 * @throws Error if format is 'blocks' (no transformation needed) or unknown
 */
export function createFormatter(format: ExportFormat): DocumentFormatter {
  switch (format) {
    case 'markdown':
      return new MarkdownFormatter();
    case 'adr':
      return new AdrFormatter();
    case 'notion':
      return new NotionFormatter();
    case 'confluence':
      return new ConfluenceFormatter();
    case 'blocks':
      throw new Error('blocks format does not require a formatter - return raw ExportBlocks');
    default:
      throw new Error(`Unknown format: ${format}`);
  }
}

/**
 * Format export blocks using the specified format
 * Convenience function that creates formatter and applies it
 *
 * @param blocks - Export blocks from SaaS
 * @param format - Output format
 * @param options - Formatter options
 * @returns Formatted string (or ExportBlocks JSON string for 'blocks' format)
 */
export function formatBlocks(
  blocks: ExportBlocks,
  format: ExportFormat,
  options?: FormatterOptions
): string {
  if (format === 'blocks') {
    return JSON.stringify(blocks, null, 2);
  }

  const formatter = createFormatter(format);
  return formatter.format(blocks, options);
}
