/**
 * Command synchronization module
 * Syncs slash commands with config.toml on startup
 * - Copies enabled commands (if missing)
 * - Deletes disabled commands (if present)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createMinimalConfigIfNotExists } from './config/minimal-generator.js';
import { loadConfigFile, DEFAULT_CONFIG_PATH } from './config/loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Check if we're in a git worktree with parent config
 * If so, we should not create local .sqlew/config.toml
 */
function hasParentConfig(): boolean {
  const cwd = process.cwd();
  const gitPath = path.join(cwd, '.git');

  try {
    const stat = fs.statSync(gitPath);
    if (!stat.isFile()) {
      return false; // Regular git repo, not a worktree
    }

    // Read .git file to find main repo
    const gitContent = fs.readFileSync(gitPath, 'utf-8').trim();
    const match = gitContent.match(/^gitdir:\s*(.+)$/);
    if (!match) {
      return false;
    }

    // Parse worktree gitdir path to find main repo
    const gitdirPath = match[1];
    const worktreesIndex = gitdirPath.lastIndexOf('/worktrees/');
    if (worktreesIndex === -1) {
      const winIndex = gitdirPath.lastIndexOf('\\worktrees\\');
      if (winIndex === -1) {
        return false;
      }
      const mainGitDir = gitdirPath.substring(0, winIndex);
      const mainRepoRoot = path.dirname(mainGitDir);
      return fs.existsSync(path.join(mainRepoRoot, DEFAULT_CONFIG_PATH));
    }

    const mainGitDir = gitdirPath.substring(0, worktreesIndex);
    const mainRepoRoot = path.dirname(mainGitDir);
    return fs.existsSync(path.join(mainRepoRoot, DEFAULT_CONFIG_PATH));
  } catch {
    return false;
  }
}

interface CommandConfig {
  filename: string;
  configKey: keyof NonNullable<ReturnType<typeof loadConfigFile>['commands']>;
  displayName: string;
}

const COMMANDS: CommandConfig[] = [
  { filename: 'sqlew.md', configKey: 'sqlew', displayName: 'sqlew' },
];

/**
 * Get source path for command files
 */
function getSourcePath(): string {
  const distDir = __dirname; // .../dist
  const packageRoot = path.dirname(distDir); // .../mcp-sqlew
  return path.join(packageRoot, 'assets', 'sample-commands');
}

/**
 * Get target path for commands (project-local .claude/commands)
 */
function getTargetPath(): string {
  const projectRoot = process.cwd();
  return path.join(projectRoot, '.claude', 'commands');
}

/**
 * Synchronize commands with config.toml
 * - Copy enabled commands if missing
 * - Delete disabled commands if present
 */
export function syncCommandsWithConfig(): void {
  try {
    // Ensure minimal config.toml exists (skip if using parent config in worktree)
    const projectRoot = process.cwd();
    if (!hasParentConfig()) {
      createMinimalConfigIfNotExists(projectRoot);
    }

    // Load config
    const config = loadConfigFile();
    const commandConfig = config.commands || {};

    const sourcePath = getSourcePath();
    const targetPath = getTargetPath();

    // Verify source directory exists
    if (!fs.existsSync(sourcePath)) {
      console.error(`⚠ Command source directory not found: ${sourcePath}`);
      return;
    }

    // Ensure target directory exists
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    const copied: string[] = [];
    const deleted: string[] = [];
    const skipped: string[] = [];

    // Process each command
    for (const command of COMMANDS) {
      const sourceFile = path.join(sourcePath, command.filename);
      const targetFile = path.join(targetPath, command.filename);

      // Check if command is enabled in config (default: true)
      const isEnabled = commandConfig[command.configKey] !== false;

      if (isEnabled) {
        // Command enabled: ensure file exists
        if (!fs.existsSync(targetFile)) {
          // File missing, copy it
          if (fs.existsSync(sourceFile)) {
            fs.copyFileSync(sourceFile, targetFile);
            copied.push(command.displayName);
          } else {
            console.error(`⚠ Source file not found: ${sourceFile}`);
          }
        } else {
          // File already exists, skip
          skipped.push(command.displayName);
        }
      } else {
        // Command disabled: ensure file doesn't exist
        if (fs.existsSync(targetFile)) {
          // File exists, delete it
          fs.unlinkSync(targetFile);
          deleted.push(command.displayName);
        }
        // else: file doesn't exist, nothing to do
      }
    }

    // Report changes
    if (copied.length > 0) {
      console.log(`✓ Installed slash commands: ${copied.join(', ')}`);
      console.log(`  Location: ${targetPath}`);
    }

    if (deleted.length > 0) {
      console.log(`✓ Removed slash commands: ${deleted.join(', ')}`);
    }

    // Show usage hint if any commands were copied
    if (copied.length > 0) {
      console.log(`  Use command with / prefix: /sqlew`);
    }

  } catch (error) {
    // Don't fail startup if sync fails
    console.error(`⚠ Failed to sync commands: ${error instanceof Error ? error.message : String(error)}`);
  }
}
