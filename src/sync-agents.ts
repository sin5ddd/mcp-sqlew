/**
 * Agent synchronization module
 * Syncs specialized agents with config.toml on startup
 * - Copies enabled agents (if missing)
 * - Deletes disabled agents (if present)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createMinimalConfigIfNotExists } from './config/minimal-generator.js';
import { loadConfigFile } from './config/loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AgentConfig {
  filename: string;
  configKey: keyof NonNullable<ReturnType<typeof loadConfigFile>['agents']>;
  displayName: string;
}

const AGENTS: AgentConfig[] = [
  { filename: 'sqlew-scrum-master.md', configKey: 'scrum_master', displayName: 'Scrum Master' },
  { filename: 'sqlew-researcher.md', configKey: 'researcher', displayName: 'Researcher' },
  { filename: 'sqlew-architect.md', configKey: 'architect', displayName: 'Architect' },
];

/**
 * Get source path for agent files
 */
function getSourcePath(): string {
  const distDir = __dirname; // .../dist
  const packageRoot = path.dirname(distDir); // .../mcp-sqlew
  return path.join(packageRoot, 'assets', 'sample-agents');
}

/**
 * Get target path for agents (project-local .claude/agents)
 */
function getTargetPath(): string {
  const projectRoot = process.cwd();
  return path.join(projectRoot, '.claude', 'agents');
}

/**
 * Synchronize agents with config.toml
 * - Copy enabled agents if missing
 * - Delete disabled agents if present
 */
export function syncAgentsWithConfig(): void {
  try {
    // Ensure minimal config.toml exists
    const projectRoot = process.cwd();
    createMinimalConfigIfNotExists(projectRoot);

    // Load config
    const config = loadConfigFile();
    const agentConfig = config.agents || {};

    const sourcePath = getSourcePath();
    const targetPath = getTargetPath();

    // Verify source directory exists
    if (!fs.existsSync(sourcePath)) {
      console.error(`⚠ Agent source directory not found: ${sourcePath}`);
      return;
    }

    // Ensure target directory exists
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    const copied: string[] = [];
    const deleted: string[] = [];
    const skipped: string[] = [];

    // Process each agent
    for (const agent of AGENTS) {
      const sourceFile = path.join(sourcePath, agent.filename);
      const targetFile = path.join(targetPath, agent.filename);

      // Check if agent is enabled in config (default: true)
      const isEnabled = agentConfig[agent.configKey] !== false;

      if (isEnabled) {
        // Agent enabled: ensure file exists
        if (!fs.existsSync(targetFile)) {
          // File missing, copy it
          if (fs.existsSync(sourceFile)) {
            fs.copyFileSync(sourceFile, targetFile);
            copied.push(agent.displayName);
          } else {
            console.error(`⚠ Source file not found: ${sourceFile}`);
          }
        } else {
          // File already exists, skip
          skipped.push(agent.displayName);
        }
      } else {
        // Agent disabled: ensure file doesn't exist
        if (fs.existsSync(targetFile)) {
          // File exists, delete it
          fs.unlinkSync(targetFile);
          deleted.push(agent.displayName);
        }
        // else: file doesn't exist, nothing to do
      }
    }

    // Report changes
    if (copied.length > 0) {
      console.log(`✓ Installed agents: ${copied.join(', ')}`);
      console.log(`  Location: ${targetPath}`);
    }

    if (deleted.length > 0) {
      console.log(`✓ Removed agents: ${deleted.join(', ')}`);
    }

    // Show usage hint if any agents were copied
    if (copied.length > 0) {
      console.log(`  Use agents with @ prefix: @sqlew-scrum-master, @sqlew-researcher, @sqlew-architect`);
    }

  } catch (error) {
    // Don't fail startup if sync fails
    console.error(`⚠ Failed to sync agents: ${error instanceof Error ? error.message : String(error)}`);
  }
}
