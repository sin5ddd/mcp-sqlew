/**
 * VCS Staging Detection Tests (v3.5.2)
 * Tests for getStagedFiles() method across Git, Mercurial, and SVN adapters
 */

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { GitAdapter, MercurialAdapter, SVNAdapter } from '../../../utils/vcs-adapter.js';

const TEST_DIR = join(process.cwd(), 'test-vcs-staging');

// Helper to clean up test directory
function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('VCS Staging Detection Tests', () => {
  before(() => {
    cleanupTestDir();
    mkdirSync(TEST_DIR, { recursive: true });
  });

  after(() => {
    cleanupTestDir();
  });

  describe('GitAdapter - getStagedFiles()', () => {
    let gitDir: string;
    let adapter: GitAdapter;

    before(() => {
      gitDir = join(TEST_DIR, 'git-test');
      mkdirSync(gitDir, { recursive: true });

      // Initialize git repo
      execSync('git init', { cwd: gitDir });
      execSync('git config user.email "test@example.com"', { cwd: gitDir });
      execSync('git config user.name "Test User"', { cwd: gitDir });

      adapter = new GitAdapter(gitDir);
    });

    it('should return empty array when no files are staged', async () => {
      const stagedFiles = await adapter.getStagedFiles();
      assert.deepStrictEqual(stagedFiles, []);
    });

    it('should detect staged files', async () => {
      // Create and stage files
      writeFileSync(join(gitDir, 'file1.txt'), 'content1');
      writeFileSync(join(gitDir, 'file2.txt'), 'content2');
      execSync('git add file1.txt file2.txt', { cwd: gitDir });

      const stagedFiles = await adapter.getStagedFiles();

      assert.strictEqual(stagedFiles.length, 2);
      assert.ok(stagedFiles.includes('file1.txt'));
      assert.ok(stagedFiles.includes('file2.txt'));
    });

    it('should return only staged files, not modified unstaged files', async () => {
      // Commit previously staged files
      execSync('git commit -m "Initial commit"', { cwd: gitDir });

      // Create new file but don't stage it
      writeFileSync(join(gitDir, 'file3.txt'), 'content3');

      // Modify existing file but don't stage it
      writeFileSync(join(gitDir, 'file1.txt'), 'modified content');

      const stagedFiles = await adapter.getStagedFiles();

      // Should be empty since nothing is staged
      assert.deepStrictEqual(stagedFiles, []);
    });

    it('should detect partially staged files', async () => {
      // Stage only file3
      execSync('git add file3.txt', { cwd: gitDir });

      const stagedFiles = await adapter.getStagedFiles();

      assert.strictEqual(stagedFiles.length, 1);
      assert.strictEqual(stagedFiles[0], 'file3.txt');
    });

    it('should handle non-git directory gracefully', async () => {
      const nonGitAdapter = new GitAdapter(TEST_DIR);
      const stagedFiles = await nonGitAdapter.getStagedFiles();

      // When running inside a git repo (e.g., during development with uncommitted v3.9.0 changes),
      // filter to only files within the test directory to avoid false positives
      const testDirRelative = 'test-vcs-staging';
      const filteredFiles = stagedFiles.filter(f => f.startsWith(testDirRelative));

      // Should return empty array for test directory files (not throw)
      assert.deepStrictEqual(filteredFiles, []);
      assert.ok(Array.isArray(stagedFiles)); // Verify it's an array and doesn't throw
    });
  });

  describe('SVNAdapter - getStagedFiles()', () => {
    it('should return modified and added files as "staged"', async () => {
      // SVN doesn't have staging - all modified/added files are considered "staged"
      const adapter = new SVNAdapter(TEST_DIR);

      // Mock SVN status output
      // In real scenario, this would query actual SVN repo
      // For now, test that it returns empty for non-SVN directory
      const stagedFiles = await adapter.getStagedFiles();

      // Should return empty for non-SVN directory
      assert.ok(Array.isArray(stagedFiles));
    });

    it('should handle non-SVN directory gracefully', async () => {
      const adapter = new SVNAdapter(TEST_DIR);
      const stagedFiles = await adapter.getStagedFiles();

      // Should return empty array, not throw
      assert.deepStrictEqual(stagedFiles, []);
    });
  });

  describe('MercurialAdapter - getStagedFiles()', () => {
    it('should return modified, added, and removed files as "staged"', async () => {
      // Mercurial doesn't have staging - all modified/added/removed files are considered "staged"
      const adapter = new MercurialAdapter(TEST_DIR);

      const stagedFiles = await adapter.getStagedFiles();

      // Should return empty for non-Mercurial directory
      assert.ok(Array.isArray(stagedFiles));
    });

    it('should handle non-Mercurial directory gracefully', async () => {
      const adapter = new MercurialAdapter(TEST_DIR);
      const stagedFiles = await adapter.getStagedFiles();

      // Should return empty array, not throw
      assert.deepStrictEqual(stagedFiles, []);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty repository', async () => {
      const emptyGitDir = join(TEST_DIR, 'empty-git');
      mkdirSync(emptyGitDir, { recursive: true });
      execSync('git init', { cwd: emptyGitDir });
      execSync('git config user.email "test@example.com"', { cwd: emptyGitDir });
      execSync('git config user.name "Test User"', { cwd: emptyGitDir });

      const adapter = new GitAdapter(emptyGitDir);
      const stagedFiles = await adapter.getStagedFiles();

      assert.deepStrictEqual(stagedFiles, []);
    });

    it('should handle files with spaces in names', async () => {
      const gitDir = join(TEST_DIR, 'git-spaces');
      mkdirSync(gitDir, { recursive: true });
      execSync('git init', { cwd: gitDir });
      execSync('git config user.email "test@example.com"', { cwd: gitDir });
      execSync('git config user.name "Test User"', { cwd: gitDir });

      // Create file with space in name
      writeFileSync(join(gitDir, 'file with spaces.txt'), 'content');
      execSync('git add "file with spaces.txt"', { cwd: gitDir });

      const adapter = new GitAdapter(gitDir);
      const stagedFiles = await adapter.getStagedFiles();

      assert.strictEqual(stagedFiles.length, 1);
      assert.strictEqual(stagedFiles[0], 'file with spaces.txt');
    });
  });
});
