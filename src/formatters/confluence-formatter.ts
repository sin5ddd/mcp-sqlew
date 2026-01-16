/**
 * Confluence Storage Format formatter
 * Converts export blocks to Confluence Storage Format (XHTML)
 *
 * Output can be:
 * - Posted via Confluence REST API
 * - Pasted into Confluence page source
 *
 * @see https://confluence.atlassian.com/doc/confluence-storage-format-790796544.html
 */

import type { DocumentFormatter, FormatterOptions, ExportBlocks, ExportBlockItem, ExportBlockConstraint } from './types.js';

/**
 * Confluence formatter implementation
 * Generates Confluence Storage Format (XHTML subset)
 */
export class ConfluenceFormatter implements DocumentFormatter {
  format(blocks: ExportBlocks, options: FormatterOptions = {}): string {
    const { include_metadata = true, include_context = false, include_toc = false } = options;
    const parts: string[] = [];

    // Info macro with title
    parts.push(this.infoMacro('Decisions Export', `Exported on ${blocks.metadata.exported_at}`));

    // Table of contents macro
    if (include_toc) {
      parts.push(this.tocMacro());
    }

    // Decision sections
    for (const section of blocks.blocks) {
      parts.push(`<h2>${this.escape(section.title)}</h2>`);

      for (const item of section.items) {
        parts.push(this.formatItem(item, include_metadata, include_context));
      }
    }

    // Constraints section
    if (blocks.constraints && blocks.constraints.length > 0) {
      parts.push('<h2>Constraints</h2>');

      for (const constraint of blocks.constraints) {
        parts.push(this.formatConstraint(constraint));
      }
    }

    return parts.join('\n\n');
  }

  private formatItem(
    item: ExportBlockItem,
    includeMetadata: boolean,
    includeContext: boolean
  ): string {
    const parts: string[] = [];

    // Item heading
    parts.push(`<h3>${this.escape(item.key)}</h3>`);

    // Metadata table
    const rows: string[] = [];
    rows.push(this.tableRow('Value', item.value));

    if (includeMetadata) {
      if (item.version) {
        rows.push(this.tableRow('Version', item.version));
      }
      if (item.updated) {
        rows.push(this.tableRow('Updated', item.updated));
      }
      if (item.layer) {
        rows.push(this.tableRow('Layer', item.layer));
      }
      if (item.tags && item.tags.length > 0) {
        rows.push(this.tableRow('Tags', item.tags.join(', ')));
      }
    }

    parts.push(`<table><tbody>${rows.join('')}</tbody></table>`);

    // Context sections
    if (includeContext) {
      if (item.rationale) {
        parts.push(this.panelMacro('Rationale', item.rationale));
      }

      if (item.alternatives && item.alternatives.length > 0) {
        const altList = item.alternatives.map(alt => `<li>${this.escape(alt)}</li>`).join('');
        parts.push(`<p><strong>Alternatives Considered:</strong></p><ul>${altList}</ul>`);
      }

      if (item.tradeoffs) {
        parts.push(this.panelMacro('Tradeoffs', item.tradeoffs));
      }
    }

    // Horizontal rule
    parts.push('<hr />');

    return parts.join('\n');
  }

  private formatConstraint(constraint: ExportBlockConstraint): string {
    const parts: string[] = [];

    const title = `[${constraint.category}] ${constraint.rule}`;
    parts.push(`<h3>${this.escape(title)}</h3>`);

    const rows: string[] = [];
    rows.push(this.tableRow('Priority', constraint.priority));
    if (constraint.tags && constraint.tags.length > 0) {
      rows.push(this.tableRow('Tags', constraint.tags.join(', ')));
    }

    parts.push(`<table><tbody>${rows.join('')}</tbody></table>`);

    return parts.join('\n');
  }

  // ========== Confluence Macro Helpers ==========

  private infoMacro(title: string, body: string): string {
    return `<ac:structured-macro ac:name="info">
  <ac:parameter ac:name="title">${this.escape(title)}</ac:parameter>
  <ac:rich-text-body>
    <p><em>${this.escape(body)}</em></p>
  </ac:rich-text-body>
</ac:structured-macro>`;
  }

  private panelMacro(title: string, body: string): string {
    return `<ac:structured-macro ac:name="panel">
  <ac:parameter ac:name="title">${this.escape(title)}</ac:parameter>
  <ac:rich-text-body>
    <p>${this.escape(body)}</p>
  </ac:rich-text-body>
</ac:structured-macro>`;
  }

  private tocMacro(): string {
    return `<ac:structured-macro ac:name="toc">
  <ac:parameter ac:name="printable">true</ac:parameter>
  <ac:parameter ac:name="style">disc</ac:parameter>
  <ac:parameter ac:name="maxLevel">3</ac:parameter>
  <ac:parameter ac:name="minLevel">2</ac:parameter>
</ac:structured-macro>`;
  }

  private tableRow(label: string, value: string): string {
    return `<tr><th>${this.escape(label)}</th><td>${this.escape(value)}</td></tr>`;
  }

  private escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
