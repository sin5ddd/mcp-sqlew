#!/usr/bin/env node

/**
 * CLI tool for sqlew slash commands
 * @deprecated v4.1.0 - Slash commands replaced by Plan Mode Integration
 *
 * This command now only displays deprecation notice.
 * sqlew tools are automatically recommended during Plan mode.
 */

function printHelp(): void {
  console.log(`
mcp-sqlew init-commands - Initialize slash commands for mcp-sqlew

NOTE: As of v4.1.0, slash commands have been replaced by:
  1. Plan Mode Integration (auto-added to CLAUDE.md on server startup)
  2. Skills (.claude/skills/sqw-plan-guidance/)

The sqlew MCP tools are automatically recommended when Plan mode is active.
No manual command installation is required.

For more information, see:
  - .claude/skills/sqw-plan-guidance/SKILL.md
  - CLAUDE.md (Plan Mode Integration section)
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  console.log('mcp-sqlew init-commands\n');
  console.log('⚠ DEPRECATED: Slash commands have been replaced in v4.1.0\n');
  console.log('The sqlew MCP tools are now automatically recommended when Plan mode is active.');
  console.log('No manual command installation is required.\n');
  console.log('NEW APPROACH:');
  console.log('  1. Plan Mode Integration');
  console.log('     - Automatically added to CLAUDE.md on server startup');
  console.log('     - sqlew tools are recommended during plan mode phases\n');
  console.log('  2. Skills Reference');
  console.log('     - .claude/skills/sqw-plan-guidance/SKILL.md');
  console.log('     - Auto-installed on first server startup\n');
  console.log('For more information, run: npx sqlew init-commands --help\n');
}

main();
