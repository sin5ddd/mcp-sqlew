/**
 * ADR (Architecture Decision Records) formatter
 * Converts export blocks to ADR standard format
 *
 * ADR format follows the standard structure:
 * - Title with ADR number
 * - Status
 * - Context (rationale)
 * - Decision
 * - Consequences (tradeoffs)
 */

import type { DocumentFormatter, FormatterOptions, ExportBlocks, ExportBlockItem } from './types.js';

/**
 * ADR formatter implementation
 * Generates Architecture Decision Records in standard format
 */
export class AdrFormatter implements DocumentFormatter {
  format(blocks: ExportBlocks, options: FormatterOptions = {}): string {
    const lines: string[] = [];
    const { include_metadata = true, include_toc = false } = options;

    // Title
    lines.push('# Architecture Decision Records');
    lines.push('');

    // Metadata
    if (include_metadata) {
      lines.push(`*Generated on ${blocks.metadata.exported_at}*`);
      lines.push(`*Total: ${blocks.metadata.total_decisions} decisions*`);
      lines.push('');
    }

    // Table of contents
    if (include_toc) {
      lines.push('## Index');
      lines.push('');
      let adrNumber = 1;
      for (const section of blocks.blocks) {
        for (const item of section.items) {
          const paddedNum = String(adrNumber).padStart(3, '0');
          lines.push(`- [ADR-${paddedNum}](#adr-${paddedNum}-${this.toAnchor(item.key)}): ${item.key}`);
          adrNumber++;
        }
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    // Generate ADRs
    let adrNumber = 1;
    for (const section of blocks.blocks) {
      for (const item of section.items) {
        lines.push(...this.formatAdr(item, adrNumber, section.title));
        adrNumber++;
      }
    }

    return lines.join('\n');
  }

  private formatAdr(item: ExportBlockItem, number: number, sectionTitle: string): string[] {
    const lines: string[] = [];
    const paddedNum = String(number).padStart(3, '0');

    // ADR Header
    lines.push(`## ADR-${paddedNum}: ${item.key}`);
    lines.push('');

    // Status and metadata
    lines.push('| Field | Value |');
    lines.push('|-------|-------|');
    lines.push(`| **Status** | Active |`);
    if (item.updated) {
      lines.push(`| **Date** | ${item.updated.split('T')[0]} |`);
    }
    if (item.layer) {
      lines.push(`| **Layer** | ${item.layer} |`);
    } else {
      lines.push(`| **Layer** | ${sectionTitle} |`);
    }
    if (item.version) {
      lines.push(`| **Version** | ${item.version} |`);
    }
    if (item.tags && item.tags.length > 0) {
      lines.push(`| **Tags** | ${item.tags.join(', ')} |`);
    }
    lines.push('');

    // Context section
    lines.push('### Context');
    lines.push('');
    if (item.rationale) {
      lines.push(item.rationale);
    } else {
      lines.push('*No context provided.*');
    }
    lines.push('');

    // Decision section
    lines.push('### Decision');
    lines.push('');
    lines.push(item.value);
    lines.push('');

    // Alternatives considered
    if (item.alternatives && item.alternatives.length > 0) {
      lines.push('### Alternatives Considered');
      lines.push('');
      for (const alt of item.alternatives) {
        lines.push(`- ${alt}`);
      }
      lines.push('');
    }

    // Consequences section
    lines.push('### Consequences');
    lines.push('');
    if (item.tradeoffs) {
      lines.push(item.tradeoffs);
    } else {
      lines.push('*No consequences documented.*');
    }
    lines.push('');

    // Separator
    lines.push('---');
    lines.push('');

    return lines;
  }

  private toAnchor(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s/]+/g, '-');
  }
}
