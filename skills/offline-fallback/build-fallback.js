#!/usr/bin/env node

/**
 * offline-fallback/build-fallback.js
 *
 * Generates a static fallback bundle that provides degraded-but-functional
 * agent interaction when WebContainer or network is unavailable.
 *
 * Usage:
 *   node build-fallback.js <repo-path> [--out <dir>] [--max-size <bytes>]
 */

const fs = require('fs');
const path = require('path');

// Ã¢ÂÂÃ¢ÂÂ Configuration Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

const DEFAULT_MAX_SIZE = 2 * 1024 * 1024; // 2MB

// Ã¢ÂÂÃ¢ÂÂ Agent Knowledge Extraction Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

function extractAgentProfile(repoPath) {
  const profile = {
    name: 'unknown',
    version: '0.0.0',
    description: '',
    soul: { identity: '', style: '', values: [] },
    rules: { always: [], never: [] },
    skills: [],
  };

  // Parse agent.yaml
  const agentPath = path.join(repoPath, 'agent.yaml');
  if (fs.existsSync(agentPath)) {
    const yaml = fs.readFileSync(agentPath, 'utf8');
    const name = yaml.match(/name:\s*(.+)/);
    const ver = yaml.match(/version:\s*(.+)/);
    const desc = yaml.match(/description:\s*"?(.+?)"?\s*$/m);
    if (name) profile.name = name[1].trim();
    if (ver) profile.version = ver[1].trim();
    if (desc) profile.description = desc[1].trim();
  }

  // Parse SOUL.md
  const soulPath = path.join(repoPath, 'SOUL.md');
  if (fs.existsSync(soulPath)) {
    const content = fs.readFileSync(soulPath, 'utf8');
    const sections = content.split(/^## /m);

    for (const section of sections) {
      const lines = section.split('\n');
      const heading = lines[0]?.trim().toLowerCase() || '';

      if (heading.includes('identity') || heading.includes('core')) {
        profile.soul.identity = lines.slice(1).join('\n').trim();
      } else if (heading.includes('style') || heading.includes('communication')) {
        profile.soul.style = lines.slice(1).join('\n').trim();
      } else if (heading.includes('values')) {
        profile.soul.values = lines
          .slice(1)
          .filter((l) => l.trim().startsWith('-'))
          .map((l) => l.replace(/^-\s*/, '').trim());
      }
    }
  }

  // Parse RULES.md
  const rulesPath = path.join(repoPath, 'RULES.md');
  if (fs.existsSync(rulesPath)) {
    const content = fs.readFileSync(rulesPath, 'utf8');
    const sections = content.split(/^## /m);

    for (const section of sections) {
      const lines = section.split('\n');
      const heading = lines[0]?.trim().toLowerCase() || '';
      const bullets = lines
        .slice(1)
        .filter((l) => l.trim().startsWith('-'))
        .map((l) => l.replace(/^-\s*/, '').trim());

      if (heading.includes('must always') || heading.includes('always')) {
        profile.rules.always = bullets;
      } else if (heading.includes('must never') || heading.includes('never')) {
        profile.rules.never = bullets;
      }
    }
  }

  // Parse skills
  const skillsDir = path.join(repoPath, 'skills');
  if (fs.existsSync(skillsDir)) {
    const dirs = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory());
    for (const dir of dirs) {
      const skillMd = path.join(skillsDir, dir.name, 'SKILL.md');
      if (!fs.existsSync(skillMd)) continue;

      const content = fs.readFileSync(skillMd, 'utf8');
      // Extract frontmatter description
      const descMatch = content.match(/description:\s*"?(.+?)"?\s*$/m);
      // Extract purpose section
      const purposeMatch = content.match(/## Purpose\n([\s\S]*?)(?=\n## |\n---|\n$)/);

      profile.skills.push({
        name: dir.name,
        description: descMatch ? descMatch[1].trim() : '',
        purpose: purposeMatch ? purposeMatch[1].trim() : '',
      });
    }
  }

  return profile;
}

// Ã¢ÂÂÃ¢ÂÂ Response Cache Builder Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

function buildResponseCache(profile) {
  const cache = [];

  // Agent identity queries
  cache.push({
    keywords: ['who', 'are', 'you', 'identity', 'introduce', 'about'],
    prompt_pattern: '(who are you|what are you|introduce|tell me about)',
    response: `I'm **${profile.name}** (v${profile.version}). ${profile.description}\n\n${profile.soul.identity}\n\nÃ¢ÂÂ Ã¯Â¸Â *Running in offline mode Ã¢ÂÂ responses are cached. Connect to ClawLess for full functionality.*`,
  });

  // Skills listing
  cache.push({
    keywords: ['skills', 'capabilities', 'can', 'do', 'help', 'what'],
    prompt_pattern: '(what can you do|skills|capabilities|help)',
    response:
      `Here are my skills:\n\n` +
      profile.skills.map((s) => `- **${s.name}**: ${s.description || s.purpose}`).join('\n') +
      `\n\nÃ¢ÂÂ Ã¯Â¸Â *Running in offline mode Ã¢ÂÂ skill execution requires ClawLess WebContainer.*`,
  });

  // Per-skill queries
  for (const skill of profile.skills) {
    const skillKeywords = skill.name.split('-').concat(skill.description.toLowerCase().split(/\s+/).slice(0, 5));
    cache.push({
      keywords: skillKeywords.filter((k) => k.length > 2),
      prompt_pattern: `(${skill.name}|${skillKeywords.slice(0, 3).join('|')})`,
      response:
        `## ${skill.name}\n\n${skill.description}\n\n${skill.purpose}\n\n` +
        `To use this skill, connect to the ClawLess runtime where I can execute it fully.` +
        `\n\nÃ¢ÂÂ Ã¯Â¸Â *Offline mode Ã¢ÂÂ showing cached skill information only.*`,
    });
  }

  // Rules query
  cache.push({
    keywords: ['rules', 'constraints', 'limitations', 'restrictions', 'never', 'always'],
    prompt_pattern: '(rules|constraints|limitations)',
    response:
      `## My Rules\n\n**Must Always:**\n` +
      profile.rules.always.map((r) => `- ${r}`).join('\n') +
      `\n\n**Must Never:**\n` +
      profile.rules.never.map((r) => `- ${r}`).join('\n') +
      `\n\nÃ¢ÂÂ Ã¯Â¸Â *Offline mode Ã¢ÂÂ showing agent rules from configuration.*`,
  });

  // Deployment / ClawLess queries
  cache.push({
    keywords: ['deploy', 'clawless', 'browser', 'webcontainer', 'run', 'start'],
    prompt_pattern: '(deploy|clawless|browser|webcontainer|how to run)',
    response:
      `To run this agent in the browser:\n\n` +
      `1. Open the ClawLess preview in a modern browser (Chrome 90+)\n` +
      `2. Enter your API key when prompted\n` +
      `3. Click "Run Agent"\n\n` +
      `The agent runs entirely in-browser via WebContainers Ã¢ÂÂ no server required.\n\n` +
      `Ã¢ÂÂ Ã¯Â¸Â *You're currently in offline mode. Reconnect for full functionality.*`,
  });

  return cache;
}

// Ã¢ÂÂÃ¢ÂÂ Offline Engine Generator Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

function generateOfflineEngine() {
  return `/**
 * offline-agent.js Ã¢ÂÂ Lightweight offline conversation engine
 * Auto-generated by clawless-deployer offline-fallback skill
 */

(function() {
  'use strict';

  let profile = null;
  let cache = [];

  /** Load agent profile and response cache */
  async function init() {
    try {
      const [profileRes, cacheRes] = await Promise.all([
        fetch('./agent-profile.json'),
        fetch('./response-cache.json'),
      ]);
      profile = await profileRes.json();
      cache = (await cacheRes.json()).cache || [];
      console.log('[offline-agent] Loaded: ' + profile.name + ' v' + profile.version);
      console.log('[offline-agent] Cache: ' + cache.length + ' responses indexed');
    } catch (e) {
      console.error('[offline-agent] Failed to load:', e);
    }
  }

  /** Simple TF-IDF-style keyword scoring */
  function scoreMatch(query, entry) {
    const queryWords = query.toLowerCase().split(/\\s+/).filter(w => w.length > 2);
    const keywords = entry.keywords.map(k => k.toLowerCase());
    let matches = 0;
    for (const word of queryWords) {
      for (const kw of keywords) {
        if (kw.includes(word) || word.includes(kw)) {
          matches++;
          break;
        }
      }
    }
    return queryWords.length > 0 ? matches / queryWords.length : 0;
  }

  /** Find best matching response */
  function findResponse(query) {
    let bestScore = 0;
    let bestResponse = null;

    for (const entry of cache) {
      const score = scoreMatch(query, entry);
      if (score > bestScore) {
        bestScore = score;
        bestResponse = entry.response;
      }
    }

    if (bestScore >= 0.4 && bestResponse) {
      return bestResponse;
    }

    // Fallback response
    const skillNames = profile ? profile.skills.map(s => s.name).join(', ') : 'unknown';
    return \`I'm running in **offline mode** and don't have a cached response for your query.

Based on my skills (\${skillNames}), I can help with topics related to those areas.

For full functionality, please connect to the ClawLess WebContainer runtime.

Ã¢ÂÂ Ã¯Â¸Â *This is an offline fallback response.*\`;
  }

  /** Log interaction to localStorage for later sync */
  function logInteraction(query, response) {
    try {
      const logs = JSON.parse(localStorage.getItem('clawless_offline_log') || '[]');
      logs.push({
        timestamp: new Date().toISOString(),
        query: query,
        responseType: 'cached',
        offline: true,
      });
      localStorage.setItem('clawless_offline_log', JSON.stringify(logs));
    } catch (e) {
      // localStorage may be unavailable
    }
  }

  // Public API
  window.OfflineAgent = {
    init: init,
    query: function(text) {
      const response = findResponse(text);
      logInteraction(text, response);
      return response;
    },
    getProfile: function() { return profile; },
    getCacheSize: function() { return cache.length; },
    getPendingLogs: function() {
      try {
        return JSON.parse(localStorage.getItem('clawless_offline_log') || '[]');
      } catch (e) { return []; }
    },
    clearPendingLogs: function() {
      localStorage.removeItem('clawless_offline_log');
    }
  };
})();
`;
}

// Ã¢ÂÂÃ¢ÂÂ Service Worker Generator Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

function generateServiceWorker() {
  return `/**
 * sw.js Ã¢ÂÂ Service Worker for offline fallback
 * Auto-generated by clawless-deployer offline-fallback skill
 */

const CACHE_NAME = 'clawless-offline-v1';
const ASSETS = [
  './',
  './offline.html',
  './offline-agent.js',
  './agent-profile.json',
  './response-cache.json',
];

// Install: cache offline assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[sw] Caching offline assets');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first, fallback to cache
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline: serve from cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // If requesting HTML, serve offline page
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./offline.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});
`;
}

// Ã¢ÂÂÃ¢ÂÂ Offline HTML Page Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

function generateOfflineHTML(agentName, agentVersion) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${agentName} Ã¢ÂÂ Offline Mode</title>
  <style>
    :root {
      --bg: #0a0a0f;
      --card: #1a1a2e;
      --accent: #6c63ff;
      --text: #e8e8f0;
      --muted: #8888a0;
      --border: #2a2a3e;
      --warn: #fbbf24;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      padding: 1rem 2rem;
      background: var(--card);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .offline-badge {
      background: var(--warn);
      color: #000;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    h1 {
      font-size: 1.1rem;
      background: linear-gradient(135deg, var(--accent), #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    #chat {
      flex: 1;
      padding: 1rem 2rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .msg { max-width: 80%; padding: 0.8rem 1rem; border-radius: 12px; line-height: 1.5; font-size: 0.9rem; }
    .msg.user { align-self: flex-end; background: var(--accent); }
    .msg.agent { align-self: flex-start; background: var(--card); border: 1px solid var(--border); }
    .msg.agent code { background: rgba(108,99,255,0.2); padding: 0.1rem 0.3rem; border-radius: 3px; }
    .msg.agent strong { color: var(--accent); }
    form {
      padding: 1rem 2rem;
      display: flex;
      gap: 0.5rem;
      border-top: 1px solid var(--border);
    }
    input {
      flex: 1;
      padding: 0.7rem 1rem;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 0.9rem;
    }
    input:focus { outline: none; border-color: var(--accent); }
    button {
      padding: 0.7rem 1.5rem;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
    }
    footer { padding: 0.5rem; text-align: center; font-size: 0.7rem; color: var(--muted); }
  </style>
</head>
<body>
  <header>
    <h1>${agentName}</h1>
    <span class="offline-badge">Ã¢ÂÂ¡ Offline</span>
  </header>
  <div id="chat"></div>
  <form id="form">
    <input id="input" placeholder="Ask something..." autocomplete="off" autofocus>
    <button type="submit">Send</button>
  </form>
  <footer>Offline fallback mode ÃÂ· v${agentVersion} ÃÂ· Interactions are queued for sync</footer>

  <script src="./offline-agent.js"></script>
  <script>
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js');
    }

    const chat = document.getElementById('chat');
    const form = document.getElementById('form');
    const input = document.getElementById('input');

    function addMsg(text, role) {
      const div = document.createElement('div');
      div.className = 'msg ' + role;
      // Basic markdown rendering for bold and code
      div.innerHTML = text
        .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\`(.+?)\`/g, '<code>$1</code>')
        .replace(/\\n/g, '<br>');
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
    }

    // Initialize
    OfflineAgent.init().then(() => {
      addMsg(OfflineAgent.query('who are you'), 'agent');
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      addMsg(q, 'user');
      input.value = '';
      setTimeout(() => {
        addMsg(OfflineAgent.query(q), 'agent');
      }, 300);
    });
  </script>
</body>
</html>`;
}

// Ã¢ÂÂÃ¢ÂÂ Main Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

function main() {
  const args = process.argv.slice(2);
  const repoPath = args.find((a) => !a.startsWith('--')) || '.';
  const outIdx = args.indexOf('--out');
  const outDir = outIdx !== -1 ? args[outIdx + 1] : path.join(repoPath, 'dist', 'offline-fallback');
  const maxSizeIdx = args.indexOf('--max-size');
  const maxSize = maxSizeIdx !== -1 ? parseInt(args[maxSizeIdx + 1], 10) : DEFAULT_MAX_SIZE;

  if (!fs.existsSync(repoPath)) {
    console.error(`Error: path "${repoPath}" does not exist`);
    process.exit(1);
  }

  const resolvedPath = path.resolve(repoPath);
  console.log(`Building offline fallback for ${resolvedPath}...`);

  // Step 1: Extract agent profile
  const profile = extractAgentProfile(resolvedPath);
  console.log(`  Agent: ${profile.name} v${profile.version}`);
  console.log(`  Skills: ${profile.skills.length}`);

  // Step 2: Build response cache
  const cache = buildResponseCache(profile);
  console.log(`  Cached responses: ${cache.length}`);

  // Create output directory
  fs.mkdirSync(outDir, { recursive: true });

  // Step 3-5: Generate and write files
  fs.writeFileSync(path.join(outDir, 'agent-profile.json'), JSON.stringify(profile, null, 2));
  fs.writeFileSync(path.join(outDir, 'response-cache.json'), JSON.stringify({ cache }, null, 2));
  fs.writeFileSync(path.join(outDir, 'offline-agent.js'), generateOfflineEngine());
  fs.writeFileSync(path.join(outDir, 'sw.js'), generateServiceWorker());
  fs.writeFileSync(
    path.join(outDir, 'offline.html'),
    generateOfflineHTML(profile.name, profile.version)
  );

  // Calculate sizes
  const files = ['agent-profile.json', 'response-cache.json', 'offline-agent.js', 'sw.js', 'offline.html'];
  let totalSize = 0;
  const fileSizes = files.map((f) => {
    const size = fs.statSync(path.join(outDir, f)).size;
    totalSize += size;
    return { name: f, size: (size / 1024).toFixed(1) + ' KB' };
  });

  console.log('');
  console.log('Ã¢ÂÂ Offline fallback bundle complete!');
  console.log('');
  console.log('Files generated:');
  for (const f of fileSizes) {
    console.log(`  ${outDir}/${f.name}  (${f.size})`);
  }
  console.log(`  Total: ${(totalSize / 1024).toFixed(1)} KB (limit: ${(maxSize / 1024 / 1024).toFixed(0)} MB)`);

  if (totalSize > maxSize) {
    console.log('');
    console.warn(`Ã¢ÂÂ Ã¯Â¸Â  Warning: bundle exceeds ${(maxSize / 1024 / 1024).toFixed(0)} MB limit`);
    process.exit(1);
  }
}

main();
