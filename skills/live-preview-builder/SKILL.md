---
name: live-preview-builder
description: "Build a shareable ClawLess URL that launches an instant browser-based demo of a gitagent. Trigger when a user wants to create a live preview or demo link for their agent."
allowed-tools: Bash Read Write
metadata:
  author: clawless-deployer
  version: "1.0.0"
  category: deployment
  risk_tier: medium
---

# Live Preview Builder

## Purpose
Generate a self-contained, shareable ClawLess deployment package that lets anyone run the agent in their browser with a single click Ã¢ÂÂ no install, no backend, no configuration.

## Inputs
- Path to a ClawLess-compatible agent repository (run `bundle-analyzer` first if unsure)
- Target AI provider config: which API key env vars to prompt for
- Optional: custom ClawLess policy YAML to embed
- Optional: GitHub repo URL (for clone-based preview)

## Procedure

### Step 1: Validate Compatibility
1. Run a quick compatibility check (subset of `bundle-analyzer`).
2. If any skill is `INCOMPATIBLE`, abort with a clear error and remediation steps.
3. If any skill `NEEDS_REWRITE`, warn but continue (the preview may partially work).

### Step 2: Build FileSystemTree
1. Walk the agent repository and build a WebContainer-compatible `FileSystemTree` object.
2. Structure:
   ```javascript
   const files = {
     'agent.yaml': { file: { contents: '...' } },
     'SOUL.md': { file: { contents: '...' } },
     'RULES.md': { file: { contents: '...' } },
     'skills': {
       directory: {
         'skill-name': {
           directory: {
             'SKILL.md': { file: { contents: '...' } },
             // ... implementation files
           }
         }
       }
     },
     'package.json': { file: { contents: '...' } }
   };
   ```
3. Exclude `.git/`, `node_modules/`, `.env`, and any files matching `.gitignore`.
4. Encode binary files as base64 Uint8Array contents.

### Step 3: Generate Preview HTML
1. Create a self-contained `index.html` that:
   - Imports `clawcontainer` from a CDN or bundles it inline.
   - Mounts the `FileSystemTree` into the WebContainer.
   - Provides a minimal UI with:
     - API key input field (prompted on first load, stored in `localStorage`).
     - Terminal output panel (xterm.js).
     - Agent status indicator.
     - A "Run Agent" button.
   - Embeds the correct COOP/COEP headers via a service worker or meta tags.
2. Sets up the `ClawContainer` with the agent template:
   ```javascript
   const cc = new ClawContainer('#app', {
     template: 'gitclaw',
     env: { ANTHROPIC_API_KEY: userKey },
     workspace: agentFiles
   });
   await cc.start();
   ```

### Step 4: Generate ClawLess Policy
1. Create a restrictive-by-default policy for the preview:
   ```yaml
   version: "1"
   mode: deny-all
   files:
     read:
       - pattern: "**"
         allow: true
     write:
       - pattern: "workspace/**"
         allow: true
   processes:
     - pattern: "node *"
       allow: true
     - pattern: "npm *"
       allow: true
   ports:
     - port: 3000
       allow: true
   limits:
     maxFileSize: 10485760
     maxProcesses: 5
     maxTurns: 30
     timeoutSec: 180
   ```

### Step 5: Output Deployment Package
1. Write the preview files to `dist/clawless-preview/`:
   - `index.html` Ã¢ÂÂ the self-contained preview page
   - `agent-bundle.js` Ã¢ÂÂ the FileSystemTree as a JS module
   - `policy.yaml` Ã¢ÂÂ the embedded policy
   - `README.md` Ã¢ÂÂ instructions for serving locally or deploying
2. If a GitHub URL is provided, generate a `play.clawless.io` compatible URL:
   ```
   https://play.clawless.io/?repo=https://github.com/{owner}/{repo}
   ```

## Output Format
```markdown
# Preview Build Complete

## Files Generated
- `dist/clawless-preview/index.html` Ã¢ÂÂ Open in browser to run
- `dist/clawless-preview/agent-bundle.js` Ã¢ÂÂ Agent filesystem tree
- `dist/clawless-preview/policy.yaml` Ã¢ÂÂ Security policy

## How to Run
1. Serve with COOP/COEP headers:
   ```bash
   npx serve dist/clawless-preview --cors -l 3000
   ```
2. Open http://localhost:3000
3. Enter your API key when prompted
4. Click "Run Agent"

## Live URL (if GitHub repo provided)
{url}

## Requirements
- Modern browser (Chrome 90+, Firefox 89+, Edge 91+)
- Active internet connection for npm package installation
- API key for the configured AI provider
```

## Guardrails
- Never embed API keys in the generated HTML or bundle Ã¢ÂÂ always prompt at runtime.
- Validate that COOP/COEP headers are set (required for `SharedArrayBuffer`).
- Keep the generated HTML under 500KB (excluding the agent bundle).
- Test that the FileSystemTree mounts correctly before declaring success.
