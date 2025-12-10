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
import { loadConfigFile } from './config/loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    // Ensure minimal config.toml exists
    const projectRoot = process.cwd();
    createMinimalConfigIfNotExists(projectRoot);

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
