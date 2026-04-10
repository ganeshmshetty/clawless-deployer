# ⚡ clawless-deployer

> A gitagent built for the ClawLess browser runtime.

[![gitagent validate](https://img.shields.io/badge/gitagent-validated-brightgreen)](https://gitagent.sh)
[![ClawLess](https://img.shields.io/badge/runs%20on-ClawLess-6c63ff)](https://clawless.io)
[![WebContainers](https://img.shields.io/badge/powered%20by-WebContainers-0080ff)](https://webcontainers.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Zero servers. Zero Docker. Zero install. Run any gitagent in a browser tab.

---

## The Problem

ClawLess is the most accessible deployment path for gitagents — a full Node.js runtime running entirely in the browser via WebContainers. But it has constraints:

- **No `child_process`** — use `webcontainerInstance.spawn()` instead
- **No sync `fs` at runtime** — use `webcontainerInstance.fs.*` async APIs
- **No Python, no native binaries** — Node.js/npm only

No existing agent (or tooling) helps you bridge this gap. This agent does.

---

## What clawless-deployer Does

```
Any gitagent repo → clawless-deployer → Runs in your browser tab
```

Four skills, one pipeline:

| Skill | What it does |
|-------|-------------|
| **`bundle-analyzer`** | Scans every skill & tool — tells you exactly which are ClawLess-ready vs which need gitclaw |
| **`webcontainer-optimizer`** | Rewrites `child_process` → `webcontainerInstance.spawn()`, sync `fs` → async VFS APIs |
| **`live-preview-builder`** | Packages the agent into a self-contained `index.html` you can open in any browser |
| **`offline-fallback`** | Generates a service worker + cached response engine for disconnected environments |

---

## Quick Start

```bash
# Clone
git clone https://github.com/your-username/gitagent-hackathon
cd gitagent-hackathon

# No npm install needed — pure Node.js built-ins only

# 1. Scan any agent for ClawLess compatibility
node skills/bundle-analyzer/analyze.js /path/to/your-agent

# 2. Auto-fix incompatible APIs (with backups)
node skills/webcontainer-optimizer/optimize.js /path/to/your-agent

# 3. Build a browser preview
node skills/live-preview-builder/build-preview.js /path/to/your-agent

# 4. Generate offline fallback bundle
node skills/offline-fallback/build-fallback.js /path/to/your-agent

# Serve the preview (COOP/COEP headers required by WebContainer)
npx serve dist/clawless-preview --cors -l 3000
```

Or use npm scripts:

```bash
npm run analyze          # Scan this repo itself
npm run optimize         # Dry-run rewrite check
npm run preview          # Build browser preview
npm run offline          # Build offline bundle
npm run validate         # gitagent validate
npm run serve            # Serve the preview
```

---

## How Each Skill Works

### `bundle-analyzer`

Produces a compatibility matrix like this:

```
# ClawLess Compatibility Report
## Agent: my-agent v1.0.0
## Overall Verdict: NEEDS_WORK

| Skill           | Status         | Issues               | Fix Effort |
|-----------------|----------------|----------------------|------------|
| code-review     | ✅ COMPATIBLE  | none                 | none       |
| data-pipeline   | ⚠️ NEEDS_REWRITE | sync fs (3)         | medium     |
| ml-inference    | ❌ INCOMPATIBLE | requires Python      | n/a        |
```

**Usage:** `node skills/bundle-analyzer/analyze.js <repo> [--json]`

### `webcontainer-optimizer`

Detects and rewrites 9 incompatible API patterns:

| Before | After |
|--------|-------|
| `child_process.spawn(bin, args)` | `await webcontainerInstance.spawn(bin, args)` |
| `fs.writeFileSync(path, data)` | `await webcontainerInstance.fs.writeFile(path, data)` |
| `fs.readFileSync(path, enc)` | `await webcontainerInstance.fs.readFile(path, enc)` |
| `fs.mkdirSync(path, opts)` | `await webcontainerInstance.fs.mkdir(path, opts)` |

Also flags blocked packages with replacements: `sharp` → `@napi-rs/image`, `sqlite3` → `sql.js`, `bcrypt` → `bcryptjs`.

Creates `.clawless-backup/` before any rewrite — fully reversible.

**Usage:** `node skills/webcontainer-optimizer/optimize.js <repo> [--dry-run]`

### `live-preview-builder`

Packages the agent into:

```
dist/clawless-preview/
├── index.html        # Self-contained browser app (no bundler needed)
├── agent-bundle.js   # Agent repo as a WebContainer FileSystemTree
├── policy.yaml       # Restrictive security policy
└── README.md         # Serving instructions
```

The preview prompts for your API key at runtime — **never hardcodes credentials**.
Supports Anthropic, OpenAI, and Google providers.

**Usage:** `node skills/live-preview-builder/build-preview.js <repo> [--repo-url <github-url>]`

### `offline-fallback`

Generates a 3-layer resilience stack:

1. **`agent-profile.json`** — compiled identity from SOUL.md, RULES.md, skill descriptions
2. **`response-cache.json`** — keyword-indexed cache using TF-IDF-style scoring
3. **`sw.js`** — service worker that intercepts requests when offline and routes to cache
4. **`offline.html`** — minimal chat UI that works without WebContainer

Total bundle: ~21 KB (well under the 2 MB limit).

**Usage:** `node skills/offline-fallback/build-fallback.js <repo>`

---

## Why ClawLess

ClawLess is the most accessible deployment path for gitagents — no infrastructure, no signup, just a browser tab. This agent helps you actually get there by handling the WebContainer-specific constraints that trip up most agent code.

---

## 🛠 Known Issues & Workarounds (ClawLess Runtime)

**Terminal Key Doubling**: Some browsers may experience multiple character echoes in the `play.clawless.io` terminal.
- **Workaround**: Copy and **Paste** your prompts instead of typing them manually.
- **Pro Fix**: Run `npm run preview` and use the generated `index.html` via the 🌐 Preview button for a clean UI.

---

## Agent Identity

```yaml
name: clawless-deployer
version: 1.0.0
model:
  preferred: claude-sonnet-4-5-20250929
  fallback: [gpt-4o, gemini-2.0-flash]
skills:
  - webcontainer-optimizer
  - bundle-analyzer
  - live-preview-builder
  - offline-fallback
```

Full identity: [SOUL.md](SOUL.md) · Rules: [RULES.md](RULES.md)

---

## Validation

```bash
npx @open-gitagent/gitagent validate
# ✓ agent.yaml — valid
# ✓ SOUL.md — valid
# ✓ tools/clawless-offline.yaml — valid
# ✓ tools/clawless-optimize.yaml — valid
# ✓ tools/clawless-preview.yaml — valid
# ✓ tools/clawless-scan.yaml — valid
# ✓ skills/ — valid
# ✓ Validation passed (0 warnings)
```

---

## Built With

- [GitAgent Standard](https://gitagent.sh) — agent definition format
- [ClawLess](https://github.com/open-gitagent/clawless) — browser runtime
- [WebContainers API](https://webcontainers.io) — Node.js in the browser
- Pure Node.js built-ins — zero runtime dependencies

---

## License

MIT © 2026
