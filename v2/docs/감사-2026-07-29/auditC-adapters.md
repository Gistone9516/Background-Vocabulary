# Audit C — v1 design residue in adapter layers (http-app, local, aws, persistence, providers)

Scope read: 43/43 source files under the five assigned directories (dist/ build output and *.d.ts excluded as generated; the one non-obvious extra file, persistence/migrations/*.sql, was also read because a repository referenced a table name and I needed to confirm the table actually exists). Every file was read in full, not sampled. File list is in the Coverage section at the end.

Reference docs read in full before auditing: `v2/docs/코드규약.md`, `v2/docs/인터페이스계약-v2.md` (SoT v2.0).

Note on the task's path: the prompt said `v2/app/packages/providers/src`, but on disk `providers` is a subfolder of `adapters` (`v2/app/packages/adapters/providers/src`), not a sibling of `adapters`. I read the actual location. [fact-cited]

---

## Finding 1 (HIGH) — PUT /sessions/:id silently reverts soft-delete and pin state on every autosave

**Where:** `v2/app/packages/adapters/http-app/src/routes/crud-routes.ts:38-68`, cross-referenced with `v2/app/packages/adapters/persistence/src/repositories/session-repo.ts:69-96`.

**What [fact-cited]:** The PUT handler builds a brand-new `SessionRec` from the request body on every call and hardcodes some fields regardless of what body sent or what the DB currently holds:

```ts
// crud-routes.ts:38-61
app.put("/sessions/:id", async (c) => {
    ...
    const rec: SessionRec = {
      session_id: c.req.param("id"),
      user_id: userId,
      topic: (body.topic as string) ?? "",
      ...
      project_id: (body.project_id as string | null) ?? null,
      pinned: Boolean(body.pinned),
      deleted_at: null,
      created_at: (body.created_at as number) ?? now,
      updated_at: now,
    };
```
`deleted_at: null` (line 58) is unconditional — it is never read from the existing row, never read from the body (there is no `body.deleted_at` field at all in this SoT — DELETE/restore are separate endpoints). `pinned: Boolean(body.pinned)` (line 57) defaults to `false` whenever the body omits `pinned`. `created_at` (line 59) defaults to `now` whenever the body omits `created_at`.

The repo's upsert then blindly writes those values on conflict:
```ts
// session-repo.ts:76-82
ON CONFLICT (session_id) DO UPDATE SET
  topic=EXCLUDED.topic, area=EXCLUDED.area, domain_risk=EXCLUDED.domain_risk,
  job_type=EXCLUDED.job_type, gap_type=EXCLUDED.gap_type,
  user_condition=EXCLUDED.user_condition, context_object=EXCLUDED.context_object,
  narrow=EXCLUDED.narrow, generated=EXCLUDED.generated, primer=EXCLUDED.primer,
  project_id=EXCLUDED.project_id, pinned=EXCLUDED.pinned, deleted_at=EXCLUDED.deleted_at,
  updated_at=EXCLUDED.updated_at`,
```

**Why bad:** SoT §3-3 documents PUT /sessions/:id as "진행 스냅샷 upsert(매 턴 저장, 멱등)" — a routine, high-frequency, partial "save progress" call fired on every narrowing/generation turn. Soft-delete (`DELETE /sessions/:id` → sets `deleted_at`) and its 30-day restore-grace window (FR-703, `POST /sessions/:id/restore`) are a *separate*, deliberately gated write path. Pin toggling (`pinned`) is also implicitly a separate user action from "saving turn progress." But because PUT does a full-record replace instead of a read-merge-write, the very next autosave after a delete — from a stale tab, a queued retry, a background sync, or simply a user still mid-session in another window — silently resurrects a soft-deleted session with no restore action and no grace-period check at all. The same mechanism silently un-pins a pinned session the next time its owning narrowing/generation screen autosaves, if that screen's payload doesn't happen to carry `pinned: true` forward.

This is the same *shape* of defect the audit is hunting for even though it is not literally v1 legacy code: an invariant ("deleted sessions stay deleted until an explicit, grace-limited restore"; "pinned stays pinned until explicitly unpinned") lives only implicitly in the *absence* of a merge step, and a different, more frequently-executed code path (autosave) silently reverses it while passing every test that doesn't specifically interleave delete+autosave or pin+autosave. Per 코드규약 §8 ("막을 수 있으면 검사하지 않는다"), the fix is to make the bad state unrepresentable — PUT should not accept/write `deleted_at`/`pinned`/`created_at` at all (read-then-merge against the existing row, or split those fields into their own endpoints only), not to add a guard that checks "was this deleted?" before every autosave.

**Severity:** HIGH — a normal, expected sequence of user actions (delete a session, then have any other open client autosave onto the same session_id) produces silent, invisible data resurrection with no error and no log signal.

---

## Finding 2 (HIGH) — Client-supplied `tier` in the request body is trusted as a fallback, contradicting the SoT's own "never trust client tier" rule

**Where:** `v2/app/packages/adapters/http-app/src/routes/pipeline-routes.ts:12-17`.

**What [fact-cited]:**
```ts
// 게이팅이 해석한 tier(c.get)를 우선한다. 게이팅 미적용(mock 부트)이면 바디 폴백.
function tierOf(c: unknown, body: { tier?: unknown }): Tier {
  const t = (c as { get(k: string): unknown }).get("tier");
  if (t === "paid" || t === "free") return t;
  return body.tier === "paid" ? "paid" : "free";
}
```
This is used to decide the tier passed into `pipeline.recommendStream(...)` (line 46) and `pipeline.detail(...)` (line 52) — both of which gate quota (maxTotal/groupGen free-vs-paid limits, free detail-view cap).

**Why bad:** `v2/docs/인터페이스계약-v2.md` §4 states explicitly:
> `resolveTier(req): Bearer JWT 검증(HS256, exp) → claims.tier // networkless, x-tier류 헤더 완전 무시(C-21)`

i.e. tier must come *only* from a verified JWT; client-declared tier signals must be ignored completely (`완전 무시`). The only sanctioned override is `DEV_MODE && DEV_FORCE_TIER`, which is implemented separately and correctly in `core/src/auth/auth-service.ts:84` (gated behind an explicit env flag on the server, never client input). `tierOf()`'s body-fallback is a *second*, undocumented tier-authority path that the SoT does not mention and that has no ID/rationale/test per 코드규약 §6. It is reachable in production-shaped deployments too: any `AppDeps` built without `counters` (e.g. `buildLocalPgDeps` in `adapters/local/src/deps.ts:20-22`, which does inject `repos` — real persistence — but not `counters`) will skip `installGating` entirely (`app.ts:46 if (deps.counters) { ... installGating(...) }`), and every pipeline route falls back to trusting `body.tier` outright, with **no gating at all** (no 402 pro-check, no rate limit, no weekly cap) applied to that deployment shape.

**Severity:** HIGH — this is exactly category 8 from the brief ("quota or limit counting/authority duplicated between server and client... the server must be the single owner"), and it is a direct, quotable contradiction of a rule the SoT itself states in the same document this codebase claims to conform to.

**Fix sketch:** Remove the body fallback entirely; when `counters`/gating is not installed, `tierOf` should hard-default to `"free"` (matching the already-existing `resolveIdentity` default at `app.ts:53`), never read `body.tier`.

---

## Finding 3 (MEDIUM) — No global error-sanitization layer; uncaught exceptions leak the wrong response shape

**Where:** `v2/app/packages/adapters/http-app/src/app.ts` (entire file — `app.onError(...)` is never called), all of `routes/pipeline-routes.ts` (zero try/catch across 7 handlers), and most of `routes/crud-routes.ts` (only the one `session.upsert` call at line 62-67 has a catch; `get`, `list`, `delete`, `restore`, `keep`, `assets`, `projects`, `knowledge` handlers have none).

**What [fact-cited]:** Confirmed by reading the installed Hono package directly (`v2/app/node_modules/.pnpm/hono@4.12.31/node_modules/hono/dist/hono-base.js:10-17`):
```js
var errorHandler = (err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
};
```
Since `createApp` in `app.ts` never calls `.onError(...)`, this is the *only* handler for any exception thrown by `pipeline.classify/nextBranch/preview/relate/recommendStream/detail/summarize` (e.g. an LLM/network failure, a malformed-input crash inside core) or by most repo calls in crud-routes.ts. It returns **plain text**, not JSON.

**Why bad:** Every deliberately-coded error path in this codebase returns `c.json({ error: "CODE", message: "..." })`, and `ui-shared/src/api/errors.ts:3` documents this as a hard system-wide invariant: "서버 응답 본문은 { error: "CODE", message: "한국어 문구" } 형태다." SoT §8 additionally requires a "정화 계층" (sanitization layer) for *all* API errors so internal details never leak. In v2, that layer does not exist as a single mechanism — it is reconstructed ad hoc per-route (auth-routes.ts catches and reshapes; crud-routes.ts catches one specific case; pipeline-routes.ts catches nothing). The result: the most-used endpoints in the whole app (all 7 pipeline routes) will, on any unexpected internal error, silently break the JSON contract every other part of the codebase assumes. (The client-side `readJson`/`classifyResponse` in ui-shared happens to degrade gracefully for this specific case — see Finding 4 note — so this is not currently a hard crash, but it is exactly the kind of decision, "all API responses are shaped {error,message}", that lives only implicitly/partially in code rather than as one enforced mechanism, which 코드규약 §6-7 calls out by name.)

**Fix sketch:** Add `app.onError((err, c) => c.json({ error: "INTERNAL", message: "..." }, 500))` in `app.ts`'s `createApp`, once, so every route inherits uniform shape without each handler re-implementing it.

---

## Finding 4 (MEDIUM) — crud-routes.ts error responses omit the `message` field used everywhere else

**Where:** `v2/app/packages/adapters/http-app/src/routes/crud-routes.ts` — e.g. lines 18, 33, 35, 65, 74, 81, 110, 118, 124, 137, 139, 144 (`c.json({ error: "UNAUTHENTICATED" }, 401)`, `{ error: "NOT_FOUND" }, 404`, `{ error: "OWNERSHIP_CONFLICT" }, 409`, `{ error: "NOT_RESTORABLE" }, 404`, etc. — none of them carry a `message` key).

**What [fact-cited]:** Compare with `middleware/gating.ts:46-48` and `routes/auth-routes.ts:18,25,33,35,50,52`, which *always* pair `error` with a human-readable `message`. crud-routes.ts never does.

**Why bad:** Same documented invariant as Finding 3 (`{error, message}` shape, `ui-shared/src/api/errors.ts:3`). This is a smaller-blast-radius instance of the same non-uniformity: it is currently masked because `ui-shared`'s `say()` helper (`errors.ts:20-22`) falls back to a hardcoded default message when `message` is absent, so nothing crashes today — but the CRUD routes are not yet wired into any ui-shared screen per the current C3 stage, so this gap has not been exercised end-to-end. It is worth fixing before CRUD screens (sessions list/detail, projects, keep) are built on top of it, so the contract is actually uniform rather than accidentally-tolerated.

**Severity:** MEDIUM (lower than Finding 3 because a client-side fallback already absorbs it, but it is a real, easily-fixed shape gap in the layer this audit was asked to check).

---

## Finding 5 (LOW) — RESTORE_GRACE_MS bypasses the "externalized limits" pattern every other operational constant follows

**Where:** `v2/app/packages/adapters/http-app/src/routes/crud-routes.ts:10`:
```ts
const RESTORE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
```

**Why bad [fact-cited + inference]:** `shared/src/types/limits.ts:1` states the explicit design principle for every other operational number in the system: "운영 한도 타입. 코드 기본값(DEFAULT_LIMITS)을 두되 어댑터가 env로 전부 덮어쓸 수 있다" (NFR-504, "운영 한도 외부화"). `freeWeeklyLimit`, `detailLimitFree`, `narrowMax`, `maxTotal`, `groupGen`, `ratePerMin/Day`, `globalDailyCap`, `maxContextChars` all live in `Limits`/`DEFAULT_LIMITS` and are overridable per-deployment. The 30-day restore grace window is operationally the same kind of value (a tunable business policy number) but is hardcoded as a route-local `const` with no env override path and no entry in `Limits`. This is not a duplication-drift bug today (there is exactly one definition), but it is an un-flagged exception to an explicitly-stated architectural rule, with no ID/source/rationale/test per 코드규약 §6 — i.e. exactly the "decision that lives only implicitly in code" pattern the anti-patchwork rules warn about, just not yet triggered by a second copy.

**Severity:** LOW — no drift/bug yet, but structurally inconsistent with the rest of the codebase's own stated pattern.

---

## Finding 6 (LOW / informational) — NFR-305 `clientCheck` (Origin allowlist / client auth token) is absent from gating

**Where:** `v2/app/packages/adapters/http-app/src/middleware/gating.ts` — no Origin check, no client-auth-token check anywhere in the file (confirmed via full read + grep across `adapters/` for `Origin|clientCheck|Client-Token`: no matches).

**What [fact-cited]:** SoT §4 lists `clientCheck: 프로덕션에서 웹=Origin 화이트리스트, 데스크톱=클라이언트 인증 토큰(방식은 C4 스펙 확정) — NFR-305` as one of the "전 엔드포인트 공통 미들웨어" (common middleware for *all* endpoints), alongside `riskKeywordGate` and `globalDailyCap/ipRateLimit`, both of which *are* implemented in `gating.ts`. `clientCheck` is not.

**Assessment [inference]:** The desktop half is explicitly marked "방식은 C4 스펙 확정" (method to be decided in the C4 cycle), so its absence now is expected. The web-Origin-allowlist half carries no such explicit deferral marker in the SoT text, so its absence is more likely a genuine gap than planned future work — but I cannot be fully certain this wasn't intentionally folded into a later cycle's scope, since the roadmap table (§9) doesn't itemize it under any single cycle by name. Flagging as low-confidence/informational rather than a hard defect for that reason.

---

## Corroborating evidence (not a new finding — supports the already-confirmed /summarize → PrimerDoc bug)

**Where:** `v2/app/packages/adapters/local/src/mocks/mock-llm.ts:56-66`.

**What [fact-cited]:**
```ts
const SUMMARIZE: Prompt4Out = {
  area: "PID 제어",
  task_intent: "PID 제어의 배경 개념을 이해하려 한다",
  context_sentence: "출력 포화 상황에서 적분 제어의 거동을 배경지식으로 정리한다.",
  vocab: [ ... ],
  paste_text: "...",
};
```
and the fixture-picker at line 82: `if (sys.includes('"paste_text"')) return SUMMARIZE;`

This is the mock/local-layer footprint of the already-known defect (SoT says `/summarize` output was revised to `PrimerDoc`, code still emits v1's `Prompt4Out` shape). It doesn't add a new bug, but it does show the residue is not confined to `core`/`shared` — the adapter-layer test fixture was never updated either, so any local-layer smoke test exercising `/summarize` is currently validating the wrong (v1) shape and would give false confidence that the endpoint is correct.

---

## Clean categories (checked, nothing found)

- **Cloudflare Workers-only idioms** (KV/D1/Durable Objects, `waitUntil`, edge-only globals, `caches.default`): grepped across all of `adapters/` — zero matches. The `aws/` and `local/` boot layers use only `@aws-sdk/client-rds-data`, `@aws-sdk/client-secrets-manager`, `hono/aws-lambda`, `@hono/node-server`, `pg`, and plain `fetch` — all appropriate for their respective runtimes, no Workers-era leftovers. [fact-cited]
- **Fixed narrow-viewport / Chrome-extension-only assumptions surviving into server/boot code**: grepped for `chrome.`, `extension`, `sidePanel`, viewport-width constants — zero matches in adapters. [fact-cited]
- **Stale mutable "latest state" ref read to compensate for async ordering**: none found in any of the 43 adapter files. (Also worth noting: `ui-shared/src/screens/terms/machine.ts:1-2` carries a comment explicitly documenting that this exact anti-pattern *was* present in v1's stream-callback cap check and has already been redesigned into a pure reducer in v2 — this is outside my assigned scope but corroborates that this category has already received attention elsewhere in the codebase, and I found no adapter-layer equivalent of it.) [fact-cited]
- **Two independent server-side counters for one quantity** (the canonical double-counter bug): `CounterStore` is a single port with one implementation swapped per layer (`InMemoryCounterStore` / `UpstashCounterStore`), and both the gating middleware and `GET /usage` read the *same* key (`weeklyKey(...)`) rather than maintaining separate tallies. No duplication found. (The `tierOf()` client-vs-server *authority* issue in Finding 2 is a related but distinct problem — not two server counters, but a client-supplied value being trusted as if it were the server's own count.) [fact-cited]
- **DB schema vs. SoT §6 drift**: `persistence/migrations/0001_init.sql` + `0002_auth.sql` were cross-checked against SoT §6 and match column-for-column, including the `revoked_jtis` table referenced by `jti-blacklist.ts` (I initially suspected this table might be missing since it isn't in `0001_init.sql`; it exists in `0002_auth.sql`). No drift found. [fact-cited]

---

## Coverage

Files read in full (43/43 in-scope source files):

- `adapters/aws/src/`: data-api-runner.ts, deps.ts, handler.ts, index.ts, secrets.ts
- `adapters/http-app/src/`: app.ts, index.ts, middleware/auth.ts, middleware/gating.ts, routes/auth-routes.ts, routes/crud-routes.ts, routes/pipeline-routes.ts, sse-response.ts
- `adapters/local/src/`: boot.ts, deps.ts, index.ts, pg-runner.ts, real-deps.ts, mocks/index.ts, mocks/mem-cache.ts, mocks/mem-counter.ts, mocks/mock-google.ts, mocks/mock-llm.ts, mocks/mock-search.ts
- `adapters/persistence/src/`: cursor.ts, index.ts, json.ts, migrate.ts, repositories/index.ts, repositories/session-repo.ts, repositories/asset-repo.ts, repositories/knowledge-repo.ts, repositories/project-repo.ts, repositories/user-repo.ts, repositories/jti-blacklist.ts
- `adapters/providers/src/` (task said `packages/providers/src`; actual path is `adapters/providers/src` — see note above): index.ts, google-oauth.ts, tavily.ts, upstash-cache.ts, upstash-counter.ts, deepseek/client.ts, deepseek/index.ts, deepseek/sse-parser.ts
- Also read for grounding (not in the original file list, read because a finding required it): `adapters/persistence/migrations/0001_init.sql`, `adapters/persistence/migrations/0002_auth.sql`, `node_modules/.pnpm/hono@4.12.31/node_modules/hono/dist/hono-base.js` (to verify Hono's actual default error-handler behavior rather than assume it), `shared/src/types/limits.ts`, `shared/src/ports/auth-ports.ts`, `core/src/auth/auth-service.ts:84` (single line, to confirm `devForceTier` is consumed, not inert), `ui-shared/src/api/errors.ts`, `ui-shared/src/api/http-client.ts` (partial, to confirm client-side handling of Finding 3/4's degraded-shape responses), `ui-shared/src/screens/terms/machine.ts` (partial, corroborating evidence only).

Not read (out of assigned scope, flagged only where a cross-reference was unavoidable): `core/`, `shared/` (beyond the specific type/port files above), `ui-shared/` screens beyond the two spot-checks noted, `web/`, `desktop/` (does not exist yet on disk), `landing/`.

`dist/*.js` and `*.d.ts` build output were not read (generated artifacts, not source of truth).
