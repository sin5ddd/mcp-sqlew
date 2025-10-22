/**
 * GitIgnore Parser Module (v3.3.0)
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

/**
 * Built-in patterns to always ignore (v3.3.0)
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
    this.projectRoot = projectRoot;
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
        console.error('⚠ Failed to load .gitignore:', error);
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
    // Normalize path: convert to relative path from project root
    let relativePath = filePath;

    if (filePath.startsWith(this.projectRoot)) {
      relativePath = filePath.substring(this.projectRoot.length);

      // Remove leading slash
      if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
        relativePath = relativePath.substring(1);
      }
    }

    // Convert Windows backslashes to forward slashes
    relativePath = relativePath.replace(/\\/g, '/');

    // Check if path is ignored
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
