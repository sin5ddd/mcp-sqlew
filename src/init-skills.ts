/**
 * Auto-initialize sqlew skills, CLAUDE.md integration, and hooks on server startup
 * Copies skills from assets if not present, appends to CLAUDE.md if section missing,
 * and sets up Claude Code hooks in settings.local.json (first time only)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { debugLog } from './utils/debug-logger.js';
import { autoInitializeHooks } from './cli/hooks/init-hooks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get path to assets directory (relative to dist/)
 */
function getAssetsPath(): string {
  const distDir = __dirname; // .../dist
  const packageRoot = path.dirname(distDir); // .../mcp-sqlew
  return path.join(packageRoot, 'assets');
}

/**
 * Initialize skills in project's .claude/skills directory
 * Only copies if skill directory doesn't exist
 */
export function initializeSkills(projectRoot: string): void {
  const skillsSourceDir = path.join(getAssetsPath(), 'sample-skills');
  const skillsTargetDir = path.join(projectRoot, '.claude', 'skills');

  // Check if source exists
  if (!fs.existsSync(skillsSourceDir)) {
    debugLog('WARN', 'Skills source directory not found', { skillsSourceDir });
    return;
  }

  // Get list of skill directories to copy
  const skillDirs = fs.readdirSync(skillsSourceDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const skillName of skillDirs) {
    const sourceSkillDir = path.join(skillsSourceDir, skillName);
    const targetSkillDir = path.join(skillsTargetDir, skillName);

    // Only copy if target doesn't exist
    if (!fs.existsSync(targetSkillDir)) {
      try {
        // Create target directory
        fs.mkdirSync(targetSkillDir, { recursive: true });

        // Copy all files in skill directory
        const files = fs.readdirSync(sourceSkillDir);
        for (const file of files) {
          const sourceFile = path.join(sourceSkillDir, file);
          const targetFile = path.join(targetSkillDir, file);
          fs.copyFileSync(sourceFile, targetFile);
        }

        debugLog('INFO', `Skill initialized: ${skillName}`, { targetSkillDir });
      } catch (error) {
        debugLog('WARN', `Failed to initialize skill: ${skillName}`, { error });
      }
    }
  }
}

/**
 * Append Plan Mode Integration section to CLAUDE.md if not present
 */
export function initializeClaudeMd(projectRoot: string): void {
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  const snippetPath = path.join(getAssetsPath(), 'claude-md-snippets', 'plan-mode-integration.md');

  // Check if snippet source exists
  if (!fs.existsSync(snippetPath)) {
    debugLog('WARN', 'CLAUDE.md snippet not found', { snippetPath });
    return;
  }

  // Check if CLAUDE.md exists
  if (!fs.existsSync(claudeMdPath)) {
    debugLog('INFO', 'CLAUDE.md not found, skipping integration', { claudeMdPath });
    return;
  }

  // Read current CLAUDE.md content
  const currentContent = fs.readFileSync(claudeMdPath, 'utf-8');

  // Check if Plan Mode Integration section already exists
  if (currentContent.includes('## Plan Mode Integration')) {
    debugLog('DEBUG', 'Plan Mode Integration section already present in CLAUDE.md');
    return;
  }

  // Read snippet content
  const snippetContent = fs.readFileSync(snippetPath, 'utf-8');

  // Append snippet to CLAUDE.md
  try {
    const newContent = currentContent.trimEnd() + '\n\n' + snippetContent;
    fs.writeFileSync(claudeMdPath, newContent, 'utf-8');
    debugLog('INFO', 'Plan Mode Integration section added to CLAUDE.md', { claudeMdPath });
  } catch (error) {
    debugLog('WARN', 'Failed to update CLAUDE.md', { error });
  }
}

/**
 * Initialize all sqlew integrations (skills + CLAUDE.md + hooks)
 * Called during server startup
 */
export function initializeSqlewIntegrations(projectRoot: string): void {
  debugLog('DEBUG', 'Initializing sqlew integrations', { projectRoot });

  // Initialize skills
  initializeSkills(projectRoot);

  // Initialize CLAUDE.md integration
  initializeClaudeMd(projectRoot);

  // Initialize Claude Code hooks (first time only)
  const hooksInitialized = autoInitializeHooks(projectRoot);
  if (hooksInitialized) {
    debugLog('INFO', 'Claude Code hooks auto-initialized', { projectRoot });
  }
}
