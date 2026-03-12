#!/usr/bin/env node

/**
 * Security Audit Script
 * يفحص البرنامج عن مشاكل أمنية شائعة
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ISSUES = {
  critical: [],
  high: [],
  medium: [],
  low: []
};

const PATTERNS = {
  hardcodedPassword: /password\s*[:=]\s*['"][^'"]{3,}['"]/gi,
  hardcodedToken: /token\s*[:=]\s*['"]sk_[^'"]+['"]/gi,
  unsafeConsole: /console\.(log|error|warn|debug)\(/g,
  alertCalls: /alert\(/g,
  anyType: /:\s*any[\s,\)]/g,
  sqlInjection: /`.*\$\{.*\}`/g,
  eval: /eval\(/g,
  localStorage: /localStorage\.(setItem|getItem)/g,
  credentials: /password|secret|token|apiKey|authToken/i
};

const SAFE_PATHS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'SECURITY_GUIDELINES.md',
  'utils/securityGuards.ts',
  'utils/securityValidation.ts',
  'utils/securityMiddleware.ts',
  'scripts/security-audit.js',
  'utils/securityUtils.test.ts',
  'package-lock.json'
];

function scanFile(filePath) {
  if (SAFE_PATHS.some(p => filePath.includes(p))) {
    return;
  }

  if (!['.ts', '.tsx', '.js', '.jsx'].some(ext => filePath.endsWith(ext))) {
    return;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Check for hardcoded passwords
      if (PATTERNS.hardcodedPassword.test(line) && !line.includes('// ')) {
        ISSUES.critical.push({
          file: filePath,
          line: lineNum,
          issue: 'Hardcoded password detected',
          content: line.trim().substring(0, 50)
        });
      }

      // Check for hardcoded tokens
      if (PATTERNS.hardcodedToken.test(line)) {
        ISSUES.critical.push({
          file: filePath,
          line: lineNum,
          issue: 'Hardcoded API token detected',
          content: line.trim().substring(0, 50)
        });
      }

      // Check for console in production code
      if (PATTERNS.unsafeConsole.test(line) && !line.includes('NODE_ENV')) {
        ISSUES.medium.push({
          file: filePath,
          line: lineNum,
          issue: 'Console output without NODE_ENV check',
          content: line.trim().substring(0, 50)
        });
      }

      // Check for modal popup calls
      if (PATTERNS.alertCalls.test(line)) {
        ISSUES.high.push({
          file: filePath,
          line: lineNum,
          issue: 'Modal popup() call detected - use toast instead',
          content: line.trim().substring(0, 50)
        });
      }

      // Check for 'any' type
      if (PATTERNS.anyType.test(line) && !line.includes('any[]')) {
        ISSUES.medium.push({
          file: filePath,
          line: lineNum,
          issue: "'any' type usage - should use explicit types",
          content: line.trim().substring(0, 50)
        });
      }

      // Check for unsafe localStorage
      if (PATTERNS.localStorage.test(line) && !line.includes('secureStorage')) {
        ISSUES.high.push({
          file: filePath,
          line: lineNum,
          issue: 'Direct localStorage usage - use secureStorage instead',
          content: line.trim().substring(0, 50)
        });
      }
    });
  } catch (error) {
    console.error(`Error scanning ${filePath}:`, error.message);
  }
}

function scanDirectory(dirPath) {
  const files = fs.readdirSync(dirPath, { withFileTypes: true });

  files.forEach(file => {
    const fullPath = path.join(dirPath, file.name);

    if (SAFE_PATHS.some(p => fullPath.includes(p))) {
      return;
    }

    if (file.isDirectory()) {
      scanDirectory(fullPath);
    } else {
      scanFile(fullPath);
    }
  });
}

function printReport() {
  console.log('\n🛡️  Security Audit Report');
  console.log('='.repeat(60));

  if (ISSUES.critical.length > 0) {
    console.log('\n🔴 CRITICAL ISSUES:');
    ISSUES.critical.forEach(issue => {
      console.log(`  ❌ ${issue.file}:${issue.line}`);
      console.log(`     ${issue.issue}`);
      console.log(`     ${issue.content}...`);
    });
  }

  if (ISSUES.high.length > 0) {
    console.log('\n🟠 HIGH PRIORITY:');
    ISSUES.high.forEach(issue => {
      console.log(`  ⚠️  ${issue.file}:${issue.line}`);
      console.log(`     ${issue.issue}`);
    });
  }

  if (ISSUES.medium.length > 0) {
    console.log('\n🟡 MEDIUM PRIORITY:');
    console.log(`  Found ${ISSUES.medium.length} issues`);
  }

  if (ISSUES.low.length > 0) {
    console.log('\n🔵 LOW PRIORITY:');
    console.log(`  Found ${ISSUES.low.length} issues`);
  }

  const total = Object.values(ISSUES).reduce((sum, arr) => sum + arr.length, 0);
  
  console.log('\n' + '='.repeat(60));
  console.log(`Total Issues: ${total}`);
  
  if (ISSUES.critical.length === 0) {
    console.log('\n✅ No critical security issues found!');
    console.log(`   (${ISSUES.high.length} high, ${ISSUES.medium.length} medium issues to review)\n`);
    return 0; // Allow build to continue
  } else {
    console.log('\n❌ Critical security issues found!');
    return 1;
  }
}

// Main
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log(`🔍 Scanning project: ${projectRoot}`);

scanDirectory(projectRoot);

process.exit(printReport());
