#!/usr/bin/env node

/**
 * CLI tool to initialize sqlew slash commands
 * Usage: npx mcp-sqlew init-commands [--path <custom-path>]
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createMinimalConfigIfNotExists } from './config/minimal-generator.js';
import { loadConfigFile } from './config/loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface InitOptions {
  targetPath?: string;
  projectLocal?: boolean;
}

function parseArgs(): InitOptions {
  const args = process.argv.slice(2);
  const options: InitOptions = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--path':
        options.targetPath = args[++i];
        break;
      case '--project':
      case '--local':
        options.projectLocal = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
mcp-sqlew init-commands - Initialize slash commands for mcp-sqlew

USAGE:
  npx mcp-sqlew init-commands [OPTIONS]

OPTIONS:
  --path <path>     Custom target directory (default: .claude/commands)
  --project, --local  Install to current project (.claude/commands)
  --help, -h        Show this help message

EXAMPLES:
  # Install to current project (default)
  npx mcp-sqlew init-commands

  # Install to custom location
  npx mcp-sqlew init-commands --path /path/to/commands

SLASH COMMANDS:
  - /sqlew-architect    Architectural documentation workflow
  - /sqlew-decide       Decision-making workflow
  - /sqlew-plan         Planning workflow (architect + scrum)
  - /sqlew-research     Research workflow
  - /sqlew-review       Review workflow
  - /sqlew-scrum        Scrum/task management workflow
`);
}

function getDefaultTargetPath(): string {
  return path.join(process.cwd(), '.claude', 'commands');
}

function getSourcePath(): string {
  const distDir = __dirname; // .../dist
  const packageRoot = path.dirname(distDir); // .../mcp-sqlew
  return path.join(packageRoot, 'assets', 'sample-commands');
}

/**
 * Ensure config.toml exists, create if missing
 */
function ensureConfigExists(): void {
  const projectRoot = process.cwd();
  const created = createMinimalConfigIfNotExists(projectRoot);

  if (created) {
    console.log('✓ Created: .sqlew/config.toml (minimal defaults)');
    console.log('  Edit [commands] section to customize command selection\n');
  }
}

/**
 * Get list of command files to install based on config
 */
function getCommandsToInstall(): { files: string[]; summary: string } {
  const config = loadConfigFile();
  const commandConfig = config.commands || {};

  const files: string[] = [];
  const installed: string[] = [];

  if (commandConfig.architect !== false) {
    files.push('sqlew-architect.md');
    installed.push('Architect');
  }
  if (commandConfig.decide !== false) {
    files.push('sqlew-decide.md');
    installed.push('Decide');
  }
  if (commandConfig.plan !== false) {
    files.push('sqlew-plan.md');
    installed.push('Plan');
  }
  if (commandConfig.research !== false) {
    files.push('sqlew-research.md');
    installed.push('Research');
  }
  if (commandConfig.review !== false) {
    files.push('sqlew-review.md');
    installed.push('Review');
  }
  if (commandConfig.scrum !== false) {
    files.push('sqlew-scrum.md');
    installed.push('Scrum');
  }

  const summary = installed.length > 0 ? installed.join(', ') : 'None';

  return { files, summary };
}

function copyCommandFiles(sourcePath: string, targetPath: string, filesToCopy: string[]): void {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
    console.log(`✓ Created directory: ${targetPath}`);
  }

  const copiedFiles: string[] = [];

  for (const file of filesToCopy) {
    const sourceFile = path.join(sourcePath, file);
    const targetFile = path.join(targetPath, file);

    if (!fs.existsSync(sourceFile)) {
      console.warn(`⚠ Skipping missing file: ${file}`);
      continue;
    }

    fs.copyFileSync(sourceFile, targetFile);
    copiedFiles.push(file);
  }

  console.log(`\n✓ Copied ${copiedFiles.length} files to: ${targetPath}\n`);

  console.log('Files installed:');
  copiedFiles.forEach(file => {
    console.log(`  • ${file}`);
  });
}

function main(): void {
  try {
    console.log('mcp-sqlew Slash Command Installer\n');

    ensureConfigExists();

    const options = parseArgs();

    const { files, summary } = getCommandsToInstall();

    if (files.length === 0) {
      console.log('⚠ No commands enabled in .sqlew/config.toml\n');
      console.log('To enable commands, edit .sqlew/config.toml:');
      console.log('[commands]');
      console.log('plan = true');
      console.log('architect = true');
      console.log('scrum = true\n');
      process.exit(1);
    }

    console.log(`Installing commands: ${summary}\n`);

    const targetPath = options.targetPath
      ? path.resolve(options.targetPath)
      : getDefaultTargetPath();

    const sourcePath = getSourcePath();

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source directory not found: ${sourcePath}`);
    }

    console.log(`Source: ${sourcePath}`);
    console.log(`Target: ${targetPath}\n`);

    copyCommandFiles(sourcePath, targetPath, files);

    console.log(`\n✓ Installation complete!\n`);
    console.log('NEXT STEPS:');
    console.log('  1. Use slash commands with / prefix:');

    if (files.includes('sqlew-plan.md')) {
      console.log('     /sqlew-plan "Implement feature X"');
    }
    if (files.includes('sqlew-architect.md')) {
      console.log('     /sqlew-architect "Document API design"');
    }
    if (files.includes('sqlew-scrum.md')) {
      console.log('     /sqlew-scrum "Review sprint tasks"');
    }

    console.log('\n  2. Customize command selection:');
    console.log('     Edit .sqlew/config.toml → [commands] section\n');

  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
