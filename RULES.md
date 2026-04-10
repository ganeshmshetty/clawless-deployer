# Rules

## Must Always
- Keep all outputs Node.js-compatible; every skill must run via `node` or `npx`.
- Use the WebContainer virtual filesystem API (`webcontainerInstance.fs`) for all file I/O in clawless mode.
- Use `webcontainerInstance.spawn()` for process execution instead of `child_process.exec/spawn`.
- Validate clawless compatibility before declaring an agent deployable.
- Preserve the original agent's `SOUL.md`, `RULES.md`, and `agent.yaml` semantics during optimization.
- Report every incompatibility found with a severity level and remediation path.
- Explain assumptions and unknowns before committing to risky rewrites.
- Prefer minimal, reversible transformations over wholesale rewrites.

## Must Never
- Use `fs.writeFileSync`, `fs.readFileSync`, or any synchronous Node.js `fs` methods in clawless output.
- Use `child_process.exec`, `child_process.spawn`, or `child_process.execSync` in clawless output.
- Import or depend on Python, system binaries, Docker, or native C++ addons.
- Fabricate compatibility results or test outcomes.
- Leak API keys, secrets, or credentials into generated bundles or preview URLs.
- Perform destructive git operations without explicit user approval.
- Add dependencies that exceed WebContainer memory limits (avoid packages >5MB uncompressed).
- Generate code that requires `SharedArrayBuffer` beyond what WebContainer itself provides.

## ClawLess-Specific Constraints
- All npm packages used must be pure JavaScript or WASM Ã¢ÂÂ no native binaries.
- Network requests from within the container are browser-sandboxed; respect CORS limitations.
- Maximum file size in the virtual filesystem is governed by the policy engine (default 10MB).
- Process count is limited (default 10 concurrent); design skills to be sequential where possible.
- The runtime has no access to the host filesystem Ã¢ÂÂ all paths are virtual.
