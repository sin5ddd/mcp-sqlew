/**
 * Plan ID utilities for YAML frontmatter manipulation
 *
 * Handles reading and writing sqlew-plan-id in markdown files.
 * Uses YAML frontmatter format (--- delimited section at top of file).
 *
 * @since v4.1.0
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';

// ============================================================================
// Constants
// ============================================================================

/** YAML frontmatter delimiter */
const FRONTMATTER_DELIMITER = '---';

/** Key for plan ID in frontmatter */
const PLAN_ID_KEY = 'sqlew-plan-id';

// ============================================================================
// Types
// ============================================================================

/**
 * Parsed frontmatter data
 */
export interface Frontmatter {
  /** Raw frontmatter content (between --- delimiters) */
  raw: string;
  /** Parsed key-value pairs */
  data: Record<string, string>;
  /** Content after frontmatter */
  content: string;
  /** Whether the file had frontmatter */
  hasFrontmatter: boolean;
}

// ============================================================================
// Parsing
// ============================================================================

/**
 * Parse YAML frontmatter from markdown content
 *
 * @param content - Full file content
 * @returns Parsed frontmatter and content
 */
export function parseFrontmatter(content: string): Frontmatter {
  const lines = content.split('\n');

  // Check if file starts with ---
  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
    return {
      raw: '',
      data: {},
      content,
      hasFrontmatter: false,
    };
  }

  // Find closing ---
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === FRONTMATTER_DELIMITER) {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    // No closing delimiter - treat as no frontmatter
    return {
      raw: '',
      data: {},
      content,
      hasFrontmatter: false,
    };
  }

  // Extract frontmatter content
  const frontmatterLines = lines.slice(1, endIndex);
  const raw = frontmatterLines.join('\n');
  const data: Record<string, string> = {};

  // Parse simple key: value pairs
  for (const line of frontmatterLines) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      data[key] = value;
    }
  }

  // Extract content after frontmatter
  const restContent = lines.slice(endIndex + 1).join('\n');

  return {
    raw,
    data,
    content: restContent,
    hasFrontmatter: true,
  };
}

/**
 * Serialize frontmatter data back to string
 *
 * @param data - Key-value pairs to serialize
 * @returns YAML frontmatter string (without delimiters)
 */
export function serializeFrontmatter(data: Record<string, string>): string {
  return Object.entries(data)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

/**
 * Build file content with frontmatter
 *
 * @param data - Frontmatter key-value pairs
 * @param content - Main content after frontmatter
 * @returns Complete file content
 */
export function buildFileWithFrontmatter(data: Record<string, string>, content: string): string {
  const frontmatter = serializeFrontmatter(data);
  return `${FRONTMATTER_DELIMITER}\n${frontmatter}\n${FRONTMATTER_DELIMITER}\n${content}`;
}

// ============================================================================
// Plan ID Operations
// ============================================================================

/**
 * Get plan ID from a markdown file
 *
 * @param filePath - Path to markdown file
 * @returns Plan ID or null if not found
 */
export function getPlanId(filePath: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    return frontmatter.data[PLAN_ID_KEY] || null;
  } catch {
    return null;
  }
}

/**
 * Set or add plan ID to a markdown file
 *
 * If the file has no frontmatter, adds one.
 * If the file has frontmatter without plan ID, adds the ID.
 * If the file already has a plan ID, does nothing.
 *
 * @param filePath - Path to markdown file
 * @param planId - Plan ID to set (generates UUID if not provided)
 * @returns The plan ID that was set or already existed
 */
export function ensurePlanId(filePath: string, planId?: string): string {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');
  const frontmatter = parseFrontmatter(content);

  // If already has plan ID, return it
  if (frontmatter.data[PLAN_ID_KEY]) {
    return frontmatter.data[PLAN_ID_KEY];
  }

  // Generate new ID if not provided
  const newPlanId = planId || randomUUID();

  // Add plan ID to frontmatter data
  const newData = {
    [PLAN_ID_KEY]: newPlanId,
    ...frontmatter.data,
  };

  // Build new file content
  const newContent = buildFileWithFrontmatter(newData, frontmatter.content);

  // Write back to file
  writeFileSync(filePath, newContent, 'utf-8');

  return newPlanId;
}

/**
 * Check if a file has a plan ID
 *
 * @param filePath - Path to markdown file
 * @returns true if file has a plan ID
 */
export function hasPlanId(filePath: string): boolean {
  return getPlanId(filePath) !== null;
}

/**
 * Generate a new plan ID (UUID v4)
 *
 * @returns New UUID
 */
export function generatePlanId(): string {
  return randomUUID();
}

/**
 * Extract plan file name from a full path
 *
 * @param filePath - Full path to plan file
 * @returns File name only (e.g., "rippling-spinning-eagle.md")
 */
export function extractPlanFileName(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  return parts[parts.length - 1] || '';
}
