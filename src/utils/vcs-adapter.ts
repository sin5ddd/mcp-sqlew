import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

/**
 * VCS Adapter Interface
 *
 * Provides abstraction layer for version control systems to support
 * git-aware auto-complete across multiple VCS platforms.
 */
export interface VCSAdapter {
  /**
   * Check if the current directory is a valid VCS repository
   */
  isRepository(): Promise<boolean>;

  /**
   * Get list of files committed since a given timestamp
   * @param sinceTimestamp ISO 8601 timestamp
   * @returns Array of committed file paths
   */
  getCommittedFilesSince(sinceTimestamp: string): Promise<string[]>;

  /**
   * Get the VCS type name (for logging)
   */
  getVCSType(): string;
}

/**
 * Git VCS Adapter
 */
export class GitAdapter implements VCSAdapter {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async isRepository(): Promise<boolean> {
    try {
      await execAsync('git rev-parse --git-dir', { cwd: this.projectRoot });
      return true;
    } catch {
      return false;
    }
  }

  async getCommittedFilesSince(sinceTimestamp: string): Promise<string[]> {
    const gitCommand = `git log --since="${sinceTimestamp}" --name-only --pretty=format:""`;
    const { stdout } = await execAsync(gitCommand, { cwd: this.projectRoot });

    const committedFiles = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // Remove duplicates
    return [...new Set(committedFiles)];
  }

  getVCSType(): string {
    return 'Git';
  }
}

/**
 * SVN (Subversion) VCS Adapter
 */
export class SVNAdapter implements VCSAdapter {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async isRepository(): Promise<boolean> {
    try {
      await execAsync('svn info', { cwd: this.projectRoot });
      return true;
    } catch {
      return false;
    }
  }

  async getCommittedFilesSince(sinceTimestamp: string): Promise<string[]> {
    // Convert ISO timestamp to SVN revision range
    const date = new Date(sinceTimestamp);
    const svnDate = date.toISOString().split('.')[0] + 'Z';

    // Get log with changed paths since the date
    const svnCommand = `svn log -v --xml -r {${svnDate}}:HEAD`;
    const { stdout } = await execAsync(svnCommand, { cwd: this.projectRoot });

    // Parse XML to extract file paths
    const pathMatches = stdout.matchAll(/<path[^>]*>([^<]+)<\/path>/g);
    const committedFiles = Array.from(pathMatches, match => match[1])
      .map(path => path.replace(/^\//, '')); // Remove leading slash

    // Remove duplicates
    return [...new Set(committedFiles)];
  }

  getVCSType(): string {
    return 'SVN';
  }
}

/**
 * Mercurial (hg) VCS Adapter
 */
export class MercurialAdapter implements VCSAdapter {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async isRepository(): Promise<boolean> {
    try {
      await execAsync('hg root', { cwd: this.projectRoot });
      return true;
    } catch {
      return false;
    }
  }

  async getCommittedFilesSince(sinceTimestamp: string): Promise<string[]> {
    // Convert ISO timestamp to Mercurial date format
    const date = new Date(sinceTimestamp);
    const hgDate = date.toISOString().split('T')[0]; // YYYY-MM-DD

    // Get files changed since date
    const hgCommand = `hg log --style default --template "{files}\\n" -d ">${hgDate}"`;
    const { stdout } = await execAsync(hgCommand, { cwd: this.projectRoot });

    const committedFiles = stdout
      .split('\n')
      .flatMap(line => line.split(' '))
      .map(file => file.trim())
      .filter(file => file.length > 0);

    // Remove duplicates
    return [...new Set(committedFiles)];
  }

  getVCSType(): string {
    return 'Mercurial';
  }
}

/**
 * Auto-detect and create appropriate VCS adapter
 *
 * Detection order: Git → Mercurial → SVN
 * (Most common to least common in modern development)
 */
export async function detectVCS(projectRoot: string): Promise<VCSAdapter | null> {
  // Try Git first (most common)
  const gitAdapter = new GitAdapter(projectRoot);
  if (await gitAdapter.isRepository()) {
    return gitAdapter;
  }

  // Try Mercurial
  const hgAdapter = new MercurialAdapter(projectRoot);
  if (await hgAdapter.isRepository()) {
    return hgAdapter;
  }

  // Try SVN
  const svnAdapter = new SVNAdapter(projectRoot);
  if (await svnAdapter.isRepository()) {
    return svnAdapter;
  }

  // No VCS detected
  return null;
}
