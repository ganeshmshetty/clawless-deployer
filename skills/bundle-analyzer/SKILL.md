---
name: bundle-analyzer
description: "Analyze a gitagent repository and produce a detailed compatibility report showing which skills work in ClawLess (browser) vs which require a full Node.js server runtime like gitclaw. Trigger when a user wants to check if their agent is clawless-ready."
allowed-tools: Bash Read
metadata:
  author: clawless-deployer
  version: "1.0.0"
  category: analysis
  risk_tier: low
---

# Bundle Analyzer

## Purpose
Report which skills in a gitagent repository are ClawLess-compatible and which require a server-side Node.js runtime (gitclaw). Produces an actionable compatibility matrix.

## Inputs
- Path to the agent repository
- Optional: target ClawLess policy YAML (to check against resource limits)

## Procedure

### Step 1: Parse Agent Structure
1. Read `agent.yaml` to extract listed skills, tools, and model preferences.
2. Enumerate all directories in `skills/` and verify each has a `SKILL.md`.
3. Enumerate all files in `tools/` and parse tool schemas.
4. Check for `workflows/`, `hooks/`, `knowledge/`, `memory/` directories.

### Step 2: Per-Skill Compatibility Check
For each skill directory:
1. Read `SKILL.md` frontmatter for `allowed-tools`.
2. Scan all implementation files (`.js`, `.ts`, `.sh`, `.py`) for:
   - **Language check**: `.py` files Ã¢ÂÂ `INCOMPATIBLE` (no Python in WebContainer)
   - **Shell scripts**: `.sh` files Ã¢ÂÂ `WARN` (may work if only using Node-available commands)
   - **Binary dependencies**: any `require()` of native modules Ã¢ÂÂ `INCOMPATIBLE`
   - **Sync I/O**: synchronous `fs` calls Ã¢ÂÂ `NEEDS_REWRITE`
   - **Process spawning**: `child_process` usage Ã¢ÂÂ `NEEDS_REWRITE`
   - **Network**: raw `net`/`dgram` sockets Ã¢ÂÂ `INCOMPATIBLE`
3. Calculate compatibility score: `COMPATIBLE` (100%), `NEEDS_REWRITE` (fixable), `INCOMPATIBLE` (requires gitclaw).

### Step 3: Tool Compatibility Check
For each tool YAML:
1. Check if the tool references external binaries or services.
2. Verify MCP-compatible schema structure.
3. Flag tools that require filesystem paths outside the virtual root.

### Step 4: Resource Budget Estimation
1. Sum all `node_modules` dependencies across skills.
2. Estimate total virtual filesystem size.
3. Compare against ClawLess policy limits:
   - `maxFileSize`: default 10MB per file
   - `maxProcesses`: default 10 concurrent
   - `maxTurns`: default 50
   - `timeoutSec`: default 120

### Step 5: Generate Report

## Output Format
```markdown
# ClawLess Compatibility Report

## Agent: {name} v{version}

## Overall Verdict: READY | NEEDS_WORK | INCOMPATIBLE

## Skill Matrix
| Skill | Status | Issues | Fix Effort |
|-------|--------|--------|------------|
| ...   | Ã¢ÂÂ/Ã¢ÂÂ Ã¯Â¸Â/Ã¢ÂÂ | ...  | low/med/high |

## Tool Matrix
| Tool | Status | Issues |
|------|--------|--------|
| ...  | Ã¢ÂÂ/Ã¢ÂÂ  | ...    |

## Resource Budget
| Resource | Used | Limit | Status |
|----------|------|-------|--------|
| Total size | X MB | 10 MB | Ã¢ÂÂ/Ã¢ÂÂ Ã¯Â¸Â |
| Dependencies | N | Ã¢ÂÂ | Ã¢ÂÂ/Ã¢ÂÂ Ã¯Â¸Â |
| Processes needed | N | 10 | Ã¢ÂÂ/Ã¢ÂÂ Ã¯Â¸Â |

## Migration Path
1. Step-by-step instructions to reach READY status
2. Estimated effort per step

## Recommendation
- Deploy to: ClawLess | gitclaw | hybrid
- Reason: ...
```

## Guardrails
- This skill is read-only Ã¢ÂÂ it never modifies any files.
- Report all findings even if the overall verdict is COMPATIBLE.
- For hybrid agents (some skills work, some don't), recommend skill-level split.
