#!/usr/bin/env node

/**
 * live-preview-builder/build-preview.js
 *
 * Packages a ClawLess-compatible gitagent into a self-contained browser
 * preview that can be served from any static host.
 *
 * Usage:
 *   node build-preview.js <repo-path> [--out <dir>] [--repo-url <github-url>]
 *
 * Outputs to dist/clawless-preview/ by default.
 */

const fs = require('fs');
const path = require('path');

// ââ Configuration âââââââââââââââââââââââââââââââââââââââââââ

const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.clawless-backup', 'dist', '.gitagent']);
const EXCLUDE_FILES = new Set(['.env', '.env.local', '.env.production']);
const MAX_FILE_SIZE = 1024 * 1024; // 1MB per file (skip larger)
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot']);

// ââ Helpers âââââââââââââââââââââââââââââââââââââââââââââââââ

function walkDir(dir, basePath, tree = {}) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    if (EXCLUDE_FILES.has(entry.name)) continue;
    if (entry.name.startsWith('.') && entry.isFile()) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      tree[entry.name] = { directory: {} };
      walkDir(fullPath, basePath, tree[entry.name].directory);
    } else {
      const stat = fs.statSync(fullPath);
      if (stat.size > MAX_FILE_SIZE) continue;

      if (BINARY_EXTENSIONS.has(path.extname(entry.name))) {
        const buffer = fs.readFileSync(fullPath);
        tree[entry.name] = {
          file: { contents: `__BINARY_BASE64__${buffer.toString('base64')}` },
        };
      } else {
        const contents = fs.readFileSync(fullPath, 'utf8');
        tree[entry.name] = { file: { contents } };
      }
    }
  }

  return tree;
}

// ââ HTML Template âââââââââââââââââââââââââââââââââââââââââââ

function generatePreviewHTML(agentName, agentVersion) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${agentName} â ClawLess Preview</title>
  <meta name="description" content="Live browser-based preview of ${agentName} v${agentVersion} powered by ClawLess WebContainer runtime">
  <style>
    :root {
      --bg-primary: #0a0a0f;
      --bg-secondary: #12121a;
      --bg-card: #1a1a2e;
      --accent: #6c63ff;
      --accent-glow: rgba(108, 99, 255, 0.3);
      --text-primary: #e8e8f0;
      --text-secondary: #8888a0;
      --success: #4ade80;
      --warning: #fbbf24;
      --error: #f87171;
      --border: #2a2a3e;
      --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--font-sans);
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    header {
      padding: 1.5rem 2rem;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .logo-icon {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, var(--accent), #a78bfa);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
    }

    .logo h1 {
      font-size: 1.25rem;
      font-weight: 600;
      background: linear-gradient(135deg, var(--accent), #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .version {
      font-size: 0.75rem;
      color: var(--text-secondary);
      background: var(--bg-card);
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
    }

    #status-badge {
      padding: 0.3rem 0.8rem;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 500;
      background: var(--bg-card);
      border: 1px solid var(--border);
    }

    #status-badge.ready { border-color: var(--success); color: var(--success); }
    #status-badge.loading { border-color: var(--warning); color: var(--warning); }
    #status-badge.error { border-color: var(--error); color: var(--error); }

    .setup-panel {
      max-width: 480px;
      margin: 3rem auto;
      padding: 2rem;
      background: var(--bg-card);
      border-radius: 12px;
      border: 1px solid var(--border);
    }

    .setup-panel h2 {
      font-size: 1.1rem;
      margin-bottom: 1rem;
      color: var(--text-primary);
    }

    .setup-panel label {
      display: block;
      font-size: 0.85rem;
      color: var(--text-secondary);
      margin-bottom: 0.3rem;
    }

    .setup-panel input {
      width: 100%;
      padding: 0.6rem 0.8rem;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 0.85rem;
      margin-bottom: 1rem;
    }

    .setup-panel input:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }

    #run-btn {
      width: 100%;
      padding: 0.75rem;
      background: linear-gradient(135deg, var(--accent), #a78bfa);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
    }

    #run-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 20px var(--accent-glow);
    }

    #run-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 1rem 2rem;
    }

    #terminal-container {
      flex: 1;
      background: var(--bg-secondary);
      border-radius: 8px;
      border: 1px solid var(--border);
      overflow: hidden;
      display: none;
      min-height: 400px;
    }

    #terminal-output {
      height: 100%;
      padding: 1rem;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      overflow-y: auto;
      white-space: pre-wrap;
      line-height: 1.6;
      color: var(--text-primary);
    }

    .log-info { color: var(--text-secondary); }
    .log-success { color: var(--success); }
    .log-warn { color: var(--warning); }
    .log-error { color: var(--error); }
    .log-agent { color: var(--accent); }

    footer {
      padding: 1rem 2rem;
      text-align: center;
      font-size: 0.75rem;
      color: var(--text-secondary);
      border-top: 1px solid var(--border);
    }

    footer a { color: var(--accent); text-decoration: none; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .pulsing { animation: pulse 1.5s infinite; }
  </style>
</head>
<body>
  <header>
    <div class="logo">
      <div class="logo-icon">â¡</div>
      <h1>${agentName}</h1>
      <span class="version">v${agentVersion}</span>
    </div>
    <div id="status-badge">Initializing</div>
  </header>

  <main>
    <div class="setup-panel" id="setup-panel">
      <h2>ð Configure API Key</h2>
      <label for="api-key">Anthropic API Key (or set via provider below)</label>
      <input type="password" id="api-key" placeholder="sk-ant-..." autocomplete="off">
      <label for="provider-select">Provider</label>
      <select id="provider-select" style="width:100%;padding:0.6rem;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:0.85rem;margin-bottom:1rem;">
        <option value="anthropic">Anthropic (Claude)</option>
        <option value="openai">OpenAI (GPT-4o)</option>
        <option value="google">Google (Gemini)</option>
      </select>
      <button id="run-btn" onclick="startAgent()">â¶ Run Agent</button>
    </div>
    <div id="terminal-container">
      <div id="terminal-output"></div>
    </div>
  </main>

  <footer>
    Powered by <a href="https://github.com/open-gitagent/clawless" target="_blank">ClawLess</a>
    Â· Built with <a href="https://gitagent.sh" target="_blank">GitAgent</a>
  </footer>

  <script type="module">
    import { ClawContainer } from 'https://esm.sh/clawcontainer@latest';

    window.agentFiles = null;
    let cc = null;

    // Load the agent bundle
    async function loadBundle() {
      try {
        const mod = await import('./agent-bundle.js');
        window.agentFiles = mod.default || mod.files;
        log('Agent bundle loaded', 'success');
      } catch (e) {
        log('Failed to load agent bundle: ' + e.message, 'error');
      }
    }

    function log(msg, level = 'info') {
      const el = document.getElementById('terminal-output');
      const ts = new Date().toLocaleTimeString();
      const span = document.createElement('span');
      span.className = 'log-' + level;
      span.textContent = '[' + ts + '] ' + msg + '\\n';
      el.appendChild(span);
      el.scrollTop = el.scrollHeight;
    }

    function setStatus(text, className) {
      const badge = document.getElementById('status-badge');
      badge.textContent = text;
      badge.className = className;
    }

    window.startAgent = async function() {
      const apiKey = document.getElementById('api-key').value.trim();
      const provider = document.getElementById('provider-select').value;

      if (!apiKey) {
        alert('Please enter an API key');
        return;
      }

      // Save to localStorage
      localStorage.setItem('clawless_preview_key', apiKey);
      localStorage.setItem('clawless_preview_provider', provider);

      // Switch to terminal view
      document.getElementById('setup-panel').style.display = 'none';
      document.getElementById('terminal-container').style.display = 'block';

      setStatus('Booting...', 'loading pulsing');
      log('Starting ClawLess WebContainer...', 'info');

      const envKey = provider === 'openai' ? 'OPENAI_API_KEY'
                   : provider === 'google' ? 'GOOGLE_API_KEY'
                   : 'ANTHROPIC_API_KEY';

      try {
        cc = new ClawContainer('#terminal-container', {
          template: 'gitclaw',
          env: { [envKey]: apiKey },
          workspace: window.agentFiles,
        });

        cc.on('ready', () => {
          setStatus('Running', 'ready');
          log('Agent is ready!', 'success');
        });

        cc.on('error', (err) => {
          setStatus('Error', 'error');
          log('Error: ' + err.message, 'error');
        });

        cc.on('status', (status) => {
          log('Status: ' + status, 'info');
        });

        await cc.start();
      } catch (e) {
        setStatus('Error', 'error');
        log('Failed to start: ' + e.message, 'error');
      }
    };

    // Auto-fill from localStorage
    const savedKey = localStorage.getItem('clawless_preview_key');
    if (savedKey) document.getElementById('api-key').value = savedKey;
    const savedProvider = localStorage.getItem('clawless_preview_provider');
    if (savedProvider) document.getElementById('provider-select').value = savedProvider;

    loadBundle();
  </script>
</body>
</html>`;
}

// ââ Policy Template âââââââââââââââââââââââââââââââââââââââââ

function generatePolicy() {
  return `version: "1"
mode: deny-all
files:
  read:
    - pattern: "**"
      allow: true
  write:
    - pattern: "workspace/**"
      allow: true
    - pattern: "node_modules/**"
      allow: false
processes:
  - pattern: "node *"
    allow: true
  - pattern: "npm *"
    allow: true
  - pattern: "npx *"
    allow: true
  - pattern: "rm -rf *"
    allow: false
ports:
  - port: 3000
    allow: true
  - port: 3001
    allow: true
tools:
  - name: "*"
    allow: true
limits:
  maxFileSize: 10485760
  maxProcesses: 5
  maxTurns: 30
  timeoutSec: 180
`;
}

// ââ README Template âââââââââââââââââââââââââââââââââââââââââ

function generateReadme(agentName, agentVersion, repoUrl) {
  let readme = `# ${agentName} â ClawLess Preview

> Auto-generated by clawless-deployer live-preview-builder

## How to Run

### Option 1: Local Server (recommended for development)
\`\`\`bash
# Install a static server with the right headers
npx serve . --cors -l 3000 \\
  --config '{"headers":[{"source":"**","headers":[{"key":"Cross-Origin-Embedder-Policy","value":"require-corp"},{"key":"Cross-Origin-Opener-Policy","value":"same-origin"}]}]}'
\`\`\`

Then open http://localhost:3000

### Option 2: Any Static Host
Upload these files to any static host that supports custom headers.
Required headers:
- \`Cross-Origin-Embedder-Policy: require-corp\`
- \`Cross-Origin-Opener-Policy: same-origin\`

## Requirements
- Modern browser: Chrome 90+, Firefox 89+, or Edge 91+
- API key for the configured AI provider
- Active internet (for npm package installation in WebContainer)
`;

  if (repoUrl) {
    readme += `
## Live URL
Open directly on play.clawless.io:
\`\`\`
https://play.clawless.io/?repo=${repoUrl}
\`\`\`
`;
  }

  return readme;
}

// ââ Main ââââââââââââââââââââââââââââââââââââââââââââââââââââ

function main() {
  const args = process.argv.slice(2);
  const repoPath = args.find((a) => !a.startsWith('--')) || '.';
  const outIdx = args.indexOf('--out');
  const outDir = outIdx !== -1 ? args[outIdx + 1] : path.join(repoPath, 'dist', 'clawless-preview');
  const repoUrlIdx = args.indexOf('--repo-url');
  const repoUrl = repoUrlIdx !== -1 ? args[repoUrlIdx + 1] : null;

  if (!fs.existsSync(repoPath)) {
    console.error(`Error: path "${repoPath}" does not exist`);
    process.exit(1);
  }

  const resolvedPath = path.resolve(repoPath);

  // Parse agent info
  const agentYamlPath = path.join(resolvedPath, 'agent.yaml');
  if (!fs.existsSync(agentYamlPath)) {
    console.error('Error: agent.yaml not found');
    process.exit(1);
  }

  const agentYaml = fs.readFileSync(agentYamlPath, 'utf8');
  const nameMatch = agentYaml.match(/name:\s*(.+)/);
  const versionMatch = agentYaml.match(/version:\s*(.+)/);
  const agentName = nameMatch ? nameMatch[1].trim() : 'unknown-agent';
  const agentVersion = versionMatch ? versionMatch[1].trim() : '0.0.0';

  console.log(`Building ClawLess preview for ${agentName} v${agentVersion}...`);

  // Build FileSystemTree
  const fileTree = walkDir(resolvedPath, resolvedPath);
  const bundleContent = `// Auto-generated by clawless-deployer live-preview-builder
// Agent: ${agentName} v${agentVersion}
// Generated: ${new Date().toISOString()}

export const files = ${JSON.stringify(fileTree, null, 2)};
export default files;
`;

  // Create output directory
  fs.mkdirSync(outDir, { recursive: true });

  // Write files
  fs.writeFileSync(path.join(outDir, 'index.html'), generatePreviewHTML(agentName, agentVersion));
  fs.writeFileSync(path.join(outDir, 'agent-bundle.js'), bundleContent);
  fs.writeFileSync(path.join(outDir, 'policy.yaml'), generatePolicy());
  fs.writeFileSync(path.join(outDir, 'README.md'), generateReadme(agentName, agentVersion, repoUrl));

  // Report
  const htmlSize = (fs.statSync(path.join(outDir, 'index.html')).size / 1024).toFixed(1);
  const bundleSize = (fs.statSync(path.join(outDir, 'agent-bundle.js')).size / 1024).toFixed(1);

  console.log('');
  console.log('â Preview build complete!');
  console.log('');
  console.log('Files generated:');
  console.log(`  ${outDir}/index.html      (${htmlSize} KB)`);
  console.log(`  ${outDir}/agent-bundle.js  (${bundleSize} KB)`);
  console.log(`  ${outDir}/policy.yaml`);
  console.log(`  ${outDir}/README.md`);
  console.log('');
  console.log('To serve locally:');
  console.log(`  npx serve ${outDir} --cors -l 3000`);

  if (repoUrl) {
    console.log('');
    console.log(`Live URL: https://play.clawless.io/?repo=${repoUrl}`);
  }
}

main();
