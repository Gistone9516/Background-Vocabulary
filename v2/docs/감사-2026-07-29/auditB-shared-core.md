# Task B Audit — v1 Design Residue in packages/shared/src and packages/core/src

Scope read: 100% of both packages, every file, in full.
- shared/src: fixtures.ts, index.ts, pipeline-contract.ts, sse.ts, utils.ts, ports/{auth,gating,persistence,pipeline}-ports.ts, ports/index.ts, types/{auth,enums,index,limits,persistence,pipeline-io}.ts (16 files, ~730 lines)
- core/src: index.ts, pipeline.ts, auth/{auth-service,entitlement,index,jwt}.ts, gating/{index,risk}.ts, locale/index.ts, prompts/{blocks,classify,detail,index,narrow,preview,recommend,relate,summarize}.ts, rag/index.ts (18 files, ~1220 lines)

Baseline docs read in full: 코드규약.md, 인터페이스계약-v2.md (SoT v2.0).

To ground several findings I also grepped (not fully read) consumer packages (ui-shared, adapters/*, web, scripts) purely to get accurate read-site counts, as instructed. Those files are outside Task B's edit/finding scope; they are cited only as evidence of read/write-site counts for shared/core-declared fields and constants.

Legend: [fact-cited] = verified at the quoted file:line. [inference] = reasoning from cited facts, flagged explicitly.

---

## 0. Pre-confirmed bug — exact shared/core anchors (not new, included for completeness)

The task states the PrimerDoc/Prompt4Out mismatch was already confirmed by hand. Here are the precise shared/core locations backing it, since the audit was asked to read both packages completely:

- `shared/src/types/pipeline-io.ts:114-122` — `Prompt4Out` is still the v1 shape: `{ area, task_intent, user_condition?, context_object?, context_sentence, vocab, paste_text }`. No `PrimerDoc` anywhere in this interface. [fact-cited]
- `shared/src/pipeline-contract.ts:53` — `summarize(input: Prompt4In, outputLocale: OutputLocale): Promise<Prompt4Out>;` [fact-cited]
- `core/src/pipeline.ts:204-211` — `async summarize(...): Promise<Prompt4Out> { ... return deps.llm.complete<Prompt4Out>({...}); }` [fact-cited]
- Versus SoT `인터페이스계약-v2.md` §3-1 row: `POST /summarize | Prompt4In | Prompt4Out(**PrimerDoc**) | pro 전용(402) | [개정] 출력 = 구조화 PrimerDoc` (line 113). [fact-cited]

`PrimerDoc` does exist in shared (`types/persistence.ts:8-17`) but only as `SessionRec.primer`'s type — it was never substituted as the pipeline's `Prompt4Out`. The revision described in the SoT was never implemented in either shared or core.

---

## 1. Two-or-more fields for one quantity / stored-instead-of-derived values

### 1.1 [HIGH] `NarrowSnap.turns_left` — the exact shape of the confirmed v1 bug, reintroduced at the persistence-type layer

`shared/src/types/persistence.ts:20-25`:
```ts
export interface NarrowSnap {
  question: string;
  choices: Choice[];
  answers: { label: string; action: "선택" | "더깊이제외" | "어려워요"; at?: number }[];
  turns_left: number; // 재개 시 (현재 plan, answers)로 재계산이 정본(v1 교훈)
}
```
The comment ("on resume, recomputing from the current plan+answers is canonical — v1 lesson") is an admission that this stored field is **not trustworthy**, right next to keeping it as a stored field anyway.

Cross-checked the rest of the pipeline:
- `ui-shared/src/screens/narrow/decide.ts:21-23` already does it the right way and says so explicitly: `// 불변식: realAnswers + turnsLeft = narrowMax. 저장하지 않으므로 깨질 수 없다.` (`turnsLeft` is a pure function of `answers` + `narrowMax`, never stored). [fact-cited]
- Full-repo grep for `turns_left` outside the type declaration found exactly one hit: `scripts/e2e-pg.mjs:47`, which only writes a hardcoded literal (`turns_left: 3`) into a test PUT body — it is never read back or asserted against anything. [fact-cited]
- Full-repo grep for `NarrowSnap` inside `ui-shared` found zero hits — the client that actually runs the narrow flow never constructs or reads this field at all.
- `adapters/http-app/src/routes/crud-routes.ts:38-68` (`PUT /sessions/:id`) writes `narrow: (body.narrow as SessionRec["narrow"]) ?? null` straight through with no validation or recomputation against `answers`. [fact-cited]

Net effect: the type still carries a persisted "remaining turn budget" counter that is documented as non-authoritative, is never produced by any real caller (only a test literal), and is never consumed by any real reader. It is inert today, but it is the textbook shape of 코드규약.md §8's "카운터 둘을 두고 둘이 일치하는지 테스트한다" anti-pattern — anyone who later builds a resume path against the raw stored value (e.g. a future native client, or a server-side repair job) will trust a number nothing keeps correct. The fix used in `ui-shared/decide.ts` (derive, don't store) should be reflected in the type: either drop `turns_left` from `NarrowSnap` entirely (recompute at read time from `answers.length` + `narrowMax`, the way `SessionSummary.generating` is already correctly derived — see §1.3 for a clean counter-example), or make it explicitly a cache hint that call sites must never trust.

### 1.2 [HIGH] `effectiveEntitlement()` decides `paid`/`free` from two of three fields that are documented as needing to agree, and never reads the third

`shared/src/types/auth.ts:5-6`:
```ts
// 구독 상태. tier와 한 트랜잭션으로 같이 갱신해 불일치를 막는다.
export const SUBSCRIPTION_STATUSES = [...] as const;
```
This comment states the invariant explicitly: `tier` and `subscription_status` must be updated together in one transaction "to prevent inconsistency" — i.e., they are two representations of overlapping information that must agree by convention.

`core/src/auth/entitlement.ts:5-14` (full file):
```ts
export function effectiveEntitlement(u: UserRecord): Entitlement {
  const now = Date.now();
  const isPro = u.tier === "paid" || (u.grace_until != null && u.grace_until > now);
  return {
    user_id: u.user_id,
    effective_tier: isPro ? "paid" : "free",
    subscription_status: u.subscription_status,
    expires_at: u.expires_at,
  };
}
```
The actual entitlement decision (`isPro`) reads only `u.tier` and `u.grace_until`. `u.subscription_status` is read exactly once, purely to be echoed back unchanged into the output — it never participates in the decision. So if `subscription_status` ever reaches a terminal negative state (`"expired"`, `"suspended"`, `"refunded"`) while `tier` or `grace_until` haven't been rolled back in the same write (a webhook partial-failure, a missed field in a patch, a stale `grace_until` left over from an earlier grace period), this function will still grant `paid`. Nothing in core enforces or even checks the "same transaction" invariant the type's own comment promises — the two fields can drift, and the one function that's supposed to reconcile them only look at one of them.

Cross-checked: `core/src/auth/auth-service.ts` never reads `subscription_status` outside of pass-through either (`status()` copies `ent.subscription_status` into the response; nothing branches on it). [fact-cited]

This is not a new field-pair invented for this audit — it is precisely the "two counters that must agree by convention, and nothing enforces it" shape from 코드규약.md §8, applied to entitlement instead of turn budget.

### 1.3 Clean counter-example found in the same package family (for contrast, not a finding)

`shared/src/types/persistence.ts:89` `SessionSummary.generating: boolean; // narrow != null (생성 미완)` looks like it could be the same anti-pattern (a redundant stored boolean next to `narrow`), but it is not: `adapters/persistence/src/repositories/session-repo.ts:113` computes it as a SQL-derived column, `(narrow IS NOT NULL) AS generating`, at read time — it is never independently stored. This shows the team already knows and applies the "derive, don't store" rule elsewhere, which makes §1.1's `turns_left` residue look more like an oversight than an unknown principle.

### 1.4 [MEDIUM] `SessionRec.narrow` / `SessionRec.generated` — an implicit two-field state machine with an unenforced invariant

`shared/src/types/persistence.ts:38-39`:
```ts
narrow: NarrowSnap | null;      // null이면 생성 완료(불변식: narrow 존재 ⟺ 생성 미완, v1 승계 — 삭제축과 독립)
generated: Term[] | null;       // 생성된 리스트 전체(담기 0개여도 보존, FR-702)
```
The comment states an invariant across two independently-nullable fields: `narrow != null ⟺ generation incomplete`. Nothing in the type prevents constructing (or persisting, per `crud-routes.ts:38-68` which writes both straight from request body with `?? null` fallbacks and no cross-field check) a `SessionRec` where both are non-null, or both are null in a state that means something other than "not yet started." This is the same shape 코드규약.md warns about ("막을 수 있으면 검사하지 않는다") — a two-phase state that should be one discriminated field (e.g. `phase: {kind:"narrowing", narrow: NarrowSnap} | {kind:"generated", generated: Term[]} | {kind:"idle"}`) is instead encoded as a convention over two nullable fields. `StreamEvent` in the very same package (`pipeline-io.ts:50-53`, `{type:"term"|"done"|"error", ...}`) shows the discriminated-union pattern is already in use elsewhere, so this isn't an unknown tool — it just wasn't applied here.

---

## 2. Magic constants duplicated across files (or across a type and a prompt)

### 2.1 [HIGH] LLM model identifiers: duplicated string literals across core and the provider adapter, with a silent-downgrade failure mode

`core/src/pipeline.ts:34-35`:
```ts
const MODEL_FLASH = "deepseek-v4-flash";
const MODEL_PRO   = "deepseek-v4-pro";
```
`adapters/providers/src/deepseek/client.ts:31-43` (outside Task B's assigned scope, quoted only as corroboration of the risk the core-side constant creates):
```ts
private readonly flashModel: string;
private readonly proModel: string;
constructor(opts: { apiKey: string; flashModel?: string; proModel?: string }) {
  this.flashModel = opts.flashModel ?? "deepseek-v4-flash";
  this.proModel = opts.proModel ?? "deepseek-v4-pro";
}
private resolveModel(model: string): string {
  if (model === this.proModel) return this.proModel;
  return this.flashModel;
}
```
`shared/src/types/enums.ts:40-42` explains why `ModelId` is a bare `string` and not a literal union: `"모델 식별자. 리터럴 union 금지. 허용 목록 검증은 어댑터에서만 한다."` — i.e., there is deliberately no compile-time contract tying core's literal to the adapter's literal; the two files must agree purely by convention.

The failure mode is worse than a simple mismatch: `resolveModel` does not validate/reject an unrecognized model id — it silently **falls back to `flashModel` for anything that isn't an exact string match to `proModel`**. Concretely: `core/src/pipeline.ts:143` picks `MODEL_PRO` for `hard_domain` topics specifically because they need the stronger model (`financial_modeling`, `payment_settlement`, `ar_vr` in `locale/index.ts:32-34`). If the two `"deepseek-v4-pro"` literals ever diverge by so much as a version suffix (one file bumped, the other not), every hard-domain request downgrades to flash with **no error, no log, no test failure** — it just quietly produces worse output for the domains the routing logic exists to protect. This is exactly 코드규약.md's "magic constant that must stay in sync only by convention," except the usual symptom (a thrown error or an obviously wrong value) is masked by a silent coercion.
Fix sketch: export `MODEL_FLASH`/`MODEL_PRO` from `shared` as the single source of truth; have both `core/pipeline.ts` and the adapter's constructor default import from there; make `resolveModel` throw (or fall back to a distinct `UNKNOWN_MODEL` error code) rather than silently coercing.

### 2.2 [MEDIUM] Narrow-turn envelope `[3, 8]`: duplicated as a hardcoded English sentence in the prompt, disconnected from `Limits`

`shared/src/types/limits.ts:16,19,42-43`:
```ts
narrowMax: { free: number; paid: number }; // 좁히기 최대 턴
...
narrowMin: number;
...
narrowMax: { free: 3, paid: 8 },
narrowMin: 3,
```
`core/src/prompts/narrow.ts:26` (`buildPrompt2`'s system prompt, hardcoded, no parameter):
```ts
"Judge whether the history has narrowed the intent enough, and output enough (boolean) and confidence (0-1). The goal is to finish within 3 turns — once about 3 answers are gathered, usually end with enough=true. Ask additional questions (max 8) only when intent genuinely splits widely. Do not pad questions just to fill turns (D1).",
```
`buildPrompt2`'s input type (`narrow.ts:6-16`) has no `narrowMin`/`narrowMax`/`limits` parameter at all, and `core/pipeline.ts:63-70` (`nextBranch`) never passes one in: `prompts.buildPrompt2({ ...input, outputLocale })`. The literal "3" and "8" in the prompt text are copy-typed from `DEFAULT_LIMITS`, not derived from it. If an operator changes `DEFAULT_LIMITS.narrowMax.paid` (or the free-tier `narrowMin`) — which is precisely what `Limits` exists to make configurable per the file's own header comment ("운영 한도... 어댑터가 env로 전부 덮어쓸 수 있다") — the server-side enforcement (`ui-shared/decide.ts`, `/config` response) will honor the new envelope, but the model's own judgment of "enough" keeps steering toward the old hardcoded 3/8 window, silently disagreeing with the configured limits. This is the same "must stay in sync only by convention" shape as §2.1, at lower blast radius (a UX/quality drift rather than a cost/safety one).

---

## 3. Fields declared in shared types that nothing reads (or nothing writes)

Grepped every candidate across the full repo (not just shared/core) to get accurate read-site counts, per instructions.

| Field | Declared at | Read/write sites found outside declaration + own prompt-schema string | Verdict |
|---|---|---|---|
| `Choice.domain_tag` | `pipeline-io.ts:10` (comment: "품질 가드용" — quality guard for tag divergence across clicks) | Requested as an LLM output key in `classify.ts:22`, `narrow.ts:27`, `relate.ts:24`. **Zero** read sites anywhere in `ui-shared`, `adapters`, or `web`. [fact-cited via full-repo grep] | Inert: paid for (extra output tokens, every turn) but never consumed for the "quality guard" the comment promises. |
| `Term.difficulty` | `pipeline-io.ts:31` (comment: "리스트 전체가 이 난이도로 생성된다" — the whole list is generated at this difficulty) | `core/prompts/recommend.ts:35`'s own output JSON-format string never lists `"difficulty"` as a producible key on `Term`. `core/pipeline.ts`'s `recommendStream` forwards LLM `term` events to the client unmodified (no post-processing step comparable to how it stamps `sources` in `detail()`, `pipeline.ts:253-257`). **Zero** writers, **zero** readers anywhere in the repo. | Fully vestigial on both ends: nothing produces it, nothing consumes it. |
| `Prompt1Out.condition_required` | `pipeline-io.ts:67` (comment: "true면 프론트가 조건 입력을 권장으로 승격" — true promotes the condition input in the UI) | Set by the LLM per `classify.ts:15,22`. **Zero** read sites in `ui-shared` or `web` (grepped both directories directly). | The documented consumer (front-end promoting the condition field) does not exist yet; field is currently write-only. |
| `Prompt4In.background_hint` | `pipeline-io.ts:112` | Referenced only inside `summarize.ts:26`'s own prompt text ("Generate context_sentence from background_hint"). `ui-shared/screens/kept/primer.ts` (the only place that assembles a summarize-style briefing today) never sets it. **Zero** callers populate it anywhere in the repo. | Instruction to the model refers to an input that is never supplied by any current caller. |
| `Prompt5In.connection_hint` | `pipeline-io.ts:133` | Wired through `core/pipeline.ts:243` and `prompts/detail.ts:13,24,37` correctly on the core side, but **zero** sites in `ui-shared` ever capture a `RelateOut` and thread it into a later `/detail` call. | End-to-end dead until the ui-shared wiring for the "relate" turn's output → detail-call is built (tracked as [승계 v1 후반] in the SoT, so likely pending C3/C4 work rather than silent residue — flagging for visibility, not urgency). |
| `Prompt2In.remaining_tags` | `pipeline-io.ts:79` | Re-declared in `narrow.ts:10`'s input signature, forwarded via `JSON.stringify(input)` in `narrow.ts:30`, but **never referenced in the system prompt's instruction text** (unlike every other field, which gets an explicit sentence telling the model what to do with it) and **never set by any caller** anywhere in the repo (grepped, zero hits beyond the two declarations). | Fully inert: no producer, no instruction telling the model how to use it even if present. |
| `EntitlementPatch.occurred_at` | `shared/src/types/auth.ts:71,73` (comment: "occurred_at으로 이벤트 순서 역전을 막는다" — guards against event-order reversal) | `adapters/persistence/src/repositories/user-repo.ts:61` (outside Task B scope, quoted for corroboration): `// 이벤트 순서 역전 가드(occurred_at 비교)는 webhook이 들어오는 C5에서 강화한다.` — i.e. the comparison logic the field exists for does not exist anywhere yet. | Honestly self-documented as deferred to C5 (not hidden), but as of today the field carries zero behavior — worth tracking with an explicit ID so it isn't forgotten rather than living only in a scattered comment. |

---

## 4. Branches that can never fire

Checked `core/locale/index.ts` (`classifyRouting`/`snapDomainKey`) closely since it has the shape of a dead branch: `classifyRouting`'s fallback path does `entry?.hard_domain ?? false` (`locale/index.ts:122`). Verified `snapDomainKey` can only ever return a key that is a member of `STATIC_DOMAIN_MAP` (direct hit, or one of the `KEYWORD_MAP` targets — all 17 of which are confirmed present in `STATIC_DOMAIN_MAP` — or the literal `"other"`, which is also a defined map entry). So `entry` can never actually be `undefined` at that line; the optional chaining is dead defensive code. This is real but low severity — it reads as a `noUncheckedIndexedAccess`-driven TypeScript idiom rather than v1 residue, and it doesn't produce incorrect behavior (the `?? false` fallback happens to match `STATIC_DOMAIN_MAP.other.hard_domain`'s actual value). Not elevating this to a ranked finding; noting it for completeness since it technically matches the category.

No other unreachable branches found in `core/src` or `shared/src`.

---

## 5. Runtime/platform assumptions leaking into pure layers — CLEAN

Grepped both packages for `chrome.`, Workers-specific globals, `process.env`, `Buffer`, `require(`, `__dirname`, `window.`, `document.`, `localStorage`, `indexedDB`, and scanned every file read in full for ad-hoc timer-based coordination (`setTimeout`/`setInterval` used to sequence logic rather than just as a utility).

Result: **no violations found.** `core/auth/jwt.ts` uses only `crypto.subtle`, `atob`/`btoa`, `TextEncoder`/`TextDecoder` — all either explicitly whitelisted by SoT §0-1 ("Web Crypto · TextEncoder/Decoder") or long-standing cross-runtime globals (browser, Node ≥18, and Workers all provide `atob`/`btoa`) rather than a Node- or Workers-specific API. No `setTimeout`/`setInterval` at all in either package. `core/rag/index.ts` and `core/pipeline.ts` depend only on the injected `LlmClient`/`SearchProvider`/`CacheStore` ports plus `fetch`-adjacent Web Streams (`ReadableStream`), consistent with SoT §0-1's boundary. This category is genuinely clean in both packages as currently written.

---

## 6. Boolean flags that can be simultaneously true in a meaningless combination

Scanned every boolean/boolean-shaped field in both packages (`UserRecord.cancel_at_period_end`, `SessionRec.pinned`, `PreviewOut`/`RelateOut.relevant`, `Prompt1Out.condition_required`, `Prompt2In.simplify`, `Prompt2Out.enough`, gating's `AuthConfig.devForceTier`).

No pair of independent booleans that can both be true in a meaningless combination was found (e.g. `pinned=true` + `deleted_at != null` is a legitimate, meaningful combination — a soft-deleted session can still remember it was pinned for restore — not a bug). The one real finding in this category is §1.4 (`SessionRec.narrow`/`generated`), which is boolean-*shaped* (an implicit two-state machine) even though it's implemented as two nullable object fields rather than literal booleans; it is filed there to avoid duplicating the writeup.

`NarrowSnap.answers[].action` (`"선택" | "더깊이제외" | "어려워요"`, `persistence.ts:23`) is worth naming explicitly as the **fixed** version of the original v1 bug shape: v1 apparently tracked "difficulty skip" and "regular answer" as separate counters (per the task's framing), whereas here all three action kinds share one array with a single discriminant field — exactly rule 8's prescribed fix ("하나만 두고 나머지는 파생한다"). This is a clean result worth stating plainly: the bug that was fixed, was fixed correctly at this layer.

---

## 7. Error paths that classify by string matching instead of a structured code — CLEAN

Grepped both packages for `.message.includes`, `err.message`, `.startsWith(`, `instanceof Error`. Only hit: `shared/src/sse.ts:35`, `if (!line.startsWith("data:")) continue;` — this is SSE wire-format parsing per spec, not error classification, so it doesn't count.

Every error path actually found in the two packages uses a structured discriminant:
- `StreamEvent` errors carry a `code` field (`pipeline-io.ts:53`), populated with real codes at each throw site (`"HIGH_RISK_REFUSED"` in `pipeline.ts:120`, `"PIPELINE_ERROR"` in `pipeline.ts:194`, `"UPSTREAM_429"` in the fixture).
- `OwnershipError` (`ports/persistence-ports.ts:24-29`) is a proper `Error` subclass with a `name` discriminant, and its one call site (`crud-routes.ts:65`, outside scope but confirms the pattern) checks `e instanceof OwnershipError`, not a message string.
- `jwt.ts`'s `verifyToken`/`verifyAccess`/`verifyRefresh` classify by structured claim fields (`claims["typ"]`, `exp` as a number, `tier` against a literal set) — never by matching an error string.

This category is genuinely clean in both packages.

---

## 8. Stale-read pattern — CLEAN, and explicitly already rejected once

`core/rag/index.ts:105-108` contains a comment documenting that a stale-cache-refetch path was deliberately removed: `CacheStore.get` returns `null` uniformly whether a key is absent or TTL-expired, so retrying the same key after a miss would always be a wasted round trip; a stale-tolerant read would need a distinct `getStale` port method that doesn't exist. No stale-read-workaround pattern exists in either package as currently written. Flagging as a clean result — the team already caught and removed this exact class of bug once, which raises confidence that its absence elsewhere is deliberate rather than accidental.

---

## Coverage statement

Both packages read to 100% (every `.ts` file, full contents, no offset/limit truncation) — 34 files, ~1950 lines. Every field named in categories 1–7 was verified with `Grep` across the entire `v2/app` tree (not just shared/core) to get accurate producer/consumer counts, as the task instructed; those secondary hits are in `ui-shared`, `adapters/*`, `web`, and `scripts`, which are outside Task B's assigned packages and were not read in full — only grepped for the specific field/constant names listed above. No other file in those packages was inspected, so I cannot rule out additional residue specific to those packages; that would need a separate audit pass with those directories as the primary scope.

## Summary ranking

1. HIGH — `core/pipeline.ts:34-35` model-id magic constants vs. `adapters/providers/deepseek/client.ts:31-43`'s silent-downgrade `resolveModel` (§2.1)
2. HIGH — `core/auth/entitlement.ts:5-14` ignores `subscription_status` despite the documented tier/status agreement invariant (§1.2)
3. HIGH — `shared/types/persistence.ts:24` `NarrowSnap.turns_left`, a stored non-authoritative counter reintroducing the fixed v1 shape (§1.1)
4. MEDIUM — `shared/types/limits.ts:42-43` narrow envelope duplicated as hardcoded prose in `core/prompts/narrow.ts:26` (§2.2)
5. MEDIUM — `shared/types/persistence.ts:38-39` `SessionRec.narrow`/`generated` implicit state machine, unenforced invariant (§1.4)
6. MEDIUM — Table of six inert/one-sided fields in `pipeline-io.ts` and `auth.ts` (§3)
7. Clean categories, reported plainly: runtime/platform leakage (§5), string-matched error classification (§7), stale-read pattern (§8), and the already-fixed double-counter shape for narrow answers (§6).
