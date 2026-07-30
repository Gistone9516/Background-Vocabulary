# Audit D — v1 residue in ported (non-rewritten) ui-shared / web front-end

Scope read in full: `v2/docs/코드규약.md` (86 lines), `v2/docs/인터페이스계약-v2.md` (286 lines),
`ui-shared/src/i18n/strings.ts` (114), `ui-shared/src/i18n/examples.ts` (181),
`ui-shared/src/styles/tokens.css` (565), `ui-shared/src/styles/shell.css` (182),
`ui-shared/src/styles/scale.css` (28), `ui-shared/src/styles/bundle.css` (4),
`ui-shared/src/app/AppShell.tsx` (65), `ui-shared/src/screens/EntryScreen.tsx` (154),
`ui-shared/src/index.ts` (78), `web/src/App.tsx` (185), `web/src/main.tsx` (15), `web/src/vite-env.d.ts` (9).

For ground truth on "what changed during the port" I diffed against the actual v1 source that is
still in the repo: `v1/sidetab/packages/extension/sidepanel/theme.css` (564 lines),
`i18n.ts`, `examples.ts`, `App.tsx`. This let several claims be verified as fact rather than guessed.

Every tsx file in the whole v2 app (ui-shared + web; desktop/landing packages don't exist yet) was
grepped for `className=` and `tr(` to build the ground-truth "what markup/keys actually exist" sets
used throughout. Screens `narrow/`, `terms/`, `difficulty/`, `kept/`, and `api/` are the operator's
rewritten code and are out of my target scope — I only cite them as *evidence* for what tokens.css /
strings.ts classes and keys are or aren't consumed; I make no correctness claim about their own logic.

---

## 1. Dead CSS selectors that used to be alive in v1 (not "unbuilt screen", genuinely superseded)

### 1a. [fact-cited] Old v1 burger-menu drawer, fully replaced by a new sidebar — 100% dead weight
`tokens.css:552-564` defines `.drawerWrap`, `.drawerPanel`, `.drawerItem` (+`.sel`,`svg`,`.di`,`.dm`),
`.drawerHead`, `.drawerDiv`. This was v1's live, working floating popover menu (opens near the
hamburger button, `top:48px;left:8px;width:min(266px,calc(100vw - 16px))`) used for language pick +
session/project nav in the single-column Chrome panel.

`AppShell.tsx:32-65` already reimplements the *same affordance* (hamburger → menu of nav items) with
an entirely different, newly-authored set of classes: `.sidebar`/`.sidebar.open`, `.scrim`, `.sbHead`,
`.sbBody`, `.sbSection`, `.sbItem`, `.sbEmpty` (defined `shell.css:71-140`).

I grepped `drawerWrap|drawerPanel|drawerItem|drawerHead|drawerDiv` across every `.tsx` in the repo
(ui-shared + web): zero matches. This is not "a screen nobody built yet" — the feature these 13 CSS
rules serve *was* rebuilt, just with different markup, and the old implementation was never deleted.
**Action:** delete `tokens.css:552-564` (and the `drawerPop` keyframe at `tokens.css:556`) once
confirmed no upcoming slice plans to reuse the class names.

### 1b. [fact-cited] `.brand span span` no longer matches any DOM after the port changed a span to a div
`tokens.css:75`: `@media (max-width:21.5625em){header{...}.brand span span{display:none}...}` — this
hides the brand subtitle ("VOCK NOTE") when the header is extremely narrow.

v1's original markup (`v1/sidetab/packages/extension/sidepanel/App.tsx:835-838`):
```
<button className="brand" onClick={goHome}>
  <span className="logo"><img .../></span>
  <span><b>{brandName}</b>{brandSub && <span>{brandSub}</span>}</span>
</button>
```
Here the subtitle is a `<span>` nested inside another `<span>` — `.brand span span` matches exactly
that inner span.

v2's port, `AppShell.tsx:16-26`:
```tsx
<div className="brand">
  <span className="logo" style={{ background: "var(--grad)" }} aria-hidden="true" />
  <div style={{ minWidth: 0 }}>
    <b>{tr("brand")}</b>
    <span>{tr("brand_sub")}</span>
  </div>
</div>
```
The wrapper element changed from `<span>` to `<div>`. The subtitle `<span>` is now a descendant of a
`<div>`, not of a `<span>`, so the compound selector `.brand span span` **cannot match anything in the
current DOM** — `.logo` is a leaf span (no child span) and the second span's parent is a div. The
narrow-header compaction rule silently does nothing; on a header narrower than 345px the subtitle will
overflow/get clipped by `.brand span{overflow:hidden;text-overflow:ellipsis}` (tokens.css:59) instead
of being cleanly hidden as designed.
**Action:** either restore a `<span>` wrapper (cheapest, matches the original selector) or rewrite the
selector to target the new structure (e.g. give the wrapper a class and use `.brand .brandText span`).
This is a decision that lived only implicitly in the original markup shape; the port broke it without
anyone having to touch the CSS at all.

### 1c. [fact-cited] `#app` narrow-panel base rule was already inert in v1 itself, and is now triple-overridden
`tokens.css:49`: `#app{width:100%;max-width:30rem;min-width:0;height:100vh;min-height:37.5rem;...
border-left:1px solid var(--border);border-right:1px solid var(--border)}` — this is the "framed
narrow column" look (480px cap + side borders).

`tokens.css:451-456` (unconditional, later in the same file, same specificity, so it wins over line 49
in every context):
```
#root{width:100%}
#app{max-width:none;width:100%;border-left:none;border-right:none}
```
I diffed this exact block against v1's `theme.css:451-456` — **byte-identical** (only the earlier px→rem
conversion differs elsewhere in the file). So the "framed narrow column" base rule was *already dead in
v1's real Chrome-panel deployment* — the comment at `theme.css:451-453` / `tokens.css:451-453` says so
explicitly: panel.html (a standalone prototype file) used the framed look, but the real extension
always overrode it to fill 100%. This is category "dead in v1 too", carried over verbatim, still dead.

See finding 3 below for a second, *new* problem this creates once `shell.css` adds a third layer on top.

---

## 2. Chrome-side-panel platform assumptions still encoded as literal values

- `tokens.css:74-75`: comment states outright — *"아주 좁은 사이드패널(최소 약 320px)에서 헤더가 한 줄을
  유지하도록"* ("so the header stays one line in a very narrow side panel, min. ~320px") — and the
  breakpoint `21.5625em` (=345px) is derived from that Chrome side-panel minimum width, not from any
  v2 rationale. [fact-cited, comment quoted verbatim]
- `tokens.css:49`: `min-height:37.5rem` (600px) and `max-width:30rem` (480px) are the same Chrome
  side-panel dimensions from v1 `theme.css:49` (`max-width:480px;min-height:600px`), carried over
  1:1 in rem. As shown in 1c, this rule is dead weight (always overridden), so the stale premise
  itself causes no visible bug today — but the numbers stayed in the file with no rationale update,
  so if someone "cleans up" 1c's override without understanding the history, this exact
  Chrome-panel-shaped box reappears in the web/desktop app. [fact-cited]
- `tokens.css:507`: `.proSheet{position:absolute;left:50%;bottom:56px;...max-width:calc(100% - 36px)}`
  — a lock-toast pinned to the bottom of `#app`. Harmless at any width, flagged only as one more
  instance of "the column is 100% of `#app`" premise; not a defect on its own. [inference]
- No `chrome.*`, `extension://`, or `manifest` references exist anywhere under `ui-shared/src` — I
  grepped for these explicitly. **Clean result**: the target files do not call any extension-only API.
  [fact-cited]

---

## 3. Magic numbers / constants that must agree across files by convention only

### 3a. [fact-cited] `#app` border-left across tokens.css + shell.css: the rationale in shell.css is now factually wrong
Cascade order is `scale.css` → `tokens.css` → `shell.css` (`bundle.css:1-4`).
- `tokens.css:49` sets `#app{border-left:1px solid var(--border)}` (base, narrow-panel-framed look).
- `tokens.css:456` (same file, later, same specificity) sets `#app{border-left:none}` **unconditionally**
  — so `#app` never has a left border, at any width, already before shell.css loads.
- `shell.css:142-147` (comment: *"넓은 화면에서는 사이드바가 경계를 만들므로 본문 왼쪽 테두리는 뗀다"* — "in
  wide screens the sidebar makes its own boundary so we remove the body's left border"):
  ```css
  @media (min-width: 64em) {
    ...
    #app { border-left: none; }
  }
  ```
  This comment's premise — that `#app` *has* a left border in narrow/mobile mode and this rule is what
  strips it in wide mode — is **false under the current cascade**: `tokens.css:456` already stripped it
  everywhere. The `shell.css:147` line is a no-op today.

This is exactly the "decision that lives only implicitly in code, and a later patch silently reverses
it" pattern the anti-patchwork rules warn about (코드규약 §6/§9): if a future cleanup pass reads
`tokens.css:456` as "redundant with shell.css, delete it" (a very natural reading in isolation), the
narrow/mobile view of `#app` **will silently regain a 1px left border** that shell.css's media query
never touches, because shell.css's own comment (incorrectly) assumes that border only ever existed in
wide mode. No single file currently states the true invariant ("`#app` border-left is always none,
for two independent historical reasons, and only one of the two rules is width-scoped"). **Action:**
consolidate to one rule with one comment that states the actual invariant, or delete `tokens.css:456`'s
`border-left:none` and let `shell.css`'s media query be the sole source of truth (verifying narrow mode
is supposed to show that border — currently it isn't, per 1c/2, so this needs a product decision, not
a silent merge).

### 3b. [fact-cited] Keyframe names duplicated between CSS and TSX with no shared source
`tokens.css:157-159`:
```css
@keyframes chipFloatA{0%,100%{transform:translate(0,0)}50%{transform:translate(.03125rem,-.25rem)}}
@keyframes chipFloatB{0%,100%{transform:translate(0,0)}50%{transform:translate(-.0625rem,-.1875rem)}}
@keyframes chipFloatC{0%,100%{transform:translate(0,0)}33%{transform:translate(.0625rem,-.125rem)}66%{transform:translate(-.0625rem,-.21875rem)}}
```
`EntryScreen.tsx:9`: `const FLOAT_NAMES = ["chipFloatA", "chipFloatB", "chipFloatC"];`, consumed at
`EntryScreen.tsx:24` (`name: FLOAT_NAMES[Math.floor(Math.random() * FLOAT_NAMES.length)]!`) and applied
via inline `style={{ animationName: c.name, ... }}` at `EntryScreen.tsx:140`.

These three strings must stay byte-identical between the CSS file and the TSX array by convention only
— nothing type-checks or derives one from the other. Rename/add/remove a keyframe in `tokens.css` and
`EntryScreen.tsx` silently drifts (a typo'd or removed keyframe name just produces no animation, no
error, no build failure). This is the same category of problem as the already-fixed 160px-textarea-cap
duplication (which is now correctly derived via `getComputedStyle`, `EntryScreen.tsx:62-63` reading
`tokens.css:136`'s `max-height:10rem` — confirmed fixed, not re-flagging it).
**Action:** either generate `FLOAT_NAMES` from a single shared constant (e.g. export the array from a
`.ts` file and reference it in a CSS-in-JS-free way isn't trivial for plain CSS, but at minimum a code
comment/const in tokens.css cross-referencing `EntryScreen.tsx`'s array would convert an implicit
convention into a documented one), or move the three keyframes' *names* into a single TS constant that
both a generated CSS custom property list and the TSX import from.

### 3c. Textarea max-height (already fixed) — confirmed, not a new finding
`EntryScreen.tsx:56-63` explicitly reads `getComputedStyle(el).maxHeight` rather than hardcoding a
duplicate number, with a comment stating exactly why. `tokens.css:136` still owns the single value
(`max-height:10rem`). **Clean result**, listed only to confirm the fix mentioned in the task brief is
real and holds up under reading. [fact-cited]

---

## 4. i18n keys that nothing renders, and rendered strings with no key

Built the ground-truth set by grepping every `tr("..."` call and every dynamic `tr(lv.name)`-style
lookup (`DifficultyScreen.tsx:14-17,34,41` resolves to `diff_basic(_desc)`, `diff_inter(_desc)`,
`diff_adv(_desc)` — all confirmed used) across all of `ui-shared/src` + `web/src`, then diffed against
every key in `strings.ts`'s `ko` object (79 keys total).

### 4a. [fact-cited] Five orphaned keys — defined, never rendered anywhere
- `strings.ts:27` `narrow_almost: " · 거의 다 좁혔어요"` — no `tr("narrow_almost")` call exists anywhere.
  `NarrowScreen.tsx:53-56` builds its status line from `narrow_ai` + `narrow_budget` only; the
  "almost done narrowing" suffix this key was meant to append is never shown.
- `strings.ts:33` `narrow_range_free` and `strings.ts:34` `narrow_range_pro` — the v1-style
  "최대 {max}턴..." / "{min}~{max}턴..." range hint. Never called; `NarrowScreen.tsx` shows only the
  single-number `narrow_budget` hint instead.
- `strings.ts:66` `diff_ex_label: "예시 어휘"` — the "example vocabulary:" label that was meant to sit
  above the sample term/line in the difficulty card. `DifficultyScreen.tsx:42-54`'s `.diffex` block
  renders `sample.term` / `sample.line` directly with no label at all.
- `strings.ts:35` plain `undo: "↩ 처음 질문으로"` — the only "undo" hit anywhere else in the codebase is
  the *action type* string `{ t: "undo" }` (`types.ts:60`, `NarrowScreen.tsx:93`, `machine.ts:201`),
  which is a discriminant tag, not an i18n lookup. `NarrowScreen.tsx:94` always uses `undo_left`
  instead (which does the same job plus a turn count). The plain `undo` string appears to be the
  pre-D-8-spec version of `undo_left`, left behind after the newer key superseded it.

None of these four are "screen not built yet" — the consuming screens (`narrow`, `difficulty`) are
built and shipped; the copy was simplified/redesigned during the rewrite and the old keys were never
removed from `strings.ts`. No rule ID or comment records that these were intentionally dropped.
**Action:** either delete the four keys, or — if the "almost done" / range-hint UX is meant to come
back — file it as a tracked TODO with an ID, per 코드규약 §6.

`strings.ts:103` `ai_extra: "AI로 더 정리"` is different in kind: it's the button label for the
**not-yet-built** `/summarize` ("AI로 더 정리") screen (SoT §1 flow map — pro-only, "이월" territory).
This one is legitimately "screen not built yet", not residue. [fact-cited]

### 4b. [fact-cited] Rendered strings that bypass i18n entirely — refusal screen in web/App.tsx
`App.tsx:175-182`:
```tsx
{journey.at === "refusal" ? (
  <main className="scroll pad screenIn">
    <h2>{"안전상 직접 다루지 않는 주제예요"}</h2>
    <button className="btn btn-ghost" style={{ marginTop: "1rem" }} onClick={home}>
      {"처음으로"}
    </button>
  </main>
) : null}
```
Both strings are inline Korean literals, not `tr(...)` calls. I confirmed neither exact string exists
anywhere in `strings.ts` (closest is `kept_back_home: "← 처음으로"`, a different string with a prefix,
used for a different screen). SoT §1 flow map lists `refusal` explicitly with "문구 정본 = ui-shared
다국어 리소스" ("copy source of truth = ui-shared's multilingual resource") — i.e. the SoT itself
requires this screen's copy to live in the i18n layer, and it currently doesn't. In any non-`ko` locale
this screen will show Korean regardless of the user's chosen language. **Action:** add
`refusal_title`/`refusal_home` keys to `strings.ts` and route this screen's markup through `tr()`.

---

## 5. Duplicate/contradicting rules for the same selector across tokens.css / shell.css / scale.css

Covered in detail in 3a (`#app` border-left — contradiction between what shell.css's comment assumes
and what the cascade actually does). Two more, lower-stakes instances:

- `#app{max-width:...}` is set three times: `tokens.css:49` (30rem), `tokens.css:456` (none,
  unconditional), `shell.css:26-29` (none, unconditional again). The third rule is a pure no-op given
  the second already applies at all widths — not contradictory, just redundant duplication that makes
  it harder to tell, by reading only `shell.css`, that `tokens.css` already settled this. `shell.css:23-25`'s
  own comment ("v1 셸을 본문 열 안에서 그대로 재사용하되, 셸 자체는 폭을 막지 않는다") reads as if *this file*
  is the one lifting the width cap, when in fact `tokens.css` already had. [fact-cited]
- No other same-selector contradictions found between the three files; `scale.css` only defines custom
  properties (`--entry-pad`, `--measure`, `--measure-wide`, `--sidebar-w`) and doesn't re-declare any
  selector that `tokens.css`/`shell.css` also target, so it's clean. [fact-cited]

---

## 6. Browser-only / extension-only APIs (Tauri-desktop compatibility)

Checked `AppShell.tsx`, `EntryScreen.tsx`, `strings.ts`, `examples.ts`, `main.tsx`, `vite-env.d.ts`,
`index.ts`. **Clean result** — no `chrome.*`, `localStorage`/`sessionStorage`, `navigator.*` extension
APIs, or any API absent from a standard WebView. The only DOM/browser primitives used are
`getComputedStyle`, `requestAnimationFrame`, `document.getElementById`, `crypto.randomUUID()`
(`App.tsx:107`) — all standard and all available inside a Tauri webview (WebView2/WebKit) as well as a
normal browser, and `crypto.randomUUID` is explicitly on the SoT's web-standards allowlist (§0-1).
[fact-cited] `api/` (http-client.ts etc.) was excluded per task scope and not reviewed here.

---

## 7. Additional finding outside the six requested categories, still load-bearing

### 7a. [inference, medium confidence] `narrow` avatar/progress-bar CSS has zero consumers despite the spec calling for it to be kept
`tokens.css:174-213` (`.steps`,`.dot`,`.opt` progress dots, `.aiwrap`,`.aiav`,`.aimeta`,
`.thinking .aiav`/`.msg`, `.dots3`, plus the shared `flow`/`glowpulse`/`pulse` keyframes) is the v1
"AI avatar thinking" treatment for the narrowing screen. I grepped every class in this block across
all tsx: **zero matches** anywhere, including in the shipped `NarrowScreen.tsx` (which renders the
"AI가 답을 읽고..." string as a plain `<p className="lead">`, `NarrowScreen.tsx:23`, with no avatar or
progress bar at all).
This is not an "unbuilt screen" — `NarrowScreen.tsx` is built and shipped (commit `af2377b`,
"C3 S2 진입과 좁히기 — 순수 상태 기계로 재설계"). More importantly, the project's own spec,
`v2/docs/specs/C3-S2-진입과좁히기.md:245`, explicitly says: *"치수 전환: tokens.css 175~213행(narrow·
steps·opt·아키네이터 아바타·thinking·공유 키프레임)을 rem으로 옮긴다"* ("dimension conversion: move
tokens.css lines 175-213 ... to rem") — i.e. the spec's own plan assumed this CSS would keep being used
after conversion. It was converted (it's in rem), but the screen that shipped doesn't use it. I can't
tell from the CSS/spec alone whether dropping the avatar UI was a deliberate simplification made during
implementation (and just never reflected back into the spec) or an oversight — `screens/narrow` itself
is outside my audit scope so I did not review its state machine to judge intent. Flagging because
tokens.css (my target) carries ~40 lines + 3 keyframes of dead weight either way, and the spec-vs-shipped
mismatch has no recorded rule ID explaining it either way. [fact-cited: no consumers exist;
inference: whether this was intentional]

### 7b. [fact-cited] EXAMPLES.en/ja/zh fully authored, zero consumers; EntryScreen hardcodes `.ko`
`i18n/examples.ts:169` exports `EXAMPLES: Record<OutputLocale, string[]>` with `ko`/`en`/`ja`/`zh`, all
verified at exactly 150 entries each with zero intra-array duplicates (checked programmatically). The
only read site anywhere in the app is `EntryScreen.tsx:22`: `pickRandom(EXAMPLES.ko, CHIP_COUNT)` —
hardcoded to `ko`. `EXAMPLES.en`/`.ja`/`.zh` (450 strings) are pure inert data right now. This matches
`strings.ts:1-3`'s own comment that only `ko` is wired up "for now" and the rest lands in S5, so it's a
documented, deliberate gap in *content* — but the *wiring* gap is specific: `EntryScreen.tsx` takes no
locale parameter at all, so when locale-switching lands, `EntryScreen` itself (not just some central
i18n selector) will need to change. No TODO/ID marks this dependency today. [fact-cited]

### 7c. [inference] `lastCtx` ref in web/App.tsx encodes an unenforced screen-ordering invariant
`App.tsx:38-44`'s `Journey` union type carries `ctx: NarrowCtx` only in the `"difficulty"` variant, not
in `"terms"` or `"kept"`. `App.tsx:85-98`:
```tsx
const lastCtx = useRef<NarrowCtx | null>(null);
if (journey.at === "difficulty") lastCtx.current = journey.ctx;
const detailInputOf = useCallback((card: TermCard): Prompt5In => {
  const c = lastCtx.current;
  return { ...,  area: c?.classifyOut.domain ?? "", ... };
}, []);
```
and `KeptScreen`'s `topic`/`condition` props (`App.tsx:167-168`) read the same ref. This works today
only because the journey always flows `entry → narrow → difficulty → terms/kept` in that order, so the
ref is always populated by the time it's read — but that ordering guarantee lives only in how `submit`/
`pickDifficulty`/`onHandoff` happen to be wired, not in the `Journey` type itself. A future change that
lets a saved/resumed session jump straight into `"terms"` (plausible once session persistence — SoT
§3-3 — lands) would silently make `detailInputOf` build requests with `area:"", job_type:[], domain:""`
and `KeptScreen` show an empty topic, with no error raised anywhere. This is the same category as the
turn-budget/answer-count double-counter bug already found by hand: an invariant ("ctx exists by the
time you're in terms/kept") that is checked nowhere and enforced only by call-order convention, where
"prefer impossible over checked" (코드규약 §8) would instead put `ctx` directly on the `"terms"`/`"kept"`
variants of `Journey` so a state without it cannot be constructed. [inference — no observed failure
yet, since current wiring always satisfies the order; risk is in future changes, not present behavior]

---

## Categories with a clean result (explicitly, so it's not mistaken for missed coverage)

- No `chrome.*`/extension-only/localStorage API usage in any of the ui-shared/web target files (§6).
- No duplicate entries within any of the four `EXAMPLES` locale arrays (150/150/150/150, verified
  programmatically).
- The already-known 160px textarea-cap duplication is confirmed fixed and does not need re-flagging.
- `scale.css` itself has no internal contradictions and doesn't clash with `tokens.css`/`shell.css` on
  any shared selector (only shares custom-property names, consumed correctly).

## Not reviewed (explicitly out of scope per task)

`screens/narrow`, `screens/terms`, `screens/difficulty`, `screens/kept`, `api/` — these were only used
as read-only evidence of "what markup/keys exist today" to determine CSS/i18n liveness; their own
internal logic, state machines, and correctness were not assessed.
