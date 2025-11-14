import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

/**
 * Execute async command with 5-second timeout to prevent hanging
 * (especially important on Windows/WSL where git commands can stall)
 */
const execAsyncWithTimeout = async (
  command: string,
  options: Parameters<typeof execAsync>[1] = {}
): Promise<{ stdout: string; stderr: string }> => {
  return execAsync(command, { timeout: 5000, encoding: 'utf8', ...options }) as Promise<{ stdout: string; stderr: string }>;
};

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
   * Get list of files currently staged (ready to commit)
   * @returns Array of staged file paths
   */
  getStagedFiles(): Promise<string[]>;

  /**
   * Get the VCS type name (for logging)
   */
  getVCSType(): string;

  /**
   * Get repository root path
   * @returns Absolute path to repository root, or null if not a repository
   */
  getRepositoryRoot(): Promise<string | null>;

  /**
   * Get remote repository URL (if available)
   * @returns Remote URL or null if no remote configured
   */
  getRemoteUrl(): Promise<string | null>;

  /**
   * Extract project name from remote URL or repository
   * @returns Project name derived from VCS metadata, or null if unable to detect
   */
  extractProjectName(): Promise<string | null>;
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
      await execAsyncWithTimeout('git rev-parse --git-dir', { cwd: this.projectRoot });
      return true;
    } catch {
      return false;
    }
  }

  async getCommittedFilesSince(sinceTimestamp: string): Promise<string[]> {
    const gitCommand = `git log --since="${sinceTimestamp}" --name-only --pretty=format:""`;
    const { stdout } = await execAsyncWithTimeout(gitCommand, { cwd: this.projectRoot });

    const committedFiles = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // Remove duplicates
    return [...new Set(committedFiles)];
  }

  async getStagedFiles(): Promise<string[]> {
    try {
      const gitCommand = 'git diff --cached --name-only';
      const { stdout } = await execAsyncWithTimeout(gitCommand, { cwd: this.projectRoot });

      const stagedFiles = stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      return stagedFiles;
    } catch {
      // Not in a git repo or error occurred
      return [];
    }
  }

  getVCSType(): string {
    return 'Git';
  }

  /**
   * Get repository root path using safe git command
   * Satisfies Constraint #36: Use safe git commands (git rev-parse --show-toplevel)
   */
  async getRepositoryRoot(): Promise<string | null> {
    try {
      const { stdout } = await execAsyncWithTimeout('git rev-parse --show-toplevel', {
        cwd: this.projectRoot,
      });
      return stdout.trim();
    } catch {
      // Git command failed gracefully (Constraint #36)
      return null;
    }
  }

  /**
   * Get remote repository URL using safe git command
   * Satisfies Constraint #36: Use safe git commands (git config --get remote.origin.url)
   */
  async getRemoteUrl(): Promise<string | null> {
    try {
      const { stdout } = await execAsyncWithTimeout('git config --get remote.origin.url', {
        cwd: this.projectRoot,
      });
      return stdout.trim();
    } catch {
      // No remote configured or git command failed gracefully (Constraint #36)
      return null;
    }
  }

  /**
   * Extract project name from remote URL or repository path
   * Satisfies Constraint #36: Graceful fallback to directory name
   *
   * Parsing logic:
   * - Git remote URLs (SSH): git@github.com:user/repo.git → repo
   * - Git remote URLs (HTTPS): https://github.com/user/repo.git → repo
   * - Git remote URLs (HTTPS): https://github.com/user/repo → repo
   * - Fallback: Use repository root directory name
   */
  async extractProjectName(): Promise<string | null> {
    try {
      // Try remote URL first
      const remoteUrl = await this.getRemoteUrl();
      if (remoteUrl) {
        // Remove .git suffix if present
        const urlWithoutGit = remoteUrl.replace(/\.git$/, '');

        // Extract last path segment (project name)
        // Handles both SSH (git@github.com:user/repo) and HTTPS (https://github.com/user/repo)
        const segments = urlWithoutGit.split(/[/:]/);
        const projectName = segments[segments.length - 1];

        if (projectName && projectName.length > 0) {
          return projectName;
        }
      }

      // Fallback to repository root directory name (Constraint #36)
      const repoRoot = await this.getRepositoryRoot();
      if (repoRoot) {
        const pathSegments = repoRoot.split('/').filter(s => s.length > 0);
        const dirName = pathSegments[pathSegments.length - 1];
        if (dirName && dirName.length > 0) {
          return dirName;
        }
      }

      // Final fallback: use current project root directory name
      const currentDirSegments = this.projectRoot.split('/').filter(s => s.length > 0);
      return currentDirSegments[currentDirSegments.length - 1] || null;
    } catch {
      // Graceful error handling (Constraint #36)
      return null;
    }
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
      await execAsyncWithTimeout('svn info', { cwd: this.projectRoot });
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
    const { stdout } = await execAsyncWithTimeout(svnCommand, { cwd: this.projectRoot });

    // Parse XML to extract file paths
    const pathMatches = stdout.matchAll(/<path[^>]*>([^<]+)<\/path>/g);
    const committedFiles = Array.from(pathMatches, match => match[1])
      .map(path => path.replace(/^\//, '')); // Remove leading slash

    // Remove duplicates
    return [...new Set(committedFiles)];
  }

  async getStagedFiles(): Promise<string[]> {
    try {
      // SVN doesn't have a staging area - all changes are "staged"
      // Get modified (M) and added (A) files
      const svnCommand = 'svn status';
      const { stdout } = await execAsyncWithTimeout(svnCommand, { cwd: this.projectRoot });

      const stagedFiles = stdout
        .split('\n')
        .filter(line => {
          const trimmed = line.trim();
          return trimmed.startsWith('M ') || trimmed.startsWith('A ');
        })
        .map(line => line.substring(2).trim()) // Remove status prefix
        .filter(path => path.length > 0);

      return stagedFiles;
    } catch {
      // Not in an SVN repo or error occurred
      return [];
    }
  }

  getVCSType(): string {
    return 'SVN';
  }

  async getRepositoryRoot(): Promise<string | null> {
    // SVN doesn't have a single command for repository root
    // Return project root as approximation
    return this.projectRoot;
  }

  async getRemoteUrl(): Promise<string | null> {
    try {
      const { stdout } = await execAsyncWithTimeout('svn info --show-item url', {
        cwd: this.projectRoot,
      });
      return stdout.trim();
    } catch {
      return null;
    }
  }

  async extractProjectName(): Promise<string | null> {
    // Extract from SVN URL or directory name
    try {
      const url = await this.getRemoteUrl();
      if (url) {
        const segments = url.split('/').filter(s => s.length > 0);
        // Try to find trunk/branches/tags and use parent directory
        const trunkIndex = segments.indexOf('trunk');
        if (trunkIndex > 0) {
          return segments[trunkIndex - 1];
        }
        // Otherwise use last segment
        return segments[segments.length - 1] || null;
      }

      // Fallback to directory name
      const pathSegments = this.projectRoot.split('/').filter(s => s.length > 0);
      return pathSegments[pathSegments.length - 1] || null;
    } catch {
      return null;
    }
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
      await execAsyncWithTimeout('hg root', { cwd: this.projectRoot });
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
    const { stdout } = await execAsyncWithTimeout(hgCommand, { cwd: this.projectRoot });

    const committedFiles = stdout
      .split('\n')
      .flatMap(line => line.split(' '))
      .map(file => file.trim())
      .filter(file => file.length > 0);

    // Remove duplicates
    return [...new Set(committedFiles)];
  }

  async getStagedFiles(): Promise<string[]> {
    try {
      // Get modified (M), added (A), and removed (R) files in working directory
      const hgCommand = 'hg status -m -a -r';
      const { stdout } = await execAsyncWithTimeout(hgCommand, { cwd: this.projectRoot });

      const stagedFiles = stdout
        .split('\n')
        .filter(line => {
          const trimmed = line.trim();
          return trimmed.startsWith('M ') || trimmed.startsWith('A ') || trimmed.startsWith('R ');
        })
        .map(line => line.substring(2).trim()) // Remove status prefix
        .filter(path => path.length > 0);

      return stagedFiles;
    } catch {
      // Not in a Mercurial repo or error occurred
      return [];
    }
  }

  getVCSType(): string {
    return 'Mercurial';
  }

  async getRepositoryRoot(): Promise<string | null> {
    try {
      const { stdout } = await execAsyncWithTimeout('hg root', { cwd: this.projectRoot });
      return stdout.trim();
    } catch {
      return null;
    }
  }

  async getRemoteUrl(): Promise<string | null> {
    try {
      const { stdout } = await execAsyncWithTimeout('hg paths default', {
        cwd: this.projectRoot,
      });
      return stdout.trim();
    } catch {
      return null;
    }
  }

  async extractProjectName(): Promise<string | null> {
    // Extract from Mercurial remote URL or directory name
    try {
      const url = await this.getRemoteUrl();
      if (url) {
        const urlWithoutScheme = url.replace(/^https?:\/\//, '');
        const segments = urlWithoutScheme.split('/').filter(s => s.length > 0);
        return segments[segments.length - 1] || null;
      }

      // Fallback to repository root directory name
      const repoRoot = await this.getRepositoryRoot();
      if (repoRoot) {
        const pathSegments = repoRoot.split('/').filter(s => s.length > 0);
        return pathSegments[pathSegments.length - 1] || null;
      }

      return null;
    } catch {
      return null;
    }
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
