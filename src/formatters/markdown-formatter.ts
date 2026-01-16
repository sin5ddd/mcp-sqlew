/**
 * Markdown document formatter
 * Converts export blocks to Markdown format
 */

import type { DocumentFormatter, FormatterOptions, ExportBlocks, ExportBlockSection, ExportBlockConstraint } from './types.js';

/**
 * Markdown formatter implementation
 * Generates standard Markdown that can be used in README, Wiki, etc.
 */
export class MarkdownFormatter implements DocumentFormatter {
  format(blocks: ExportBlocks, options: FormatterOptions = {}): string {
    const lines: string[] = [];
    const { include_metadata = true, include_context = false, include_toc = false } = options;

    // Title
    lines.push('# Decisions Export');
    lines.push('');

    // Metadata
    if (include_metadata) {
      lines.push(`*Exported on ${blocks.metadata.exported_at}*`);
      lines.push('');
    }

    // Table of contents
    if (include_toc && blocks.blocks.length > 0) {
      lines.push('## Table of Contents');
      lines.push('');
      for (const section of blocks.blocks) {
        const anchor = this.toAnchor(section.title);
        lines.push(`- [${section.title}](#${anchor})`);
      }
      if (blocks.constraints && blocks.constraints.length > 0) {
        lines.push('- [Constraints](#constraints)');
      }
      lines.push('');
    }

    // Decision sections
    for (const section of blocks.blocks) {
      lines.push(...this.formatSection(section, include_metadata, include_context));
    }

    // Constraints section
    if (blocks.constraints && blocks.constraints.length > 0) {
      lines.push('## Constraints');
      lines.push('');
      for (const constraint of blocks.constraints) {
        lines.push(...this.formatConstraint(constraint));
      }
    }

    return lines.join('\n');
  }

  private formatSection(
    section: ExportBlockSection,
    includeMetadata: boolean,
    includeContext: boolean
  ): string[] {
    const lines: string[] = [];

    lines.push(`## ${section.title}`);
    lines.push('');

    for (const item of section.items) {
      lines.push(`### ${item.key}`);
      lines.push('');
      lines.push(`**Value:** ${item.value}`);

      if (includeMetadata) {
        if (item.version) {
          lines.push(`**Version:** ${item.version}`);
        }
        if (item.updated) {
          lines.push(`**Updated:** ${item.updated}`);
        }
        if (item.tags && item.tags.length > 0) {
          lines.push(`**Tags:** ${item.tags.join(', ')}`);
        }
      }

      if (includeContext) {
        if (item.rationale) {
          lines.push('');
          lines.push('**Rationale:**');
          lines.push(item.rationale);
        }
        if (item.alternatives && item.alternatives.length > 0) {
          lines.push('');
          lines.push('**Alternatives Considered:**');
          for (const alt of item.alternatives) {
            lines.push(`- ${alt}`);
          }
        }
        if (item.tradeoffs) {
          lines.push('');
          lines.push('**Tradeoffs:**');
          lines.push(item.tradeoffs);
        }
      }

      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines;
  }

  private formatConstraint(constraint: ExportBlockConstraint): string[] {
    const lines: string[] = [];

    lines.push(`### [${constraint.category}] ${constraint.rule}`);
    lines.push('');
    lines.push(`**Priority:** ${constraint.priority}`);
    if (constraint.tags && constraint.tags.length > 0) {
      lines.push(`**Tags:** ${constraint.tags.join(', ')}`);
    }
    lines.push('');

    return lines;
  }

  private toAnchor(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-');
  }
}
