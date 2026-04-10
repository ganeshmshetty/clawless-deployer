#!/usr/bin/env node

/**
 * bundle-analyzer/analyze.js
 *
 * Analyzes a gitagent repository and produces a compatibility report
 * showing which skills work in ClawLess vs require gitclaw.
 *
 * Usage:
 *   node analyze.js <repo-path> [--json] [--policy <policy.yaml>]
 *
 * This skill is READ-ONLY â it never modifies any files.
 */

const fs = require('fs');
const path = require('path');

// ââ Configuration âââââââââââââââââââââââââââââââââââââââââââ

const INCOMPATIBLE_PATTERNS = {
  python: {
    extensions: ['.py'],
    severity: 'INCOMPATIBLE',
    reason: 'Python is not supported in WebContainer',
  },
  shellScript: {
    extensions: ['.sh', '.bash'],
    severity: 'WARN',
    reason: 'Shell scripts may work if only using Node-available commands',
  },
  nativeBinary: {
    extensions: ['.node', '.so', '.dylib', '.dll'],
    severity: 'INCOMPATIBLE',
    reason: 'Native binary modules cannot run in WebContainer',
  },
};

const API_PATTERNS = [
  { regex: /require\s*\(\s*['"]child_process['"]\s*\)/g, label: 'child_process', severity: 'NEEDS_REWRITE' },
  { regex: /import\s+.*from\s+['"]child_process['"]/g, label: 'child_process (ESM)', severity: 'NEEDS_REWRITE' },
  { regex: /fs\.(writeFileSync|readFileSync|mkdirSync|rmdirSync|unlinkSync)\s*\(/g, label: 'sync fs', severity: 'NEEDS_REWRITE' },
  { regex: /require\s*\(\s*['"]net['"]\s*\)/g, label: 'raw sockets', severity: 'INCOMPATIBLE' },
  { regex: /require\s*\(\s*['"]dgram['"]\s*\)/g, label: 'UDP sockets', severity: 'INCOMPATIBLE' },
  { regex: /require\s*\(\s*['"]worker_threads['"]\s*\)/g, label: 'worker_threads', severity: 'WARN' },
  { regex: /process\.exit\s*\(/g, label: 'process.exit()', severity: 'WARN' },
];

const DEFAULT_LIMITS = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxProcesses: 10,
  maxTurns: 50,
  timeoutSec: 120,
};

const SCAN_EXTENSIONS = new Set(['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx']);

// ââ Helpers âââââââââââââââââââââââââââââââââââââââââââââââââ

function walkDir(dir, opts = {}) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.clawless-backup', 'dist'].includes(entry.name)) continue;
      results.push(...walkDir(fullPath, opts));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function parseYamlFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const frontmatter = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      frontmatter[key.trim()] = rest.join(':').trim().replace(/^["']|["']$/g, '');
    }
  }
  return frontmatter;
}

function parseSimpleYaml(content) {
  // Minimal YAML parser for agent.yaml â handles flat keys and simple lists
  const result = {};
  const lines = content.split('\n');
  let currentKey = null;
  let currentList = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const listMatch = trimmed.match(/^-\s+(.+)/);
    if (listMatch && currentKey) {
      if (!result[currentKey]) result[currentKey] = [];
      if (Array.isArray(result[currentKey])) {
        result[currentKey].push(listMatch[1].replace(/^["']|["']$/g, ''));
      }
      continue;
    }

    const kvMatch = trimmed.match(/^(\w[\w.]*)\s*:\s*(.+)?/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const val = kvMatch[2]?.trim().replace(/^["']|["']$/g, '');
      result[currentKey] = val || [];
    }
  }
  return result;
}

function getFileSizeRecursive(dir) {
  let total = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git'].includes(entry.name)) continue;
      total += getFileSizeRecursive(fullPath);
    } else {
      total += fs.statSync(fullPath).size;
    }
  }
  return total;
}

// ââ Analysis Functions ââââââââââââââââââââââââââââââââââââââ

function analyzeSkill(skillDir, repoPath) {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    return {
      name: path.basename(skillDir),
      status: 'WARN',
      issues: ['Missing SKILL.md'],
      fixEffort: 'low',
    };
  }

  const skillContent = fs.readFileSync(skillMdPath, 'utf8');
  const frontmatter = parseYamlFrontmatter(skillContent);
  const skillName = frontmatter.name || path.basename(skillDir);
  const issues = [];
  let worstSeverity = 'COMPATIBLE';

  // Scan all files in skill directory
  const files = walkDir(skillDir);
  for (const file of files) {
    const ext = path.extname(file);

    // Check for incompatible file types
    for (const [key, rule] of Object.entries(INCOMPATIBLE_PATTERNS)) {
      if (rule.extensions.includes(ext)) {
        issues.push(`${path.relative(repoPath, file)}: ${rule.reason}`);
        if (rule.severity === 'INCOMPATIBLE') worstSeverity = 'INCOMPATIBLE';
        else if (rule.severity === 'WARN' && worstSeverity === 'COMPATIBLE') worstSeverity = 'WARN';
      }
    }

    // Scan code files for API issues
    if (SCAN_EXTENSIONS.has(ext)) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of API_PATTERNS) {
        pattern.regex.lastIndex = 0;
        const matches = content.match(pattern.regex);
        if (matches) {
          issues.push(`${path.relative(repoPath, file)}: uses ${pattern.label} (${matches.length} occurrence${matches.length > 1 ? 's' : ''})`);
          if (pattern.severity === 'INCOMPATIBLE') worstSeverity = 'INCOMPATIBLE';
          else if (pattern.severity === 'NEEDS_REWRITE' && worstSeverity !== 'INCOMPATIBLE') worstSeverity = 'NEEDS_REWRITE';
          else if (pattern.severity === 'WARN' && worstSeverity === 'COMPATIBLE') worstSeverity = 'WARN';
        }
      }
    }
  }

  const fixEffort = worstSeverity === 'INCOMPATIBLE' ? 'high' : worstSeverity === 'NEEDS_REWRITE' ? 'medium' : worstSeverity === 'WARN' ? 'low' : 'none';

  return {
    name: skillName,
    status: worstSeverity,
    issues,
    fixEffort,
    allowedTools: frontmatter['allowed-tools'] || 'not specified',
  };
}

function analyzeTools(toolsDir, repoPath) {
  if (!fs.existsSync(toolsDir)) return [];

  const toolFiles = fs.readdirSync(toolsDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  return toolFiles.map((file) => {
    const content = fs.readFileSync(path.join(toolsDir, file), 'utf8');
    const issues = [];

    // Check for references to external binaries
    if (/command:\s*(python|pip|apt-get|brew|gcc|make)\b/i.test(content)) {
      issues.push('References external binary not available in WebContainer');
    }

    return {
      name: file.replace(/\.ya?ml$/, ''),
      status: issues.length === 0 ? 'COMPATIBLE' : 'INCOMPATIBLE',
      issues,
    };
  });
}

function estimateResources(repoPath, limits) {
  const totalSize = getFileSizeRecursive(repoPath);
  const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
  const limitMB = (limits.maxFileSize / (1024 * 1024)).toFixed(0);

  // Count dependencies
  const pkgPath = path.join(repoPath, 'package.json');
  let depCount = 0;
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    depCount = Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length;
  }

  // Estimate process count from skills
  const skillsDir = path.join(repoPath, 'skills');
  let skillCount = 0;
  if (fs.existsSync(skillsDir)) {
    skillCount = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  }

  return {
    totalSize: { value: `${totalSizeMB} MB`, limit: `${limitMB} MB`, ok: totalSize < limits.maxFileSize },
    dependencies: { value: depCount, limit: 'â', ok: depCount < 50 },
    processesNeeded: { value: Math.min(skillCount + 2, limits.maxProcesses), limit: limits.maxProcesses, ok: skillCount + 2 <= limits.maxProcesses },
  };
}

// ââ Report Generation âââââââââââââââââââââââââââââââââââââââ

function generateMarkdownReport(agentInfo, skillResults, toolResults, resources, verdict) {
  const statusIcon = (s) => (s === 'COMPATIBLE' ? 'â' : s === 'NEEDS_REWRITE' ? 'â ï¸' : s === 'WARN' ? 'â ï¸' : 'â');
  const resourceIcon = (ok) => (ok ? 'â' : 'â ï¸');

  let md = `# ClawLess Compatibility Report\n\n`;
  md += `## Agent: ${agentInfo.name} v${agentInfo.version}\n\n`;
  md += `## Overall Verdict: ${verdict}\n\n`;

  // Skill Matrix
  md += `## Skill Matrix\n`;
  md += `| Skill | Status | Issues | Fix Effort |\n`;
  md += `|-------|--------|--------|------------|\n`;
  for (const skill of skillResults) {
    const issueStr = skill.issues.length === 0 ? 'none' : skill.issues.join('; ');
    md += `| ${skill.name} | ${statusIcon(skill.status)} ${skill.status} | ${issueStr} | ${skill.fixEffort} |\n`;
  }

  // Tool Matrix
  if (toolResults.length > 0) {
    md += `\n## Tool Matrix\n`;
    md += `| Tool | Status | Issues |\n`;
    md += `|------|--------|--------|\n`;
    for (const tool of toolResults) {
      const issueStr = tool.issues.length === 0 ? 'none' : tool.issues.join('; ');
      md += `| ${tool.name} | ${statusIcon(tool.status)} | ${issueStr} |\n`;
    }
  }

  // Resource Budget
  md += `\n## Resource Budget\n`;
  md += `| Resource | Used | Limit | Status |\n`;
  md += `|----------|------|-------|--------|\n`;
  for (const [key, val] of Object.entries(resources)) {
    md += `| ${key} | ${val.value} | ${val.limit} | ${resourceIcon(val.ok)} |\n`;
  }

  // Recommendation
  md += `\n## Recommendation\n`;
  if (verdict === 'READY') {
    md += `- **Deploy to: ClawLess** â\n`;
    md += `- This agent is fully compatible with the browser-based WebContainer runtime.\n`;
  } else if (verdict === 'NEEDS_WORK') {
    md += `- **Deploy to: ClawLess** (after fixes)\n`;
    md += `- Run \`webcontainer-optimizer\` to auto-fix rewritable issues.\n`;
    md += `- Review remaining warnings manually.\n`;
  } else {
    md += `- **Deploy to: gitclaw** (server-side runtime required)\n`;
    md += `- Some skills use Python, native binaries, or APIs that cannot run in-browser.\n`;
    md += `- Consider a hybrid approach: deploy compatible skills to ClawLess, incompatible ones to gitclaw.\n`;
  }

  return md;
}

// ââ Main ââââââââââââââââââââââââââââââââââââââââââââââââââââ

function main() {
  const args = process.argv.slice(2);
  const repoPath = args.find((a) => !a.startsWith('--')) || '.';
  const jsonOutput = args.includes('--json');

  if (!fs.existsSync(repoPath)) {
    console.error(`Error: path "${repoPath}" does not exist`);
    process.exit(1);
  }

  const resolvedPath = path.resolve(repoPath);

  // Parse agent.yaml
  const agentYamlPath = path.join(resolvedPath, 'agent.yaml');
  if (!fs.existsSync(agentYamlPath)) {
    console.error('Error: agent.yaml not found â is this a gitagent repository?');
    process.exit(1);
  }

  const agentYaml = fs.readFileSync(agentYamlPath, 'utf8');
  const agentInfo = parseSimpleYaml(agentYaml);

  // Analyze skills
  const skillsDir = path.join(resolvedPath, 'skills');
  const skillResults = [];
  if (fs.existsSync(skillsDir)) {
    const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory());
    for (const dir of skillDirs) {
      skillResults.push(analyzeSkill(path.join(skillsDir, dir.name), resolvedPath));
    }
  }

  // Analyze tools
  const toolsDir = path.join(resolvedPath, 'tools');
  const toolResults = analyzeTools(toolsDir, resolvedPath);

  // Estimate resources
  const resources = estimateResources(resolvedPath, DEFAULT_LIMITS);

  // Determine verdict
  const hasIncompatible = skillResults.some((s) => s.status === 'INCOMPATIBLE');
  const hasNeedsRewrite = skillResults.some((s) => s.status === 'NEEDS_REWRITE');
  const verdict = hasIncompatible ? 'INCOMPATIBLE' : hasNeedsRewrite ? 'NEEDS_WORK' : 'READY';

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          agent: { name: agentInfo.name, version: agentInfo.version },
          verdict,
          skills: skillResults,
          tools: toolResults,
          resources,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
  } else {
    console.log(
      generateMarkdownReport(
        { name: agentInfo.name || 'unknown', version: agentInfo.version || '0.0.0' },
        skillResults,
        toolResults,
        resources,
        verdict
      )
    );
  }

  // Exit code based on verdict
  if (verdict === 'INCOMPATIBLE') process.exit(2);
  if (verdict === 'NEEDS_WORK') process.exit(1);
  process.exit(0);
}

main();
