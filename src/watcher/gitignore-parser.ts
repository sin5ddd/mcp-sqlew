/**
 * GitIgnore Parser Module (v3.4.1)
 * Parses .gitignore files and provides file filtering functionality
 *
 * Features:
 * - Load .gitignore from project root
 * - Built-in ignore patterns (node_modules, .git, etc.)
 * - Efficient pattern matching with ignore library
 * - Path normalization for cross-platform compatibility
 */

import ignore, { Ignore } from 'ignore';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { debugLog } from '../utils/debug-logger.js';

/**
 * VCS index files that must NEVER be ignored (v3.5.3)
 * These files are explicitly watched for commit detection
 */
export const VCS_WATCH_WHITELIST = [
  '.git/index',      // Git staging/commit detection
  '.hg/dirstate',    // Mercurial (future support)
];

/**
 * Built-in patterns to always ignore (v3.4.1)
 * These are common patterns that should be ignored regardless of .gitignore
 */
export const BUILT_IN_IGNORE_PATTERNS = [
  // Version control
  '.git',
  '.gitignore',
  '.gitattributes',

  // Dependencies
  'node_modules',
  'bower_components',
  'jspm_packages',

  // Build outputs
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.cache',
  '.parcel-cache',
  '.vite',

  // Logs
  '*.log',
  'logs',
  'npm-debug.log*',
  'yarn-debug.log*',
  'yarn-error.log*',
  'pnpm-debug.log*',

  // OS files
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',

  // IDE/Editor files
  '.vscode',
  '.idea',
  '.sublime-project',
  '.sublime-workspace',
  '*.swp',
  '*.swo',
  '*~',

  // Temporary files
  '*.tmp',
  '*.temp',
  '.tmp',
  '.temp',

  // Environment files
  '.env',
  '.env.local',
  '.env.*.local',

  // Database files
  '*.db',
  '*.sqlite',
  '*.sqlite3',
  '.mcp-context', // MCP Shared Context Server database directory

  // Test coverage
  'coverage',
  '.nyc_output',

  // Package manager locks (often large binary files)
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

/**
 * GitIgnoreParser class
 * Handles .gitignore file parsing and file filtering
 */
export class GitIgnoreParser {
  private ig: Ignore;
  private projectRoot: string;

  /**
   * Constructor
   * @param projectRoot - Absolute path to project root directory
   * @param customPatterns - Additional patterns to ignore (optional)
   */
  constructor(projectRoot: string, customPatterns: string[] = []) {
    // Normalize path to use forward slashes for cross-platform consistency
    // This ensures startsWith() check works correctly on Windows where
    // process.cwd() returns backslashes but chokidar may provide forward slashes
    this.projectRoot = projectRoot.replace(/\\/g, '/');
    this.ig = ignore();

    // Add built-in patterns
    this.ig.add(BUILT_IN_IGNORE_PATTERNS);

    // Load .gitignore from project root if it exists
    const gitignorePath = join(projectRoot, '.gitignore');
    if (existsSync(gitignorePath)) {
      try {
        const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
        this.ig.add(gitignoreContent);
      } catch (error) {
        debugLog('WARN', 'Failed to load .gitignore', { error });
      }
    }

    // Add custom patterns
    if (customPatterns.length > 0) {
      this.ig.add(customPatterns);
    }
  }

  /**
   * Check if a file path should be ignored
   * @param filePath - Absolute file path to check
   * @returns true if file should be ignored, false otherwise
   */
  shouldIgnore(filePath: string): boolean {
    // Normalize incoming path to forward slashes for cross-platform consistency
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Convert to relative path from project root
    let relativePath = normalizedPath;

    if (normalizedPath.startsWith(this.projectRoot)) {
      relativePath = normalizedPath.substring(this.projectRoot.length);

      // Remove leading slash
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1);
      }
    }

    // Path is already normalized to forward slashes above

    // Handle empty path (project root itself) - never ignore it
    if (!relativePath || relativePath === '') {
      return false;
    }

    // WHITELIST CHECK FIRST (v3.5.3): VCS index files are NEVER ignored
    // This ensures .git/index and other VCS files can be explicitly watched
    const isVCSIndexFile = VCS_WATCH_WHITELIST.some(pattern =>
      relativePath === pattern ||
      relativePath.endsWith('/' + pattern)
    );

    if (isVCSIndexFile) {
      return false;  // Force allow - never ignore VCS index files
    }

    // Check if path is ignored by standard patterns
    return this.ig.ignores(relativePath);
  }

  /**
   * Filter an array of file paths, removing ignored files
   * @param filePaths - Array of absolute file paths
   * @returns Filtered array with ignored files removed
   */
  filter(filePaths: string[]): string[] {
    return filePaths.filter(path => !this.shouldIgnore(path));
  }

  /**
   * Get the project root directory
   * @returns Absolute path to project root
   */
  getProjectRoot(): string {
    return this.projectRoot;
  }

  /**
   * Add additional patterns to ignore
   * @param patterns - Array of gitignore-style patterns
   */
  addPatterns(patterns: string[]): void {
    this.ig.add(patterns);
  }

  /**
   * Create a new GitIgnoreParser with additional patterns
   * @param patterns - Additional patterns to ignore
   * @returns New GitIgnoreParser instance
   */
  createChild(patterns: string[]): GitIgnoreParser {
    const parser = new GitIgnoreParser(this.projectRoot, patterns);
    return parser;
  }
}

/**
 * Create a GitIgnoreParser for the given project root
 * @param projectRoot - Absolute path to project root
 * @param customPatterns - Additional patterns to ignore (optional)
 * @returns GitIgnoreParser instance
 */
export function createGitIgnoreParser(
  projectRoot: string,
  customPatterns: string[] = []
): GitIgnoreParser {
  return new GitIgnoreParser(projectRoot, customPatterns);
}
