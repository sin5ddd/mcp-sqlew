/**
 * Notion blocks formatter
 * Converts export blocks to Notion Blocks API format
 *
 * Output can be:
 * - Copied and pasted directly into Notion
 * - Posted via Notion API
 *
 * @see https://developers.notion.com/reference/block
 */

import type { DocumentFormatter, FormatterOptions, ExportBlocks, ExportBlockItem, ExportBlockConstraint } from './types.js';

/**
 * Notion block type definitions
 */
interface NotionRichText {
  type: 'text';
  text: { content: string };
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
  };
}

interface NotionBlock {
  type: string;
  [key: string]: unknown;
}

/**
 * Notion formatter implementation
 * Generates Notion Blocks API compatible JSON
 */
export class NotionFormatter implements DocumentFormatter {
  format(blocks: ExportBlocks, options: FormatterOptions = {}): string {
    const { include_metadata = true, include_context = false } = options;
    const notionBlocks: NotionBlock[] = [];

    // Title
    notionBlocks.push(this.heading1('Decisions Export'));

    // Metadata
    if (include_metadata) {
      notionBlocks.push(this.paragraph([
        this.richText(`Exported on ${blocks.metadata.exported_at}`, { italic: true })
      ]));
      notionBlocks.push(this.divider());
    }

    // Decision sections
    for (const section of blocks.blocks) {
      notionBlocks.push(this.heading2(section.title));

      for (const item of section.items) {
        notionBlocks.push(...this.formatItem(item, include_metadata, include_context));
      }
    }

    // Constraints section
    if (blocks.constraints && blocks.constraints.length > 0) {
      notionBlocks.push(this.heading2('Constraints'));

      for (const constraint of blocks.constraints) {
        notionBlocks.push(...this.formatConstraint(constraint));
      }
    }

    return JSON.stringify({ blocks: notionBlocks }, null, 2);
  }

  private formatItem(
    item: ExportBlockItem,
    includeMetadata: boolean,
    includeContext: boolean
  ): NotionBlock[] {
    const blocks: NotionBlock[] = [];

    // Item title
    blocks.push(this.heading3(item.key));

    // Value
    blocks.push(this.paragraph([
      this.richText('Value: ', { bold: true }),
      this.richText(item.value)
    ]));

    // Metadata fields
    if (includeMetadata) {
      const metaFields: NotionRichText[] = [];

      if (item.version) {
        metaFields.push(this.richText('Version: ', { bold: true }));
        metaFields.push(this.richText(`${item.version}  `));
      }
      if (item.updated) {
        metaFields.push(this.richText('Updated: ', { bold: true }));
        metaFields.push(this.richText(`${item.updated}  `));
      }
      if (item.tags && item.tags.length > 0) {
        metaFields.push(this.richText('Tags: ', { bold: true }));
        metaFields.push(this.richText(item.tags.join(', ')));
      }

      if (metaFields.length > 0) {
        blocks.push(this.paragraph(metaFields));
      }
    }

    // Context fields
    if (includeContext) {
      if (item.rationale) {
        blocks.push(this.callout(item.rationale, '💡'));
      }

      if (item.alternatives && item.alternatives.length > 0) {
        blocks.push(this.paragraph([
          this.richText('Alternatives Considered:', { bold: true })
        ]));
        for (const alt of item.alternatives) {
          blocks.push(this.bulletedListItem(alt));
        }
      }

      if (item.tradeoffs) {
        blocks.push(this.paragraph([
          this.richText('Tradeoffs:', { bold: true })
        ]));
        blocks.push(this.paragraph([this.richText(item.tradeoffs)]));
      }
    }

    blocks.push(this.divider());

    return blocks;
  }

  private formatConstraint(constraint: ExportBlockConstraint): NotionBlock[] {
    const blocks: NotionBlock[] = [];

    blocks.push(this.heading3(`[${constraint.category}] ${constraint.rule}`));
    blocks.push(this.paragraph([
      this.richText('Priority: ', { bold: true }),
      this.richText(constraint.priority)
    ]));

    if (constraint.tags && constraint.tags.length > 0) {
      blocks.push(this.paragraph([
        this.richText('Tags: ', { bold: true }),
        this.richText(constraint.tags.join(', '))
      ]));
    }

    return blocks;
  }

  // ========== Notion Block Helpers ==========

  private richText(content: string, annotations?: NotionRichText['annotations']): NotionRichText {
    const rt: NotionRichText = {
      type: 'text',
      text: { content }
    };
    if (annotations) {
      rt.annotations = annotations;
    }
    return rt;
  }

  private heading1(text: string): NotionBlock {
    return {
      type: 'heading_1',
      heading_1: {
        rich_text: [this.richText(text)]
      }
    };
  }

  private heading2(text: string): NotionBlock {
    return {
      type: 'heading_2',
      heading_2: {
        rich_text: [this.richText(text)]
      }
    };
  }

  private heading3(text: string): NotionBlock {
    return {
      type: 'heading_3',
      heading_3: {
        rich_text: [this.richText(text)]
      }
    };
  }

  private paragraph(richTexts: NotionRichText[]): NotionBlock {
    return {
      type: 'paragraph',
      paragraph: {
        rich_text: richTexts
      }
    };
  }

  private bulletedListItem(text: string): NotionBlock {
    return {
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [this.richText(text)]
      }
    };
  }

  private callout(text: string, emoji: string): NotionBlock {
    return {
      type: 'callout',
      callout: {
        rich_text: [this.richText(text)],
        icon: { type: 'emoji', emoji }
      }
    };
  }

  private divider(): NotionBlock {
    return {
      type: 'divider',
      divider: {}
    };
  }
}
