#!/usr/bin/env node
/**
 * Cross-platform test output filter for AI-optimized test results.
 * Filters test output to show only failures and summary lines.
 *
 * Usage: node --test ... | node scripts/filter-test-output.js
 */

import { createInterface } from 'readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Pattern matches: errors, failures (lines to SHOW)
const includePattern = /(✖|Error|FAIL)/;

// Pattern matches: passing tests, test start markers (lines to EXCLUDE)
const excludePattern = /(✔|✅|▶)/;

// Pattern to detect final summary section (lines starting with ℹ)
const summaryPattern = /^ℹ /;

let inSummary = false;

rl.on('line', (line) => {
  // If we encounter a summary line, enter summary mode
  if (summaryPattern.test(line)) {
    inSummary = true;
  }

  // In summary mode, show all ℹ lines (complete table)
  if (inSummary && summaryPattern.test(line)) {
    console.log(line);
    return;
  }

  // Otherwise, show line if it matches include pattern AND doesn't match exclude pattern
  if (includePattern.test(line) && !excludePattern.test(line)) {
    console.log(line);
  }
});

rl.on('close', () => {
  process.exit(0);
});
