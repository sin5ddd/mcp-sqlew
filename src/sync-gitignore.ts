/**
 * Gitignore Sync - Auto-add sqlew system file patterns to .gitignore
 *
 * Ensures system-generated files are excluded from version control:
 * - .claude/agents/sqlew-* (agent definition files)
 * - .claude/commands/sqw-* (slash command files)
 */

import * as fs from 'fs';
import * as path from 'path';

/** Patterns to add to .gitignore */
const GITIGNORE_PATTERNS = [
  '# sqlew system files (auto-generated)',
  '.claude/agents/sqlew-*',
  '.claude/commands/sqw-*',
];

/**
 * Sync .gitignore to include sqlew system file patterns.
 * Called during database initialization.
 */
export function syncGitignore(): void {
  try {
    const projectRoot = process.cwd();
    const gitignorePath = path.join(projectRoot, '.gitignore');

    // Read existing .gitignore or create empty
    let content = '';
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf-8');
    }

    // Check which patterns are missing
    const missingPatterns: string[] = [];
    for (const pattern of GITIGNORE_PATTERNS) {
      // Skip comment lines in check (they're just for readability)
      if (pattern.startsWith('#')) continue;

      if (!content.includes(pattern)) {
        missingPatterns.push(pattern);
      }
    }

    // If all patterns exist, nothing to do
    if (missingPatterns.length === 0) {
      return;
    }

    // Append missing patterns
    const linesToAdd = GITIGNORE_PATTERNS.filter(p => {
      if (p.startsWith('#')) return true; // Always include comments
      return missingPatterns.includes(p);
    });

    // Ensure newline before appending
    const prefix = content.length > 0 && !content.endsWith('\n') ? '\n\n' : content.length > 0 ? '\n' : '';
    const newContent = content + prefix + linesToAdd.join('\n') + '\n';

    fs.writeFileSync(gitignorePath, newContent, 'utf-8');
    console.log(`✓ Updated .gitignore: added ${missingPatterns.join(', ')}`);

  } catch (error) {
    // Don't fail startup if sync fails
    console.error(`⚠ Failed to sync .gitignore: ${error instanceof Error ? error.message : String(error)}`);
  }
}
