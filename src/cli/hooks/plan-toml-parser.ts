/**
 * Plan TOML Parser
 *
 * Parses ```toml blocks from plan markdown files to extract
 * [[decision]] and [[constraint]] entries.
 *
 * Uses smol-toml (already a project dependency) for parsing.
 *
 * @since v4.2.0
 */

import { parse as parseToml } from 'smol-toml';
import type { DecisionCandidate, ConstraintCandidate } from '../../config/global-config.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of parsing plan TOML content
 */
export interface ParsedPlanToml {
  /** Extracted decision candidates */
  decisions: DecisionCandidate[];
  /** Extracted constraint candidates */
  constraints: ConstraintCandidate[];
}

/**
 * Raw parsed TOML structure (before validation)
 */
interface RawTomlData {
  decision?: unknown[];
  constraint?: unknown[];
}

// ============================================================================
// TOML Block Extraction
// ============================================================================

/**
 * Extract all ```toml blocks from markdown content
 *
 * @param content - Full markdown content
 * @returns Array of TOML block contents (without fences)
 */
export function extractTomlBlocks(content: string): string[] {
  const blocks: string[] = [];

  // Match ```toml ... ``` blocks (case-insensitive for 'toml')
  // Use non-greedy matching to handle multiple blocks
  const regex = /```toml\s*\n([\s\S]*?)```/gi;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match[1]) {
      blocks.push(match[1].trim());
    }
  }

  return blocks;
}

// ============================================================================
// Decision Parsing
// ============================================================================

/**
 * Parse and validate a decision entry
 *
 * @param raw - Raw decision object from TOML
 * @returns Validated DecisionCandidate or null if invalid
 */
function parseDecision(raw: unknown): DecisionCandidate | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // Required fields
  if (typeof obj.key !== 'string' || typeof obj.value !== 'string') {
    return null;
  }

  const decision: DecisionCandidate = {
    key: obj.key,
    value: obj.value,
  };

  // Optional fields
  if (typeof obj.status === 'string') {
    decision.status = obj.status;
  }
  if (typeof obj.layer === 'string') {
    decision.layer = obj.layer;
  }
  if (Array.isArray(obj.tags)) {
    decision.tags = obj.tags.filter((t): t is string => typeof t === 'string');
  }
  if (typeof obj.rationale === 'string') {
    decision.rationale = obj.rationale;
  }
  if (Array.isArray(obj.alternatives)) {
    decision.alternatives = obj.alternatives.filter((a): a is string => typeof a === 'string');
  }
  if (typeof obj.tradeoffs === 'string') {
    decision.tradeoffs = obj.tradeoffs;
  }

  return decision;
}

// ============================================================================
// Constraint Parsing
// ============================================================================

/**
 * Parse and validate a constraint entry
 *
 * @param raw - Raw constraint object from TOML
 * @returns Validated ConstraintCandidate or null if invalid
 */
function parseConstraint(raw: unknown): ConstraintCandidate | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // Required fields
  if (typeof obj.text !== 'string' || typeof obj.category !== 'string') {
    return null;
  }

  const constraint: ConstraintCandidate = {
    text: obj.text,
    category: obj.category,
  };

  // Optional fields
  if (typeof obj.priority === 'string') {
    constraint.priority = obj.priority;
  }
  if (typeof obj.layer === 'string') {
    constraint.layer = obj.layer;
  }
  if (Array.isArray(obj.tags)) {
    constraint.tags = obj.tags.filter((t): t is string => typeof t === 'string');
  }
  if (typeof obj.rationale === 'string') {
    constraint.rationale = obj.rationale;
  }

  return constraint;
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse a single TOML block and extract decisions/constraints
 *
 * @param tomlContent - TOML content (without fences)
 * @returns Parsed decisions and constraints
 */
export function parseTomlBlock(tomlContent: string): ParsedPlanToml {
  const result: ParsedPlanToml = {
    decisions: [],
    constraints: [],
  };

  try {
    const parsed = parseToml(tomlContent) as RawTomlData;

    // Parse [[decision]] entries
    if (Array.isArray(parsed.decision)) {
      for (const raw of parsed.decision) {
        const decision = parseDecision(raw);
        if (decision) {
          result.decisions.push(decision);
        }
      }
    }

    // Parse [[constraint]] entries
    if (Array.isArray(parsed.constraint)) {
      for (const raw of parsed.constraint) {
        const constraint = parseConstraint(raw);
        if (constraint) {
          result.constraints.push(constraint);
        }
      }
    }
  } catch (error) {
    // TOML parse error - return empty result
    // Errors are expected for non-TOML content or malformed blocks
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[plan-toml-parser] TOML parse error: ${message}`);
  }

  return result;
}

/**
 * Parse plan content and extract all decisions/constraints from TOML blocks
 *
 * @param content - Full markdown content of plan file
 * @returns Merged decisions and constraints from all TOML blocks
 */
export function parsePlanToml(content: string): ParsedPlanToml {
  const result: ParsedPlanToml = {
    decisions: [],
    constraints: [],
  };

  // Extract all ```toml blocks
  const blocks = extractTomlBlocks(content);

  // Parse each block and merge results
  for (const block of blocks) {
    const parsed = parseTomlBlock(block);
    result.decisions.push(...parsed.decisions);
    result.constraints.push(...parsed.constraints);
  }

  return result;
}
