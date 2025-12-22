/**
 * Suggest Hook Command
 *
 * PreToolUse hook for Task tool - suggests related decisions.
 * Extracts keywords from task description/prompt and finds related decisions.
 *
 * Usage:
 *   echo '{"tool_input": {"description": "implement auth"}}' | sqlew suggest
 *
 * @since v4.1.0
 */

import { readStdinJson, sendContinue, getProjectPath, type HookInput } from './stdin-parser.js';
import { initializeDatabase } from '../../database.js';
import { suggestByContext } from '../../tools/suggest/actions/by-context.js';
import { join } from 'path';

// ============================================================================
// Constants
// ============================================================================

/** Minimum keyword length to use for search */
const MIN_KEYWORD_LENGTH = 3;

/** Default limit for suggestions */
const DEFAULT_LIMIT = 5;

/** Minimum score for suggestions */
const MIN_SCORE = 30;

// ============================================================================
// Keyword Extraction
// ============================================================================

/**
 * Extract meaningful keywords from text
 *
 * Removes common stop words and short words.
 *
 * @param text - Text to extract keywords from
 * @returns Array of keywords
 */
function extractKeywords(text: string): string[] {
  // Common stop words to filter out
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'this', 'that',
    'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what',
    'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
    'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not',
    'only', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now',
    'use', 'using', 'implement', 'create', 'add', 'update', 'fix', 'make',
    'get', 'set', 'new', 'file', 'code', 'function', 'method', 'class',
  ]);

  // Split on word boundaries and filter
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, ' ')
    .split(/\s+/)
    .filter(word =>
      word.length >= MIN_KEYWORD_LENGTH &&
      !stopWords.has(word) &&
      !/^\d+$/.test(word)  // Filter out pure numbers
    );

  // Deduplicate while preserving order
  return [...new Set(words)];
}

/**
 * Extract search context from hook input
 *
 * Combines description and prompt from Task tool input.
 *
 * @param input - Hook input
 * @returns Combined search text
 */
function extractSearchContext(input: HookInput): string {
  const parts: string[] = [];

  // Task tool uses description and prompt
  if (input.tool_input?.description) {
    parts.push(input.tool_input.description);
  }

  if (input.tool_input?.prompt) {
    parts.push(input.tool_input.prompt);
  }

  return parts.join(' ');
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main suggest command entry point
 *
 * Called as PreToolUse hook when Task tool is invoked.
 * Finds related decisions and injects them as context.
 */
export async function suggestCommand(): Promise<void> {
  try {
    const input = await readStdinJson();

    // Only process Task tool
    if (input.tool_name !== 'Task') {
      sendContinue();
      return;
    }

    const projectPath = getProjectPath(input);
    if (!projectPath) {
      sendContinue();
      return;
    }

    // Extract search context
    const searchText = extractSearchContext(input);
    if (!searchText.trim()) {
      sendContinue();
      return;
    }

    // Extract keywords for search
    const keywords = extractKeywords(searchText);
    if (keywords.length === 0) {
      sendContinue();
      return;
    }

    // Initialize database
    const dbPath = join(projectPath, '.sqlew', 'sqlew.db');
    try {
      await initializeDatabase({ configPath: dbPath });
    } catch {
      // Database not initialized - continue without suggestions
      sendContinue();
      return;
    }

    // Build search key from keywords
    const searchKey = keywords.slice(0, 5).join(' ');

    // Find related decisions
    const result = await suggestByContext({
      key: searchKey,
      limit: DEFAULT_LIMIT,
      min_score: MIN_SCORE,
    });

    if (result.suggestions.length === 0) {
      sendContinue();
      return;
    }

    // Format suggestions as context
    const contextLines: string[] = [
      '[sqlew] Related decisions found:',
      '',
    ];

    for (const suggestion of result.suggestions) {
      contextLines.push(`- **${suggestion.key}**: ${suggestion.value}`);
      if (suggestion.reason) {
        contextLines.push(`  (${suggestion.reason})`);
      }
    }

    sendContinue(contextLines.join('\n'));
  } catch (error) {
    // On error, log to stderr but continue execution
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sqlew suggest] Error: ${message}`);
    sendContinue();
  }
}
