/**
 * Policy Validator - Decision Intelligence System v3.9.0
 *
 * Validates decisions against policy rules for:
 * - Pattern matching (CVE IDs, semver, etc.)
 * - Required field enforcement
 * - Quality gate checking
 *
 * Task 401: Implement policy validation logic
 * Dependencies: Task 398 (migration complete)
 */

import type { DatabaseAdapter } from '../adapters/index.js';
import { getProjectContext } from './project-context.js';

/**
 * Validation result structure
 */
export interface ValidationResult {
  valid: boolean;
  violations: string[];
  matchedPolicy?: {
    id: number;
    name: string;
    category: string | null;
  };
}

/**
 * Policy structure from database
 */
interface PolicyRow {
  id: number;
  name: string;
  validation_rules: string | null;  // JSON
  quality_gates: string | null;     // JSON
  category: string | null;
  required_fields: string | null;   // JSON
}

/**
 * Validation rules structure (JSON parsed)
 */
interface ValidationRules {
  patterns?: Record<string, string>;  // field_name → regex pattern
}

/**
 * Quality gates structure (JSON parsed)
 */
interface QualityGates {
  required_fields?: string[];  // List of required metadata fields
}

/**
 * Validate a decision against applicable policies
 *
 * @param adapter - Database adapter
 * @param key - Decision key (for pattern matching)
 * @param value - Decision value (for completeness checking)
 * @param metadata - Decision metadata (rationale, alternatives, etc.)
 * @returns Validation result with violations or success
 */
export async function validateAgainstPolicies(
  adapter: DatabaseAdapter,
  key: string,
  value: string | number,
  metadata: Record<string, any> = {}
): Promise<ValidationResult> {
  const knex = adapter.getKnex();
  const projectId = getProjectContext().getProjectId();

  try {
    // Fetch all active policies for current project
    const policies = await knex('t_decision_policies')
      .where('project_id', projectId)
      .select('id', 'name', 'validation_rules', 'quality_gates', 'category', 'required_fields') as PolicyRow[];

    if (policies.length === 0) {
      // No policies defined - pass validation by default
      return { valid: true, violations: [] };
    }

    // Find matching policy (by key pattern or explicit policy reference)
    const matchedPolicy = findMatchingPolicy(policies, key, metadata);

    if (!matchedPolicy) {
      // No policy matches this decision - pass validation
      return { valid: true, violations: [] };
    }

    // Validate against matched policy
    const violations: string[] = [];

    // 1. Pattern Validation (if validation_rules defined)
    if (matchedPolicy.validation_rules) {
      try {
        const rules: ValidationRules = JSON.parse(matchedPolicy.validation_rules);
        const patternViolations = validatePatterns(rules, metadata);
        violations.push(...patternViolations);
      } catch (error) {
        console.error(`[Policy Validator] Failed to parse validation_rules for policy ${matchedPolicy.name}:`, error);
      }
    }

    // 2. Required Fields Validation (legacy template system compatibility)
    if (matchedPolicy.required_fields) {
      try {
        const requiredFields: string[] = JSON.parse(matchedPolicy.required_fields);
        const fieldViolations = validateRequiredFields(requiredFields, metadata);
        violations.push(...fieldViolations);
      } catch (error) {
        console.error(`[Policy Validator] Failed to parse required_fields for policy ${matchedPolicy.name}:`, error);
      }
    }

    // 3. Quality Gates Validation (v3.9.0 enhanced system)
    if (matchedPolicy.quality_gates) {
      try {
        const gates: QualityGates = JSON.parse(matchedPolicy.quality_gates);
        const gateViolations = validateQualityGates(gates, metadata);
        violations.push(...gateViolations);
      } catch (error) {
        console.error(`[Policy Validator] Failed to parse quality_gates for policy ${matchedPolicy.name}:`, error);
      }
    }

    // Return validation result
    return {
      valid: violations.length === 0,
      violations,
      matchedPolicy: {
        id: matchedPolicy.id,
        name: matchedPolicy.name,
        category: matchedPolicy.category
      }
    };
  } catch (error) {
    console.error('[Policy Validator] Validation failed:', error);
    // Fail-safe: Don't block decision creation on validation errors
    return { valid: true, violations: [`Validation error: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

/**
 * Find matching policy for decision key
 *
 * Matching strategy:
 * 1. Check metadata.policy_name for explicit policy reference
 * 2. Match key patterns (security_vulnerability → CVE-*, breaking_change → version-*, etc.)
 * 3. Return null if no match
 */
function findMatchingPolicy(policies: PolicyRow[], key: string, metadata: Record<string, any>): PolicyRow | null {
  // Strategy 1: Explicit policy reference in metadata
  if (metadata.policy_name) {
    const explicitMatch = policies.find(p => p.name === metadata.policy_name);
    if (explicitMatch) return explicitMatch;
  }

  // Strategy 2: Key pattern matching
  const keyLower = key.toLowerCase();

  // Security Vulnerability: CVE-*, security-*, vulnerability-*
  if (keyLower.startsWith('cve-') || keyLower.includes('security') || keyLower.includes('vulnerability')) {
    const securityPolicy = policies.find(p => p.name === 'security_vulnerability');
    if (securityPolicy) return securityPolicy;
  }

  // Breaking Change: version-*, v*-breaking, breaking-*
  if (keyLower.includes('version') || keyLower.includes('breaking') || /v\d+-/.test(keyLower)) {
    const breakingPolicy = policies.find(p => p.name === 'breaking_change');
    if (breakingPolicy) return breakingPolicy;
  }

  // Architecture Decision: architecture-*, design-*, adr-*
  if (keyLower.includes('architecture') || keyLower.includes('design') || keyLower.startsWith('adr-')) {
    const archPolicy = policies.find(p => p.name === 'architecture_decision');
    if (archPolicy) return archPolicy;
  }

  // Performance Optimization: performance-*, perf-*, optimization-*
  if (keyLower.includes('performance') || keyLower.includes('perf') || keyLower.includes('optimization')) {
    const perfPolicy = policies.find(p => p.name === 'performance_optimization');
    if (perfPolicy) return perfPolicy;
  }

  // Deprecation: deprecation-*, deprecated-*, deprecate-*
  if (keyLower.includes('deprecat')) {
    const deprecationPolicy = policies.find(p => p.name === 'deprecation');
    if (deprecationPolicy) return deprecationPolicy;
  }

  // No match found
  return null;
}

/**
 * Validate patterns (regex enforcement)
 */
function validatePatterns(rules: ValidationRules, metadata: Record<string, any>): string[] {
  const violations: string[] = [];

  if (!rules.patterns) return violations;

  for (const [field, pattern] of Object.entries(rules.patterns)) {
    const value = metadata[field];

    if (value !== undefined && value !== null) {
      try {
        const regex = new RegExp(pattern);
        const stringValue = String(value);

        if (!regex.test(stringValue)) {
          violations.push(`Field "${field}" value "${stringValue}" does not match required pattern: ${pattern}`);
        }
      } catch (error) {
        violations.push(`Invalid regex pattern for field "${field}": ${pattern}`);
      }
    }
    // Note: Missing fields are checked by quality_gates.required_fields, not here
  }

  return violations;
}

/**
 * Validate required fields (legacy template system compatibility)
 */
function validateRequiredFields(requiredFields: string[], metadata: Record<string, any>): string[] {
  const violations: string[] = [];

  for (const field of requiredFields) {
    const value = metadata[field];

    if (value === undefined || value === null || value === '') {
      violations.push(`Required field missing: "${field}"`);
    }
  }

  return violations;
}

/**
 * Validate quality gates (v3.9.0 enhanced system)
 */
function validateQualityGates(gates: QualityGates, metadata: Record<string, any>): string[] {
  const violations: string[] = [];

  // Required fields check (similar to legacy required_fields, but within quality_gates structure)
  if (gates.required_fields) {
    for (const field of gates.required_fields) {
      const value = metadata[field];

      if (value === undefined || value === null || value === '') {
        violations.push(`Quality gate: Required field missing: "${field}"`);
      }
    }
  }

  // Future enhancements: Add more quality gate types here
  // - Minimum length requirements
  // - Field value ranges
  // - Cross-field validations

  return violations;
}
