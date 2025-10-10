# Publishing Guide for sqlew

## Package Information
- **npm package name**: `sqlew`
- **GitHub repository**: `sin5ddd/mcp-sqlew`
- **Author**: sin5ddd
- **License**: MIT

## Pre-Publishing Checklist

### ✅ Completed
- [x] Package metadata updated (package.json)
- [x] npm package name set to `sqlew`
- [x] GitHub repository configured
- [x] Unnecessary files cleaned up
- [x] .npmignore properly configured
- [x] README.md created for users
- [x] LICENSE file added (MIT)
- [x] CHANGELOG.md created
- [x] TypeScript builds successfully
- [x] All 18 MCP tools verified

### Package Contents (verified with `npm pack --dry-run`)
```
✅ README.md (8.7KB) - User documentation
✅ LICENSE (1.1KB) - MIT license
✅ CHANGELOG.md (3.8KB) - Version history
✅ ARCHITECTURE.md (16.6KB) - Technical documentation
✅ dist/ - Compiled JavaScript + TypeScript declarations
✅ package.json - Package configuration
```

### Excluded from Package
```
❌ src/ - Source files (only dist/ published)
❌ tests/ - Test files
❌ docs/ - Development documentation
❌ .claude/ - Claude Code configuration
❌ CLAUDE.md - Project-specific instructions
❌ .mcp.json - MCP configuration
❌ *.db files - Database files
❌ Test scripts (*.mjs, test-*, verify-*)
```

## Publishing to npm

### 1. First-Time Setup (if not done)
```bash
# Login to npm
npm login
```

### 2. Verify Package
```bash
# See what will be published
npm pack --dry-run

# Build the package
npm run build

# Test the package locally
npm pack
npm install -g ./sqlew-1.0.0.tgz
```

### 3. Publish to npm
```bash
# Publish to npm registry
npm publish

# Or publish as scoped package (if needed)
npm publish --access public
```

### 4. Verify Publication
```bash
# Check on npm
npm info sqlew

# Install and test
npm install -g sqlew
```

## Publishing to GitHub

### 1. Initialize Git Repository (if not done)
```bash
git init
git add .
git commit -m "Initial release: MCP Shared Context Server v1.0.0"
```

### 2. Connect to GitHub
```bash
# Add remote
git remote add origin https://github.com/sin5ddd/mcp-sqlew.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### 3. Create Release
```bash
# Tag the release
git tag -a v1.0.0 -m "Release v1.0.0: 18 MCP tools with 72% token efficiency"
git push origin v1.0.0
```

### 4. Create GitHub Release (via web UI)
1. Go to: https://github.com/sin5ddd/mcp-sqlew/releases
2. Click "Create a new release"
3. Select tag: v1.0.0
4. Title: "v1.0.0 - Initial Release"
5. Description: Copy from CHANGELOG.md
6. Publish release

## Version Updates

### For Future Updates
1. Update version in package.json
2. Update CHANGELOG.md
3. Build and test: `npm run rebuild`
4. Commit changes: `git commit -am "Release vX.Y.Z"`
5. Tag release: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
6. Push: `git push && git push --tags`
7. Publish to npm: `npm publish`

## Installation (for users)

### Global Installation
```bash
npm install -g sqlew
```

### Local Installation
```bash
npm install sqlew
```

### Usage
```bash
# Run MCP server
sqlew

# Or with custom database path
node node_modules/sqlew/dist/index.js /path/to/custom.db
```

## Testing Installation

### Test with MCP Inspector
```bash
npx @modelcontextprotocol/inspector sqlew
```

### Add to Claude Desktop
Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "sqlew": {
      "command": "sqlew"
    }
  }
}
```

## Post-Publishing Tasks

### After npm publish:
- [ ] Verify package appears on npm: https://www.npmjs.com/package/sqlew
- [ ] Test installation: `npm install -g sqlew`
- [ ] Update GitHub README if needed
- [ ] Share on relevant communities (if desired)

### After GitHub push:
- [ ] Verify repository: https://github.com/sin5ddd/mcp-sqlew
- [ ] Check Actions/CI (if configured)
- [ ] Update repository description and topics
- [ ] Add badges to README (npm version, downloads, license)

## Badges for README (optional)

Add these to the top of README.md:
```markdown
[![npm version](https://badge.fury.io/js/sqlew.svg)](https://www.npmjs.com/package/sqlew)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/github/stars/sin5ddd/mcp-sqlew?style=social)](https://github.com/sin5ddd/mcp-sqlew)
```

## Support

- **Issues**: https://github.com/sin5ddd/mcp-sqlew/issues
- **npm**: https://www.npmjs.com/package/sqlew
- **Documentation**: README.md

---

**Ready to publish!** 🚀

All preparations are complete. Run `npm publish` when ready.
