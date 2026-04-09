#!/usr/bin/env node

/**
 * webcontainer-optimizer/optimize.js
 *
 * Scans an agent repository for Node.js APIs incompatible with ClawLess
 * WebContainer runtime and rewrites them to browser-safe equivalents.
 *
 * Usage:
 *   node optimize.js <repo-path> [--dry-run] [--verbose]
 *
 * Outputs a JSON report to stdout and rewrites files in-place
 * (with backups in .clawless-backup/).
 */

const fs = require('fs');
const path = require('path');

// ── Configuration ───────────────────────────────────────────

const INCOMPATIBLE_APIS = [
  {
    pattern: /require\s*\(\s*['"]child_process['"]\s*\)/g,
    label: 'child_process require',
    severity: 'BLOCK',
    category: 'process',
  },
  {
    pattern: /import\s+.*\s+from\s+['"]child_process['"]/g,
    label: 'child_process import',
    severity: 'BLOCK',
    category: 'process',
  },
  {
    pattern: /child_process\.(exec|spawn|execSync|spawnSync|execFile|fork)\s*\(/g,
    label: 'child_process method call',
    severity: 'BLOCK',
    category: 'process',
  },
  {
    pattern: /fs\.(writeFileSync|readFileSync|mkdirSync|rmdirSync|unlinkSync|appendFileSync|copyFileSync|renameSync)\s*\(/g,
    label: 'synchronous fs method',
    severity: 'BLOCK',
    category: 'sync-fs',
  },
  {
    pattern: /require\s*\(\s*['"]net['"]\s*\)/g,
    label: 'net module (raw sockets)',
    severity: 'BLOCK',
    category: 'network',
  },
  {
    pattern: /require\s*\(\s*['"]dgram['"]\s*\)/g,
    label: 'dgram module (UDP sockets)',
    severity: 'BLOCK',
    category: 'network',
  },
  {
    pattern: /require\s*\(\s*['"]worker_threads['"]\s*\)/g,
    label: 'worker_threads (limited support)',
    severity: 'WARN',
    category: 'threading',
  },
  {
    pattern: /process\.exit\s*\(/g,
    label: 'process.exit() call',
    severity: 'WARN',
    category: 'lifecycle',
  },
];

const REWRITE_RULES = [
  {
    find: /require\s*\(\s*['"]child_process['"]\s*\)/g,
    replace: "/* clawless: child_process removed — use webcontainerInstance.spawn() */",
    note: 'Removed child_process require; use WebContainer spawn API',
  },
  {
    find: /child_process\.exec\s*\(\s*(.+?)\s*(?:,|\))/g,
    replaceFn: (match, cmd) =>
      `/* clawless-rewrite */ await webcontainerInstance.spawn(${cmd}.split(' ')[0], ${cmd}.split(' ').slice(1))`,
    note: 'Rewrote child_process.exec → webcontainerInstance.spawn',
  },
  {
    find: /child_process\.spawn\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/g,
    replaceFn: (match, bin, args) =>
      `/* clawless-rewrite */ await webcontainerInstance.spawn(${bin}, ${args})`,
    note: 'Rewrote child_process.spawn → webcontainerInstance.spawn',
  },
  {
    find: /fs\.writeFileSync\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/g,
    replaceFn: (match, filePath, data) =>
      `/* clawless-rewrite */ await webcontainerInstance.fs.writeFile(${filePath}, ${data})`,
    note: 'Rewrote fs.writeFileSync → webcontainerInstance.fs.writeFile',
  },
  {
    find: /fs\.readFileSync\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/g,
    replaceFn: (match, filePath, enc) =>
      `/* clawless-rewrite */ await webcontainerInstance.fs.readFile(${filePath}, ${enc})`,
    note: 'Rewrote fs.readFileSync → webcontainerInstance.fs.readFile',
  },
  {
    find: /fs\.mkdirSync\s*\(\s*(.+?)\s*(?:,\s*(.+?))?\s*\)/g,
    replaceFn: (match, dirPath, opts) =>
      opts
        ? `/* clawless-rewrite */ await webcontainerInstance.fs.mkdir(${dirPath}, ${opts})`
        : `/* clawless-rewrite */ await webcontainerInstance.fs.mkdir(${dirPath})`,
    note: 'Rewrote fs.mkdirSync → webcontainerInstance.fs.mkdir',
  },
];

const BLOCKED_PACKAGES = new Map([
  ['sharp', { reason: 'Native C++ image processing', replacement: '@napi-rs/image (WASM)' }],
  ['sqlite3', { reason: 'Native C++ SQLite bindings', replacement: 'sql.js (WASM)' }],
  ['bcrypt', { reason: 'Native C++ crypto', replacement: 'bcryptjs (pure JS)' }],
  ['canvas', { reason: 'Native C++ Canvas', replacement: '@napi-rs/canvas or remove' }],
  ['puppeteer', { reason: 'Requires Chromium binary', replacement: 'Remove (no browser-in-browser)' }],
  ['node-gyp', { reason: 'Native build toolchain', replacement: 'Remove' }],
  ['better-sqlite3', { reason: 'Native C++ SQLite', replacement: 'sql.js (WASM)' }],
  ['fsevents', { reason: 'macOS-only native module', replacement: 'Remove (not needed in WebContainer)' }],
  ['keytar', { reason: 'Native OS keychain access', replacement: 'Use env vars or localStorage' }],
]);

const SCAN_EXTENSIONS = new Set(['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx']);

// ── Helpers ─────────────────────────────────────────────────

function walkDir(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.clawless-backup', 'dist'].includes(entry.name)) continue;
      walkDir(fullPath, fileList);
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function ensureBackupDir(repoPath) {
  const backupDir = path.join(repoPath, '.clawless-backup');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
}

function backupFile(filePath, repoPath, backupDir) {
  const relative = path.relative(repoPath, filePath);
  const backupPath = path.join(backupDir, relative);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(filePath, backupPath);
}

// ── Scan Phase ──────────────────────────────────────────────

function scanFile(filePath, repoPath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const findings = [];

  for (const rule of INCOMPATIBLE_APIS) {
    // Reset regex state
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      findings.push({
        file: path.relative(repoPath, filePath),
        line: lineNum,
        match: match[0],
        label: rule.label,
        severity: rule.severity,
        category: rule.category,
        context: lines[lineNum - 1]?.trim() || '',
      });
    }
  }

  return findings;
}

function scanDependencies(repoPath) {
  const pkgPath = path.join(repoPath, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { found: false, dependencies: [], blocked: [] };
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  const depNames = Object.keys(allDeps);
  const blocked = [];

  for (const name of depNames) {
    if (BLOCKED_PACKAGES.has(name)) {
      const info = BLOCKED_PACKAGES.get(name);
      blocked.push({
        package: name,
        version: allDeps[name],
        reason: info.reason,
        replacement: info.replacement,
        severity: 'BLOCK',
      });
    }
  }

  return { found: true, dependencies: depNames, blocked };
}

// ── Rewrite Phase ───────────────────────────────────────────

function rewriteFile(filePath, repoPath, backupDir, dryRun) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  const rewrites = [];

  for (const rule of REWRITE_RULES) {
    rule.find.lastIndex = 0;
    if (rule.find.test(content)) {
      rule.find.lastIndex = 0;
      if (rule.replaceFn) {
        content = content.replace(rule.find, rule.replaceFn);
      } else {
        content = content.replace(rule.find, rule.replace);
      }
      rewrites.push({
        file: path.relative(repoPath, filePath),
        rule: rule.note,
      });
    }
  }

  if (rewrites.length > 0 && content !== originalContent) {
    if (!dryRun) {
      backupFile(filePath, repoPath, backupDir);
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }

  return rewrites;
}

// ── Main ────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const repoPath = args.find((a) => !a.startsWith('--')) || '.';
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  if (!fs.existsSync(repoPath)) {
    console.error(`Error: path "${repoPath}" does not exist`);
    process.exit(1);
  }

  const resolvedPath = path.resolve(repoPath);

  if (verbose) {
    console.error(`[optimizer] Scanning: ${resolvedPath}`);
    console.error(`[optimizer] Dry run: ${dryRun}`);
  }

  // Phase 1 & 2: Scan
  const files = walkDir(resolvedPath);
  const allFindings = [];
  for (const file of files) {
    allFindings.push(...scanFile(file, resolvedPath));
  }

  const depReport = scanDependencies(resolvedPath);

  // Phase 3: Rewrite
  const backupDir = dryRun ? null : ensureBackupDir(resolvedPath);
  const allRewrites = [];
  for (const file of files) {
    allRewrites.push(...rewriteFile(file, resolvedPath, backupDir, dryRun));
  }

  // Build report
  const report = {
    agent: resolvedPath,
    timestamp: new Date().toISOString(),
    dryRun,
    summary: {
      filesScanned: files.length,
      incompatibleAPIsFound: allFindings.length,
      blockedDependencies: depReport.blocked.length,
      autoFixed: allRewrites.length,
      manualReviewNeeded: allFindings.filter((f) => f.severity === 'BLOCK').length - allRewrites.length,
    },
    findings: allFindings,
    blockedDependencies: depReport.blocked,
    rewrites: allRewrites,
  };

  console.log(JSON.stringify(report, null, 2));

  // Exit with non-zero if issues remain
  if (report.summary.manualReviewNeeded > 0) {
    process.exit(2);
  }
}

main();
