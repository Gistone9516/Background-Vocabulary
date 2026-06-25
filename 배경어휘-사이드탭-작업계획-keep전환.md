# 배경어휘 사이드탭 — 작업계획: 태그→Keep 전환 + Summary 흡수 + 인덱스 히스토리 (v1.0, 2026-06-25)

> **이 문서의 목적:** 현 세션은 Claude Code 버그(아래 §10) 때문에 코드를 건드리지 않고 계획만 남긴다. **다른 세션이 이 문서만 읽고 바로 구현**할 수 있도록 자기완결적으로 쓴다. 라인 번호는 편집으로 유동적이라 함수·심볼명 기준으로 적는다.
>
> **승인 상태(2026-06-25 사용자 결정):** 아래 C1·C2·C3 방향 전부 승인됨. 단 "큰 구조 변경이라 구현 전 화면 흐름을 먼저 그려 확인받는 편이 안전" — 구현 세션은 §8 흐름을 사용자에게 한 번 확인하고 들어갈 것.

---

## 1. 배경 (왜 바꾸나)

제품 종착점이 **"복사용 프롬프트 생성" → "사용자가 분야 개념을 이해해 스스로 말할 수 있게"** 로 교정됨(프로젝트 메모리 `sidetab-project-status` 참조). 그 결과:

- 어휘 카드의 태그 {알아·몰라·적용 모름}의 **실제 주 소비처는 Summary의 복사 텍스트**(`buildSummary`가 태그로 "B는 잘 모른다" 문장을 조립). paste 목적이 격하되면서 태그도 명분을 잃어 포지션이 애매해짐.
- 해결: 태그 3종을 **단일 Keep**으로 단순화(인지 부담↓, 종착점 정합, 재방문 동기 부여), Summary는 별도 화면을 없애고 Keep 리스트에 복사 기능만 흡수.

---

## 2. 범위 — 변경 3건

- **C1.** 어휘 카드 태그 {알아/몰라/적용 모름} → **단일 Keep 토글**로 교체.
- **C2.** **Summary 화면 제거**, "메인 AI용 복사"를 Keep 리스트 뷰에 흡수.
- **C3.** **인덱스/히스토리**: 처음 메인에서 입력한 텍스트를 키로 `chrome.storage.local`에 저장. Entry 화면에서 "이전 탐색"으로 열람, 클릭하면 그때 Keep한 카드 리스트 복원.

---

## 3. 현재 구조 (건드릴 심볼)

**메인 파일:** `sidetab/packages/extension/sidepanel/App.tsx`

- `type Screen = "entry"|"narrow"|"terms"|"summary"|"paywall"|"refusal"` — "summary" 제거 대상.
- `type UITag = "know"|"dontknow"|"partial"|"unconfirmed"` — 제거 대상.
- `interface UITerm` 의 `uiTag`, `understood` — 제거. `kept: boolean` 신설.
- 태그 함수: `setTag`, `markUnderstood`, `restore` — 제거/대체.
- `Card` 컴포넌트: `.tags` 영역(알아/몰라/적용모름 버튼)과 `dontknow` 안내 블록 — 교체.
- `Terms` 컴포넌트: `known`(알아=숨김/트레이) · `active` 필터 분기, `.tray`/`.traychip` — Keep 기준으로 재작성. 푸터 "정리 보기" 버튼 → "담은 어휘 보기".
- `Summary` 컴포넌트 + `buildSummary` + `onCopy`/`onShare`/`aiRefine` — buildSummary는 kept 기준 재작성, onCopy 유지, 화면은 Keep 리스트로 대체.
- `App` 렌더 스위치(`state.screen === ...`)에서 summary 분기 교체.

**스타일:** `sidetab/packages/extension/sidepanel/theme.css` — `.tags`, `.tagbtn`(및 `.on-know`/`.on-dont`/`.on-part`), `.tray`, `.traychip`, `.summary`, `.dontknow`. Keep 버튼용 스타일 신규(기존 `.understood`/`.dash` 톤 재사용 권장).

**백엔드(계약 영향은 §7):** `sidetab/packages/adapters/workers/src/index.ts`의 `/summarize`, `sidetab/packages/shared/prompts/index.ts`의 `buildPrompt4`, `sidetab/packages/shared/types.ts`의 `Tag`·`Prompt4In`.

**참고 패턴:** `sidepanel/api.ts`의 `getUserId()` — `chrome.storage.local` 우선 + `localStorage` 폴백. C3 저장 헬퍼가 그대로 본뜰 패턴.

---

## 4. C1 — 태그 → Keep

1. `UITerm`에서 `uiTag`, `understood` 삭제, `kept: boolean` 추가. 스트리밍 수신부(`addTerm`)에서 `kept: false` 초기화.
2. `toggleKeep(id)` 신설: `dispatch({type:"updateTerm", id, patch:{kept: !현재값}})`. `setTag`/`markUnderstood`/`restore` 삭제.
3. `Card`의 `.tags` 3버튼 → Keep 토글 1버튼. 라벨 예: 미Keep `＋ 담기`, Keep `담음 ✓`. `dontknow` 안내 블록 삭제.
4. **"알아=숨김" 대체:** Keep한 카드를 상단 강조(또는 정렬 상단 고정), 미Keep은 평상 표시. 트레이(`known`/`.tray`) 로직 제거. 노이즈 감소는 "Keep한 것만 강조"로 달성.
5. `Terms`의 `known`/`active` 분기 제거. 검색·그룹뷰 정렬은 유지하되 kept 우선 정렬 옵션 검토.

---

## 5. C2 — Summary 흡수

1. `Screen`에서 `"summary"` 제거. 대신 Keep 리스트 뷰를 둔다(별도 screen `"kept"`를 새로 두거나, Terms 내 토글로 통합 — §8 흐름에서 택1, 사용자 확인).
2. `buildSummary(s)`를 **kept 어휘 기준**으로 재작성: 태그 분류(dont/part/und) 제거, `s.terms.filter(t=>t.kept)` 목록으로 "핵심어 A·B·C를 짚었다" 수준의 문장 생성. `ctxInput`/`area`/`INTENT_LABEL` 골격은 유지.
3. `onCopy`/`onShare` 유지 — Keep 리스트 화면의 "메인 AI용으로 복사" 버튼으로 노출. Summary 전용 화면은 삭제.
4. `aiRefine`(유료 `/summarize` 호출): **유지하되 Keep 리스트에서 호출**. 혹은 1차 릴리스에서 보류 가능(결정 필요 — 보류 시 버튼만 숨기고 코드는 남김).
5. Terms 푸터의 `go("summary")` 버튼을 Keep 뷰 진입으로 교체.

---

## 6. C3 — 인덱스/히스토리 (`chrome.storage.local`, 서버 변경 0)

**저장 스키마(예):**
```
키: "sidetab:sessions"
값: [
  { id: string, topic: string, createdAt: number,
    area: string, locale: "en"|"ko",
    keptTerms: Array<{ term, kind, group, one_line, why, priority }> }
]
```
- **저장 시점:** Keep 토글 시 현재 세션 항목을 upsert(또는 "담은 어휘 보기"/세션 종료 시 일괄 저장). topic = 최초 `state.input`.
- **열람:** `Entry` 화면에 "이전 탐색" 리스트(topic + 날짜) 노출. 항목 클릭 시 그 세션의 `keptTerms`를 `terms`로 복원해 Keep 리스트(또는 Terms) 표시.
- **헬퍼:** 새 모듈 `sidepanel/history.ts` 권장. `getUserId()`와 같은 `chrome.storage.local` 우선 + `localStorage` 폴백 패턴 사용(개발 브라우저 호환).
- 항목 수 상한(예: 최근 30개)과 중복 topic 병합 규칙을 정한다.

---

## 7. 백엔드 / 계약 영향

- **C1·C3:** 프론트 전용. 계약 변경 **0건**.
- **C2:** `/summarize`와 `buildPrompt4`의 `vocab: {term, tag}[]`가 `Tag`("알아"|"몰라"|"적용모름")에 의존. Keep 전환 후 tag가 무의미해짐.
  - **권장(최소변경):** vocab의 `tag`를 전부 `"몰라"` 고정으로 보내 **계약 유지**. `Tag`/`Prompt4In` 손대지 않음. `aiRefine` 보류면 이 경로 자체가 비활성이라 영향 더 작음.
  - 대안: `Prompt4In`에서 `tag`를 optional로(계약 변경). **shared는 SoT라 신중** — 가능하면 권장안 채택.
- `shared/` 수정은 opus(메인 모델) 경유 원칙. 불가피하면 `types.ts`·`prompts/index.ts` 동시 정합 확인.

---

## 8. 화면 흐름 (구현 전 사용자 확인 필수)

```
Before: entry → narrow → terms(태그 3종) → summary → (paywall)
After : entry(+이전 탐색 리스트) → narrow → terms(Keep 토글) → kept(담은 어휘 + 복사 흡수) → (paywall)
```
- Keep 리스트를 **별도 screen("kept")** 로 둘지, **Terms 내 토글 뷰**로 둘지 한 가지를 사용자와 확정하고 진행.

---

## 9. 검증 절차

```
# 타입체크 + 이식성 가드
cd "sidetab" && npm run check

# 확장 빌드(로컬 워커 대상)
cd "sidetab/packages/extension" && VITE_WORKER_BASE=http://localhost:8787 npm run build

# 로컬 워커(실 API 통합 테스트 시)
cd "sidetab/packages/adapters/workers" && npx wrangler dev --port 8787
```
- mock 렌더는 dev 빌드(`VITE_WORKER_BASE` 없이 `import.meta.env.DEV`)에서 동작 — `api.ts`의 `USE_MOCK` 참조. `mock.ts`에 Keep/히스토리 관련 목 보강 필요할 수 있음.
- 실 브라우저: `chrome://extensions` → 개발자 모드 → 압축해제 로드 → `sidetab/packages/extension/dist`.

---

## 10. 주의사항 (반드시 읽기)

- **★ Claude Code 버그:** 도구 사용 직후 턴을 끝내면 하네스가 `Continue from where you left off.`를 자동 주입함(anthropics/claude-code #44459). 이걸 받으면 **`No response requested.`로 빈 종료하지 말고** 직전 도구 결과로 하던 작업을 마저 완성할 것. 전역 `~/.claude/CLAUDE.md`의 work-recovery 항목 참조.
- **백그라운드 프로세스(wrangler 등)는 세션 교체마다 죽음** — 실 테스트 시점에 재기동.
- **`manifest.json`의 `host_permissions`에 `http://localhost:8787/*` 없음** — 라이브 통합(크롬↔로컬 워커) 시 추가해야 통신됨. 현재 `https://sidetab-api.example.workers.dev/*`만 있음.
- **App.tsx 큰 편집은 Edit 단위로 쪼갤 것**(한 응답에 긴 prose + 긴 payload 동시 금지 — truncation으로 도구 호출이 잘림).
- `panel.html`(루트)은 UI 정본 프로토타입. 변경 폭이 크면 동기화 여부 판단.

---

## 11. 권장 작업 순서

1. §8 화면 흐름을 사용자에게 확인(별도 screen vs 토글).
2. C1(태그→Keep) 구현 → `npm run check` → 빌드.
3. C2(Summary 흡수) 구현 → 검증.
4. C3(히스토리 저장·열람) 구현 → 검증.
5. 실 브라우저 시각 확인(서버 재기동 + manifest localhost 임시 추가).
6. 커밋 전 루트 `README.md` 갱신(전역 규칙).
