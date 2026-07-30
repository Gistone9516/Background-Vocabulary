# Audit A — SoT vs Code Contract Drift (배경노트 v2)

Scope read COMPLETELY (all files, every line):
- `v2/docs/코드규약.md` (89 lines)
- `v2/docs/인터페이스계약-v2.md` (287 lines, SoT v2.0)
- `v2/app/packages/shared/src/**` — all 15 files (types/*, ports/*, pipeline-contract.ts, sse.ts, utils.ts, fixtures.ts, index.ts)
- `v2/app/packages/core/src/**` — all 18 files (pipeline.ts, gating/*, locale/*, prompts/*, rag/*, auth/*)
- `v2/app/packages/adapters/http-app/src/**` — all 8 files (app.ts, index.ts, sse-response.ts, routes/*, middleware/*)

Also read for context (not in the original assignment, but necessary to tell a real drift
from a documented, in-progress phase gap): `v2/docs/specs/C2.1-영속계층.md`,
`C2.2-인증.md`, `C2.3-게이팅.md`, and grepped `C3-S3-난이도와어휘생성.md`. These are the
buildflow-derived specs that sit between the SoT and the code; several apparent gaps turn
out to be tracked deferrals recorded there, and I did not re-report those. Where a gap is
NOT mentioned in any of these derived specs, I treat that silence as evidence it is a real,
untracked drift (per 코드규약 §6: a decision with no ID/source/rationale is itself a defect).

All findings below are [fact-cited] — file:line quoted verbatim, verified by direct Read/Grep.

---

## 1. Comparison table — every [개정]/[신규]/[검토 정정] tagged SoT item vs code

| SoT location | Promise | Code reality | Verdict |
|---|---|---|---|
| §0-1 L13 port list (검토 정정, "목록이 완전하다") | Port named `UsageCounter` | `shared/src/ports/gating-ports.ts:5` defines `CounterStore` (hit/get), not `UsageCounter`. C2.3 spec §1-1 documents the v1→v2 consolidation (UpstashCounter+UsageCounter+GlobalDailyCap → one `CounterStore`) but SoT §0-1's own port list was never updated to match. | **DRIFT (naming, low)** |
| §1 L39 /summarize `[개정]` | "구조화 출력으로 개정" | `Prompt4Out` (shared/src/types/pipeline-io.ts:114-122) still has v1's `paste_text` shape; `core/src/prompts/summarize.ts` builds `paste_text` prose, not `PrimerDoc`. | **KNOWN — already confirmed by requester, not re-reported.** Context found: `specs/C2.1-영속계층.md:11` explicitly defers "`/summarize` 출력=PrimerDoc [개정] 엔드포인트 개편도 C5" — so this is a *tracked* deferral, not a silent one, contrary to how the task brief frames it. Worth relaying to requester as a correction: it is not orphaned, it is scheduled for C5. |
| §3-1 L113 same as above | same | same | (see above) |
| §3-1 L116 `GET /map` `[신규 FR-312]` | MindMap endpoint | Not present in http-app routes; `MindMap` type not in shared/src/types/persistence.ts (comment there says "C5에서 추가한다"). | **MATCH (deferred, tracked to C5 — SoT §9 cycle table + C2.1 spec agree)** |
| §3-1 L114 `POST /refine-primer` `[신규 FR-607]` | RefinePrimerIn/Out endpoint | Not present in shared types or http-app routes. | **MATCH (deferred to C5, tracked)** — but see Finding 4 below re: gating.ts already wiring a path for it. |
| §3-3 (whole section) `[신규]` | Session/Asset/Project/Knowledge CRUD, ownership 409, soft-delete/restore, dedup | `adapters/http-app/src/routes/crud-routes.ts` implements sessions/assets/projects/knowledge CRUD; `OwnershipError`→409 mapped (crud-routes.ts:62-67); restore 404-after-grace (crud-routes.ts:77-82). | **MATCH** for what's implemented in these packages (repo-internals like the actual FK/409 raising, and FR-706 dedup at `/recommend`, live in adapters/persistence — out of this task's assigned directories, not audited here). |
| §3-3 L150 `POST /sessions/:id/restore` `[검토 정정]` | Grace-window undo | `crud-routes.ts:77-82`, `RESTORE_GRACE_MS = 30 * 24 * 60 * 60 * 1000` (line 10) | **MATCH** |
| §3-3 L151 `GET /usage` `[검토 정정]` | "잔여 사용량(**주간 탐색 잔여 · detail 잔여**)" — two quantities | `middleware/gating.ts:101-115` GET /usage handler returns only `{ tier, anonymous, weeklyRemaining }`. No `detail` remaining field anywhere in the response, even though the exact counter it would need (`detail:${uid}:${sid}`) already exists and is hit at `gating.ts:94`. | **DRIFT — see Finding 2** |
| §3-3 L157 소유권 규칙 `[검토 정정]` | 409 on cross-user PUT; **anon→login promotion: server issues a NEW session_id, old client id kept only as `client_ref`** | `crud-routes.ts:38-68` PUT /sessions/:id: takes `session_id` verbatim from the URL param, upserts, and only throws on ownership conflict. No `client_ref` field exists on `SessionRec` (persistence.ts:28-46), and no distinct "claim/promote" route or re-issuance logic exists anywhere in http-app. `specs/C2.1-영속계층.md:28` restates the same promise (server issues a new id) but the promotion mechanism itself is not implemented in the routes read. | **DRIFT / gap — see Finding 3** |
| §3-3 L159 FR-706 dedup `[검토 정정]` | Server merges project asset `term_norm`s into `/recommend` exclude | `AssetRepository.termNormsByProject` port exists (persistence-ports.ts:47) but `core/src/pipeline.ts`'s `recommendStream` never calls it — `RecommendInput.exclude` is only ever populated from the client-supplied `exclude?: string[]` (pipeline-contract.ts:43). No wiring from a repo call into `recommendStream`'s exclude set anywhere in core or http-app. | **Likely DRIFT, but this wiring point (session→project_id→repo lookup) sits at the http-app/route or a not-yet-created service layer, not obviously inside `core/pipeline.ts`'s pure signature. Flagging as inference — needs confirmation this isn't deferred/wired in an adapter package outside this task's scope.** |
| §4 gating pseudocode (검토 정정: "개별 게이트 아님") | globalDailyCap+ipRateLimit apply uniformly to **all** cost endpoints incl. `/preview` | `middleware/gating.ts:26,39-54` `COST_PATHS` includes `/preview` and applies the same IP-min/IP-day/global-cap loop to it. | **MATCH with §4** — but this directly **contradicts §1's own table** which tags `/preview` "IP리밋만(경량)" (IP-only, explicitly lighter than the others). This is an SoT self-inconsistency (§1 vs §4), not strictly a code bug, since code follows §4 (the later "검토 정정" pass). Flagging so SoT can be reconciled — see Finding 5. |
| §4 "DEV_MODE && DEV_FORCE_TIER → override(로컬 전용)" | resolveTier: dev override → JWT → free | `core/src/auth/auth-service.ts:83-90` implements this exactly (`if (config.devForceTier) return config.devForceTier; ...`). But the **actual gating call path** (`adapters/http-app/src/app.ts:47-54`) never calls `authService.resolveTier()` — it reimplements tier resolution inline via `verifyAccessToken` only, silently dropping the dev-override branch. | **DRIFT — see Finding 1 (highest severity)** |
| §5 "이벤트 = `term`·`meta`(terms_rationale 등)·`done`·`error`" | 4 SSE event kinds | `shared/src/types/pipeline-io.ts:50-53` `StreamEvent` union has only 3 variants: `term`, `done`, `error`. No `meta` variant, no `terms_rationale` field anywhere (grep across all packages and all spec docs: 0 hits). | **DRIFT — see Finding 6 (highest severity)** |
| §5 "aws 계층 취소 제약" `[검토 정정]` | local=즉시 중단, aws=보완 메커니즘(C2 spec) | `sse-response.ts:1-4` comment explicitly states this exact distinction and defers the aws-side mechanism to C2. `pipeline.ts` recommendStream honors the `signal` for cancellation. | **MATCH (aws補완 still open per SoT §10 open-items list, tracked, not silent)** |
| §8 "프롬프트 빌더 본문은 core에만" `[신규 NFR-311]` | Prompt bodies only in core, shared has signatures only | `shared/src/pipeline-contract.ts` has no prompt string literals; `core/src/prompts/*.ts` holds all builder bodies; `core/src/prompts/index.ts` is the only export point. | **MATCH** |
| §2-3 PrimerDoc `[검토 정정]` "서버 정본은 SessionRec.primer" | `SessionRec.primer: PrimerDoc \| null` | `persistence.ts:40` `primer: PrimerDoc | null;` matches exactly, including the same inline comment. | **MATCH** |
| §2-3 AssetTerm.term_norm `[검토 정정]` | Normalized key, MindMap node id = user-scoped term_norm | `persistence.ts:54` matches field-for-field. (MindMap itself is C5, not yet present — consistent, tracked.) | **MATCH (for the part in scope now)** |
| §2-3 deleted_at `[검토 정정]` | Soft delete, default-excluded from lists, restorable within grace | `persistence.ts:43`, `crud-routes.ts` DELETE/soft-delete + restore routes match. | **MATCH** |

---

## 2. Findings (actionable, ranked by severity)

### Finding 1 — HIGH: DEV_FORCE_TIER override is dead code; two independent tier-resolution implementations that silently disagree

- **SoT promise** (`인터페이스계약-v2.md` §4, L167-168): `resolveTier(req): Bearer JWT 검증(HS256, exp) → claims.tier ... DEV_MODE && DEV_FORCE_TIER → override(로컬 전용)`.
- **Also promised** in `specs/C2.2-인증.md:37`: "resolveTier(networkless): DEV_MODE+DEV_FORCE_TIER override → Bearer verifyAccess → claims.tier, 없으면 free."
- **Correctly implemented once**, in `core/src/auth/auth-service.ts:83-90`:
  ```
  async resolveTier(bearerToken) {
    if (config.devForceTier) return config.devForceTier;
    if (!bearerToken) return "free";
    const list = secrets();
    if (list.length === 0) return "free";
    const claims = await verifyAccess(bearerToken, list);
    return claims ? claims.tier : "free";
  },
  ```
- **But never called.** `grep -n "resolveTier" v2/app/packages` returns exactly two lines — the interface declaration (`auth-service.ts:37`) and this implementation (`auth-service.ts:83`). Nothing in `adapters/http-app` calls `authService.resolveTier(...)` anywhere.
- The actual tier resolution used by every gated route is a **second, independent implementation** inlined in `adapters/http-app/src/app.ts:47-54`:
  ```
  const resolveIdentity = authService
    ? async (b: string | null): Promise<{ tier: Tier; userId: string | null }> => {
        const claims = b ? await authService.verifyAccessToken(b) : null;
        return claims ? { tier: claims.tier, userId: claims.sub } : { tier: "free", userId: null };
      }
    : async (): Promise<{ tier: Tier; userId: string | null }> => ({ tier: "free", userId: null });
  ```
  This never reads `config.devForceTier` at all — it went straight to `verifyAccessToken` and hand-rolled the `{tier, userId}` shape (which `resolveTier` alone can't produce, since it only returns `Tier`, not `userId` — likely why a second implementation was written instead of extending the first).
- **Consequence**: the SoT/C2.2-documented local-dev tier override (`DEV_FORCE_TIER=paid` to test paid-tier behavior without a real login) does not work on any gated endpoint (`/classify`, `/summarize`, `/detail`, etc. — all of `COST_PATHS`), because `installGating` (via `app.ts`) never consults it. This is exactly the "two counters for one quantity" pattern called out in 코드규약 §8, generalized to "two implementations of one decision, wired to different call sites, that must agree by convention only" — and they have already diverged (one has the override branch, the live one doesn't).
- **Fix sketch**: delete the inline `resolveIdentity` in `app.ts` and instead derive `{tier, userId}` from `authService.resolveTier` + a `sub`/user-id lookup on the same verified claims (or extend `AuthService` with one method that returns both, so there is exactly one place tier-resolution logic can live). Add a gate test that sets `DEV_FORCE_TIER=paid`, calls a paid-gated route with no Bearer token, and asserts it is not 402'd.

### Finding 2 — HIGH: `StreamEvent` is missing the `meta` variant the SoT specifies for `/recommend`

- **SoT promise** (`인터페이스계약-v2.md` §5, L178): "/recommend: `text/event-stream`. 이벤트 = `term`(Term 1건) · `meta`(terms_rationale 등) · `done` · `error`(정화된 메시지)."
- **Code**: `shared/src/types/pipeline-io.ts:50-53`
  ```
  export type StreamEvent =
    | { type: "term"; term: Term }
    | { type: "done" }
    | { type: "error"; code: string; message: string };
  ```
  Only 3 of the 4 documented variants exist. `grep -rn "terms_rationale|\"meta\"" v2/app/packages` → 0 hits. `grep -rni "meta|terms_rationale" v2/docs/specs` → 0 hits — this is not mentioned as a deferral in any of the derived C2/C3 specs either, unlike the PrimerDoc and MindMap gaps, which are.
- **Consequence**: `core/src/pipeline.ts`'s `recommendStream` (the only producer of `StreamEvent`) has no way to ever emit rationale metadata alongside the term stream, because the type doesn't allow it. Whatever UI surface the SoT intended `terms_rationale` for (e.g., "why these terms" framing before/alongside the card stream) has no wire representation at all — it's not a stubbed field, it's absent from the contract.
- **Fix sketch**: classify before fixing (코드규약 §7) — decide whether `meta` was (a) a real requirement that got dropped, in which case add `{ type: "meta"; ...}` to `StreamEvent`, thread it through `recommendStream`, and note the ID/rationale/test per §6; or (b) a stale idea that should be struck from the SoT, in which case amend §5 first. Either way, the current state (SoT says 4, code has 3, nobody logged why) is exactly the silent-decision drift this audit is looking for.

### Finding 3 — MEDIUM: GET /usage silently drops "detail 잔여" that the SoT explicitly promises, and the derived spec already baked the narrowing in without a rationale note

- **SoT promise** (`인터페이스계약-v2.md` §3-3, L151): "GET /usage | [검토 정정] 잔여 사용량(**주간 탐색 잔여·detail 잔여**) — TR-08 UI 표면. 익명은 추정치 플래그 동반".
- **Derived spec already narrows it** — `specs/C2.3-게이팅.md:27`: "GET /usage: { tier, anonymous, weeklyRemaining }." — no `detail`/session-detail-remaining field, and no note explaining the drop.
- **Code matches the (already-narrowed) derived spec**, not the SoT: `adapters/http-app/src/middleware/gating.ts:101-115`
  ```
  app.get("/usage", async (c) => {
    ...
    return c.json({
      tier: id.tier,
      anonymous: id.userId === null,
      weeklyRemaining: id.tier === "paid" ? null : Math.max(0, limits.freeWeeklyLimit - used),
    });
  });
  ```
- **The data to compute it already exists** — the very same middleware hits a per-session detail counter at `gating.ts:94`: `await counters.hit(\`detail:${uid}:${sid}\`, WEEK_TTL)`. Nothing reads that counter back for `/usage`; it's write-only from this endpoint's perspective (a `session_id` would additionally need to be accepted as a query param on `GET /usage`, which it currently doesn't take either).
- This is the same shape of defect as the PrimerDoc case: SoT says X, an intermediate derivation quietly narrows it to X-minus-one-thing, and nothing records why — so a future reader has no way to tell "dropped on purpose" from "forgotten."
- **Fix sketch**: either amend SoT §3-3 to drop "detail 잔여" from the promise (if TR-08's UI never needed it), or add a `session_id` query param to `GET /usage` and a `detailRemaining` field computed from the existing counter, matching the shape `/detail`'s own gate already tracks.

### Finding 4 — MEDIUM: gating middleware is pre-wired for `/refine-primer`, a route that does not exist yet — inert gate config, and a duplication risk once C5 adds the real route

- `middleware/gating.ts:26`: `const COST_PATHS = ["/classify", "/next", "/preview", "/relate", "/recommend", "/detail", "/summarize", "/refine-primer"];`
- `middleware/gating.ts:80-85` also registers a pro-only 402 gate specifically for `"/refine-primer"`.
- But `/refine-primer` is not registered as a route anywhere — `pipeline-routes.ts` has no such handler, `RefinePrimerIn/Out` types don't exist in shared yet (correctly deferred to C5 per SoT §9 and `C2.1-영속계층.md:11`).
- This isn't wrong exactly (harmless today — a request to `/refine-primer` still 404s, the middleware chain just never gets a matching route to attach to), but it is code written **ahead of** the layer it depends on, with no route to exercise it and thus no test can currently prove it does what §4's "pro 전용(402)" promise says. It is inert in the strict sense used by this audit ("a branch that can never fire" — this middleware registration currently cannot fire because Hono has no `/refine-primer` handler to route a request to).
- **Fix sketch**: not urgent, but flag it in the C5 spec so whoever wires the real route is required to add the gate test (currently there is nothing forcing that connection to be verified when C5 lands the endpoint) — otherwise this is exactly the kind of "looks done, isn't wired" gap Finding 1 already produced once.

### Finding 5 — LOW: SoT §1 and §4 give contradictory gating weight for `/preview`

- §1 (L34, flow map table): `POST /preview | PreviewIn | PreviewOut | IP리밋만(경량) | [승계 v1 후반]` — explicitly calls out preview as lighter-weight, IP-only.
- §4 (L166, pseudocode, itself marked "검토 정정 — 개별 게이트 아님"): `globalDailyCap → ipRateLimit: 모든 비용 발생 엔드포인트(/next·/preview·/relate·/recommend 포함)` — explicitly includes `/preview` in the uniform global-cap treatment.
- Code (`gating.ts:26,39-54`) follows §4 (uniform), not §1 ("경량"/IP-only as the table states).
- This is not a code bug — code faithfully follows the later, explicitly-corrected §4 — but the SoT document contradicts itself, and §1's stale annotation will mislead the next reader who only skims the flow-map table. **Fix sketch**: strike or update the "IP리밋만(경량)" annotation in §1 to match §4, or restore per-endpoint differentiation in code if §1 was actually the intended final call.

### Finding 6 — LOW: dead conditional branch in RAG query construction

- `core/src/rag/index.ts:70-72`:
  ```
  const query = args.locale === "ko"
    ? `${args.topic} ${args.domainKey}`
    : `${args.topic} ${args.domainKey}`;
  ```
  Both branches are byte-identical. The surrounding comment (line 69, "ko 로케일 주제도 영어로 변환된 쿼리를 쓴다") documents an intent to treat `ko` differently (or at least explain why it *doesn't* differ), but the `if/else` shape itself is now pure noise — the condition governs nothing. This is exactly the "no inert code: a branch that can never fire" criterion from the audit brief, applied to a branch that fires but is meaningless.
- **Fix sketch**: collapse to a single `const query = \`${args.topic} ${args.domainKey}\`;` (if the two paths are genuinely meant to be identical, which the comment suggests), or, if `ko` was supposed to get different query shaping (e.g., translation, no domainKey suffix), implement the actual difference. Either way, leaving the ternary as-is invites a future patch to "fix" one branch and not the other, creating a real behavioral fork nobody intended.

### Finding 7 — LOW / documentation-only: `Choice.domain_tag` naming mismatch with SoT prose

- SoT §2 (L51): "`Choice`(label, **domain_tags** — deeper 필드 없음, SRS §6.1)" — plural.
- Code: `shared/src/types/pipeline-io.ts:7-11` `Choice { label: string; domain_tag?: string; }` — singular, and every prompt builder (`classify.ts:22`, `narrow.ts:27`, `relate.ts:24`) consistently emits `"domain_tag"` singular in the JSON format string. Code is internally 100% consistent; only the SoT prose uses the plural.
- The substantive promise ("no `deeper` field on Choice") **is honored** — confirmed no `deeper` field anywhere in `Choice`. This is very likely just an SoT typo, not a functional drift. Flagging only for documentation hygiene.

---

## 3. Reverse-direction check (code contradicting SoT where SoT was NOT tagged as revised)

- Checked `tierOf()` fallback in `pipeline-routes.ts:12-17` (falls back to trusting a client-supplied `body.tier` when gating/counters aren't installed). This looks superficially like it could violate §4's "x-tier류 헤더 완전 무시" spirit, but (a) it's a body field, not a header, and more importantly (b) `pipeline-routes.ts:1-3`'s own header comment says this is a deliberate, temporary C1 stopgap explicitly superseded once gating is installed ("인증 기반 판정은 C2 게이팅에서 대체"), and the code confirms `c.get("tier")` (gating-derived) always wins when `deps.counters` is present. **Not a finding** — correctly scoped and self-documented.
- Checked whether `x-tier`-style headers are read anywhere (`grep -rn "x-tier"` → 0 hits) — the "완전 무시" rule is trivially satisfied because no such header is ever consulted. **Not a finding.**
- Checked `GET /sessions?scope=…` (SoT §3-3 table header uses `scope=` in the URL example) against `crud-routes.ts:16-29`'s actual query params (`pinned`, `q`, `project_id`, `cursor` — no `scope` param read anywhere). Could not determine from the SoT text alone whether `scope` was meant to be a real, distinct query parameter (e.g., "mine"/"all") or just loose shorthand for "the filters listed after it." **Flagged as inference-only, not a confirmed drift** — would need the requirements doc (SRS) or ui-shared caller code to resolve, both out of this task's assigned scope.
- Checked FR-706 dedup wiring (`termNormsByProject` port exists but is never called from `core/pipeline.ts`) — see table row above; flagged as inference since the wiring point may legitimately belong to a not-yet-audited adapter/service layer rather than `core`.

## 4. Clean areas (checked, no drift found — reported plainly per instructions)

- Auth types (§2-2), JWT epoch-second/millisecond boundary discipline, 15-min access / 30-day refresh TTLs, key rotation (`jwtSecretPrev`) — all match SoT and `C2.2-인증.md` exactly, including the exact error-code menu behavior for `/auth/refresh`, `/auth/logout`, `/subscription/status`.
- PG persistence types (§2-3: `SessionRec`, `NarrowSnap`, `AssetTerm`, `KnowledgeState`, `Project`, `Page`, `SessionSummary`, `AssetSummary`) — every field matches the SoT code block verbatim, including the exact inline invariant comments (e.g. `narrow` existence ⟺ generation-incomplete).
- Prompt-instruction carryover (§2-1 "★프롬프트 지시 델타 승계"): P2 enough/confidence, P3 exclude/group/anchor-exclusion, P5 what/whymine/how+sources, preview/relate builders — all present with the specific instructions the SoT calls out by name (checked all 7 prompt builder files in full).
- Layering (§0-1, §7): no runtime-platform imports found in `shared/`, `core/` (only Web Crypto / TextEncoder / URL / ReadableStream — all on the explicit allow-list). No prompt string literals found outside `core/src/prompts/` (§8 boundary). Barrel-only exports confirmed in every package's `index.ts`.
- Gating pseudocode (§4) fail-open behavior, free-weekly no-recharge-on-classify-only (TR-02), pro-only 402 for summarize, per-session detail counter, high-risk keyword gate scoped to classify/recommend only — all match code and the derived C2.3 spec line-for-line.
- `NarrowSnap`/turns_left and the previously-confirmed double-counter bug: current code (`persistence.ts:20-25`, `turns_left` documented as re-derived from `(plan, answers)` on resume, not stored as a second independent counter) is consistent with the fix already logged in the commit history (`af2377b`) — re-verified, not re-reported as new.

## 5. Coverage / not-seen

- Did NOT audit `adapters/aws`, `adapters/local`, `adapters/tauri`, `adapters/persistence`, `adapters/providers`, `ui-shared`, `web`, `desktop`, `landing`, or `packages/scripts` — out of this task's assigned directories. Several "gaps" above (FR-706 dedup wiring, the anon→login session-id promotion mechanism, the `/preview` "캐시(세션+답변 키)" requirement) may legitimately live in one of those un-audited packages; I've flagged each such case explicitly as inference rather than confirmed drift.
- Did NOT run `tsc`/build/tests — this was a pure reading audit as instructed.
