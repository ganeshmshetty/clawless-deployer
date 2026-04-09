---
name: offline-fallback
description: "Generate a static fallback bundle that runs the agent on cached/pre-computed responses when the WebContainer or network is unavailable. Trigger when a user needs their agent to work offline or in disconnected environments."
allowed-tools: Bash Read Write
metadata:
  author: clawless-deployer
  version: "1.0.0"
  category: resilience
  risk_tier: low
---

# Offline Fallback

## Purpose
Create a static fallback version of the agent that works without an active WebContainer or internet connection. Uses pre-cached responses, a local response cache, and a lightweight conversation engine to provide degraded-but-functional agent interaction.

## Inputs
- Path to the ClawLess-compatible agent repository
- Optional: recorded conversation logs to use as cached responses
- Optional: list of common prompts to pre-generate responses for
- Optional: max bundle size limit (default: 2MB)

## Procedure

### Step 1: Extract Agent Knowledge
1. Read `SOUL.md` to extract identity, communication style, and values.
2. Read `RULES.md` to extract hard constraints.
3. Read all `SKILL.md` files to extract skill descriptions and procedures.
4. Parse `agent.yaml` for agent metadata.
5. Compile into a structured agent profile JSON:
   ```json
   {
     "name": "agent-name",
     "soul": { "identity": "...", "style": "...", "values": [...] },
     "rules": { "always": [...], "never": [...] },
     "skills": [{ "name": "...", "description": "...", "procedure": "..." }]
   }
   ```

### Step 2: Build Response Cache
1. If conversation logs are provided:
   - Parse logs into prompt→response pairs.
   - Deduplicate and normalize prompts.
   - Index by keyword similarity for fuzzy matching.
2. If common prompts are provided:
   - Generate template responses following the agent's SOUL and RULES.
   - Include skill-specific responses for each skill's typical use case.
3. Build a keyword-indexed cache structure:
   ```json
   {
     "cache": [
       {
         "keywords": ["deploy", "clawless", "browser"],
         "prompt_pattern": "how do I deploy.*clawless",
         "response": "..."
       }
     ]
   }
   ```

### Step 3: Generate Offline Engine
1. Create a lightweight JavaScript module (`offline-agent.js`) that:
   - Loads the agent profile and response cache.
   - Implements keyword-based prompt matching against the cache.
   - Falls back to template responses based on the agent's SOUL.
   - Provides a simple conversational interface.
   - Clearly indicates to the user that it's running in offline/fallback mode.
2. The engine should:
   - Match incoming prompts against cached responses using TF-IDF-style keyword scoring.
   - Return the best-matching cached response if confidence > 0.6.
   - Otherwise, return a templated response: "I'm running in offline mode. Based on my skills in [X, Y, Z], I can help with [topics]. For full functionality, please connect to [ClawLess URL]."
   - Log all interactions to `localStorage` for sync when connectivity returns.

### Step 4: Build Service Worker
1. Generate a service worker (`sw.js`) that:
   - Caches the offline agent bundle on first load.
   - Intercepts `fetch` requests when offline and routes to the local engine.
   - Provides an offline indicator in the UI.
   - Queues outbound requests for replay when connectivity returns.
2. Register the service worker from the preview HTML.

### Step 5: Package Fallback Bundle
1. Create `dist/offline-fallback/`:
   - `offline-agent.js` — the lightweight conversation engine
   - `agent-profile.json` — compiled agent identity
   - `response-cache.json` — indexed cached responses
   - `sw.js` — service worker for offline support
   - `offline.html` — standalone offline UI
2. Measure total bundle size; warn if exceeding the limit.

## Output Format
```markdown
# Offline Fallback Bundle

## Files Generated
- `dist/offline-fallback/offline-agent.js` (X KB)
- `dist/offline-fallback/agent-profile.json` (X KB)
- `dist/offline-fallback/response-cache.json` (X KB)
- `dist/offline-fallback/sw.js` (X KB)
- `dist/offline-fallback/offline.html` (X KB)
- **Total: X KB** (limit: 2MB)

## Cached Responses: N prompts indexed
## Offline Capabilities
- [x] Agent identity and personality preserved
- [x] Skill descriptions available
- [x] Cached responses for common queries
- [ ] Live tool execution (requires WebContainer)
- [ ] API-powered responses (requires connectivity)

## How to Use
1. Include `sw.js` in your ClawLess preview HTML
2. The service worker auto-activates on first visit
3. When offline, the agent switches to fallback mode automatically
4. Interactions are queued and synced on reconnection
```

## Guardrails
- Never include API keys or secrets in the offline bundle.
- Offline responses must clearly state they are cached/approximate.
- Keep the total bundle under the specified size limit.
- The offline engine must not attempt network requests — fail gracefully.
- Preserve the agent's personality (SOUL.md) in all offline responses.
