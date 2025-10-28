#!/usr/bin/env node

/**
 * CLI tool to initialize sqlew specialized agents
 * Usage: npx mcp-sqlew init-agents [--path <custom-path>]
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
mcp-sqlew init-agents - Initialize specialized agents for mcp-sqlew

USAGE:
  npx mcp-sqlew init-agents [OPTIONS]

OPTIONS:
  --path <path>     Custom target directory (default: ~/.claude/agents)
  --project, --local  Install to current project (.claude/agents)
  --help, -h        Show this help message

EXAMPLES:
  # Install to global Claude Code agents directory
  npx mcp-sqlew init-agents

  # Install to current project
  npx mcp-sqlew init-agents --project

  # Install to custom location
  npx mcp-sqlew init-agents --path /path/to/agents

AGENT FILES:
  - sqlew-scrum-master.md   Multi-agent coordination, task management
  - sqlew-researcher.md     Query decisions, analyze patterns
  - sqlew-architect.md      Document decisions, enforce constraints
  - QUICK_START.md          Usage guide with examples
  - README.md               Overview and best practices
`);
}

function getDefaultTargetPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) {
    throw new Error('Could not determine home directory');
  }
  return path.join(home, '.claude', 'agents');
}

function getSourcePath(): string {
  // When running from npm package: node_modules/mcp-sqlew/dist/init-agents.js
  // Source files are in: node_modules/mcp-sqlew/assets/sample-agents/
  const distDir = __dirname; // .../dist
  const packageRoot = path.dirname(distDir); // .../mcp-sqlew
  return path.join(packageRoot, 'assets', 'sample-agents');
}

/**
 * Ensure config.toml exists, create if missing
 */
function ensureConfigExists(): void {
  const projectRoot = process.cwd();
  const created = createMinimalConfigIfNotExists(projectRoot);

  if (created) {
    console.log('✓ Created: .sqlew/config.toml (minimal defaults)');
    console.log('  Edit [agents] section to customize agent selection\n');
  }
}

/**
 * Get list of agent files to install based on config
 */
function getAgentsToInstall(): { files: string[]; summary: string } {
  const config = loadConfigFile();
  const agentConfig = config.agents || {};

  const files: string[] = [];
  const installed: string[] = [];

  // Add agents based on config (default: true)
  if (agentConfig.scrum_master !== false) {
    files.push('sqlew-scrum-master.md');
    installed.push('Scrum Master (12KB)');
  }
  if (agentConfig.researcher !== false) {
    files.push('sqlew-researcher.md');
    installed.push('Researcher (14KB)');
  }
  if (agentConfig.architect !== false) {
    files.push('sqlew-architect.md');
    installed.push('Architect (20KB)');
  }

  // NOTE: Documentation is now centralized in docs/SPECIALIZED_AGENTS.md
  // No longer installing README/QUICK_START to agent directories

  const summary = installed.length > 0 ? installed.join(', ') : 'None';

  return { files, summary };
}

function copyAgentFiles(sourcePath: string, targetPath: string, filesToCopy: string[]): void {
  // Ensure target directory exists
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
    console.log(`✓ Created directory: ${targetPath}`);
  }

  // Copy only specified files
  const copiedFiles: string[] = [];

  for (const file of filesToCopy) {
    const sourceFile = path.join(sourcePath, file);
    const targetFile = path.join(targetPath, file);

    // Skip if source file doesn't exist
    if (!fs.existsSync(sourceFile)) {
      console.warn(`⚠ Skipping missing file: ${file}`);
      continue;
    }

    // Copy file
    fs.copyFileSync(sourceFile, targetFile);
    copiedFiles.push(file);
  }

  console.log(`\n✓ Copied ${copiedFiles.length} files to: ${targetPath}\n`);

  // List copied files
  console.log('Files installed:');
  copiedFiles.forEach(file => {
    console.log(`  • ${file}`);
  });
}

function main(): void {
  try {
    console.log('mcp-sqlew Agent Installer\n');

    // STEP 1: Ensure minimal config.toml exists
    ensureConfigExists();

    // STEP 2: Parse arguments
    const options = parseArgs();

    // STEP 3: Get agents to install based on config
    const { files, summary } = getAgentsToInstall();

    if (files.length === 0) {
      console.log('⚠ No agents enabled in .sqlew/config.toml\n');
      console.log('To enable agents, edit .sqlew/config.toml:');
      console.log('[agents]');
      console.log('scrum_master = true');
      console.log('researcher = true');
      console.log('architect = true\n');
      process.exit(1);
    }

    console.log(`Installing agents: ${summary}\n`);

    // STEP 4: Determine target path
    let targetPath: string;
    if (options.targetPath) {
      targetPath = path.resolve(options.targetPath);
    } else if (options.projectLocal) {
      targetPath = path.join(process.cwd(), '.claude', 'agents');
    } else {
      targetPath = getDefaultTargetPath();
    }

    // STEP 5: Get source path
    const sourcePath = getSourcePath();

    // Verify source exists
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source directory not found: ${sourcePath}\nThis may indicate an installation issue.`);
    }

    console.log(`Source: ${sourcePath}`);
    console.log(`Target: ${targetPath}\n`);

    // STEP 6: Copy selected files
    copyAgentFiles(sourcePath, targetPath, files);

    // STEP 7: Success message
    console.log(`\n✓ Installation complete!\n`);
    console.log('NEXT STEPS:');
    console.log('  1. Restart Claude Code (if running)');
    console.log('  2. Use agents with @ prefix:');

    if (files.includes('sqlew-scrum-master.md')) {
      console.log('     @sqlew-scrum-master "Plan the sprint"');
    }
    if (files.includes('sqlew-researcher.md')) {
      console.log('     @sqlew-researcher "Query past decisions"');
    }
    if (files.includes('sqlew-architect.md')) {
      console.log('     @sqlew-architect "Document architecture"');
    }

    console.log('\n  3. Customize agent selection:');
    console.log('     Edit .sqlew/config.toml → [agents] section');
    console.log('     Disable unused agents to reduce token consumption\n');
    console.log('For more info: https://github.com/sin5ddd/mcp-sqlew\n');

  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
