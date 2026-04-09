---
name: webcontainer-optimizer
description: "Scan an agent repository for Node.js-incompatible dependencies and API calls, then rewrite them to browser-safe WebContainer alternatives. Trigger when a user wants to make an agent clawless-compatible."
allowed-tools: Bash Read Write
metadata:
  author: clawless-deployer
  version: "1.0.0"
  category: optimization
  risk_tier: medium
---

# WebContainer Optimizer

## Purpose
Strip Node.js-incompatible dependencies and rewrite tool calls to browser-safe APIs so that any gitagent can run inside a ClawLess WebContainer.

## Inputs
- Path to the agent repository (local or cloned)
- Optional: list of known-incompatible packages to force-replace

## Procedure

### Phase 1: Dependency Scan
1. Parse `package.json` (if present) and collect all `dependencies` and `devDependencies`.
2. Flag packages that use native bindings (`node-gyp`, `.node` files, C++ addons).
3. Flag packages that depend on system binaries (`python`, `gcc`, `make`).
4. Flag packages larger than 5MB uncompressed (WebContainer memory pressure).
5. Output a dependency compatibility report with severity: `BLOCK` (won't work), `WARN` (may work with caveats), `OK`.

### Phase 2: API Call Scan
1. Scan all `.js`, `.ts`, `.mjs`, `.cjs` files for:
   - `require('child_process')` or `import ... from 'child_process'`
   - `require('fs')` synchronous methods: `writeFileSync`, `readFileSync`, `mkdirSync`, `rmdirSync`, `unlinkSync`
   - `require('net')`, `require('dgram')` — raw socket access
   - `require('worker_threads')` — limited support in WebContainers
   - `process.exit()` — kills the WebContainer process
2. For each match, record file, line number, and surrounding context.

### Phase 3: Rewrite
1. Replace `child_process.exec(cmd)` → `webcontainerInstance.spawn(cmd.split(' ')[0], cmd.split(' ').slice(1))`
2. Replace `child_process.spawn(bin, args)` → `webcontainerInstance.spawn(bin, args)`
3. Replace `fs.writeFileSync(path, data)` → `await webcontainerInstance.fs.writeFile(path, data)`
4. Replace `fs.readFileSync(path, enc)` → `await webcontainerInstance.fs.readFile(path, enc)`
5. Replace `fs.mkdirSync(path, opts)` → `await webcontainerInstance.fs.mkdir(path, opts)`
6. Replace synchronous `require('fs')` patterns with async WebContainer `fs` equivalents.
7. Wrap any newly async calls in `async` functions if the parent function isn't already async.

### Phase 4: Dependency Replacement
For packages flagged as `BLOCK`, suggest or apply known replacements:
- `sharp` → `@napi-rs/image` (WASM build) or remove image processing
- `sqlite3` → `sql.js` (WASM-based SQLite)
- `bcrypt` → `bcryptjs` (pure JS)
- `canvas` → `@napi-rs/canvas` or remove
- `puppeteer` → remove (no browser-in-browser)
- Native `http` server → use WebContainer's built-in server support

## Output Format
```markdown
# Optimization Report

## Summary
- Files scanned: N
- Incompatible APIs found: N
- Dependencies blocked: N
- Auto-fixed: N
- Manual review needed: N

## Blocked Dependencies
| Package | Reason | Replacement |
|---------|--------|-------------|
| ...     | ...    | ...         |

## API Rewrites Applied
| File | Line | Original | Replacement |
|------|------|----------|-------------|
| ...  | ...  | ...      | ...         |

## Manual Review Required
- [ ] Item description and location
```

## Guardrails
- Never delete files; create `.clawless-backup/` copies before rewriting.
- If a rewrite changes function signatures (sync → async), flag all callers for review.
- Do not rewrite test files unless explicitly asked.
- Preserve all comments and docstrings in rewritten files.
