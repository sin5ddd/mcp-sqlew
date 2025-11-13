/**
 * Semantic versioning utilities for decision version management
 *
 * Supports auto-incrementing MAJOR.MINOR.PATCH versions for decisions.
 * Used by decision.set action for automatic version management.
 */

export type VersionBumpLevel = 'major' | 'minor' | 'patch';

/**
 * Increments a semantic version string
 *
 * @param version - Current version string (e.g., "1.2.3")
 * @param level - Bump level: major, minor, or patch
 * @returns New version string
 *
 * @example
 * incrementSemver("1.2.3", "patch") // "1.2.4"
 * incrementSemver("1.2.3", "minor") // "1.3.0"
 * incrementSemver("1.2.3", "major") // "2.0.0"
 */
export function incrementSemver(
  version: string,
  level: VersionBumpLevel = 'patch'
): string {
  const parts = version.split('.').map(Number);

  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid semver format: ${version}. Expected MAJOR.MINOR.PATCH`);
  }

  const [major, minor, patch] = parts;

  switch (level) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid bump level: ${level}`);
  }
}

/**
 * Validates a semantic version string
 *
 * @param version - Version string to validate
 * @returns true if valid semver format
 *
 * @example
 * isValidSemver("1.2.3") // true
 * isValidSemver("1.2") // false
 * isValidSemver("v1.2.3") // false
 */
export function isValidSemver(version: string): boolean {
  const semverRegex = /^\d+\.\d+\.\d+$/;
  return semverRegex.test(version);
}

/**
 * Compares two semantic versions
 *
 * @param v1 - First version
 * @param v2 - Second version
 * @returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 *
 * @example
 * compareSemver("1.2.3", "1.2.4") // -1
 * compareSemver("2.0.0", "1.9.9") // 1
 * compareSemver("1.2.3", "1.2.3") // 0
 */
export function compareSemver(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }

  return 0;
}

/**
 * Default initial version for new decisions
 */
export const DEFAULT_VERSION = '1.0.0';
