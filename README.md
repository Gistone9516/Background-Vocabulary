# 배경어휘 사이드탭

> **한 줄 정체:** AI에게 말 걸기 전, 그 분야의 말그릇(핵심 어휘)을 클릭만으로 쥐여주는 **크롬 확장(MV3)** — 자기 전공 밖으로 무언가 만들려는 "교차전공 빌더(탑다운)"를 위한 어휘 준비 도구. 영어 웹 RAG로 근거를 잡아 한국어 말그릇으로 변환한다.

**현재 단계:** buildflow 구현 진행 중 — **태그→Keep 전환 + 로컬 라이브 통합(실 API)까지 완료·검증**. 다음 = 프로덕션 배포(Cloudflare 로그인 필요, `배경어휘-사이드탭-배포-가이드.md`).

---

## 폴더 구조

| 위치 | 내용 |
|---|---|
| `sidetab/` | **실제 코드(npm workspaces 모노레포).** 백엔드(Workers+Hono) + 크롬 확장. 상세=`sidetab/README.md` |
| `panel.html` | **UI 정본 프로토타입**(단일 HTML, 5화면 전체 흐름·문구류 테마). 프론트 이식의 기준이자 최신 기획 |
| `배경어휘-사이드탭-인터페이스계약.md` | **빌드 SoT** — 프론트↔백엔드 단일 계약(이식성 불변 §0-1 포함). 충돌 시 이 문서가 권위 |
| `배경어휘-사이드탭-기획-구체화.md` | 메인 기획(v1.5). 설계·결정 단일 출처(§11 서비스화) |
| `배경어휘-사이드탭-구현계획.md` | "어떻게 짓는가"(v1.2 — 스택·아키텍처·게이트) |
| `배경어휘-사이드탭-이관.md` | 진행 핸드오프 |
| `.env` | API 키 4종(DeepSeek/Tavily/Upstash) — **커밋 금지** |
| `_archive/` | 과거 산출물(기획·검증·정확도·비용·하니스·구 프로토타입). git 제외, 로컬 참조용 |

---

## 기획·설계 핵심

- **타깃·범위:** 교차전공 빌더(탑다운), 저위험(기술·창작·비즈니스). 고위험(의료·법률 개인판단)은 **부드러운 거부**(이유 설명 + 재시도 유도).
- **모델·RAG:** DeepSeek-V4(`flash` 무료 / `pro` 유료) + **RAG 전 티어 필수**. thinking OFF + term 단위 스트리밍. **영어 검색 → 한국어 출력**(검색 로케일은 진입 분류에서 1회 결정론적 확정).
- **요금제:** freemium(무료 flash 주 7회 / 유료 pro 무제한). "AI로 더 정리"(LLM 요약)는 유료 전용.
- **★ 이식성 불변(1순위 제약):** Cloudflare Workers 지금 / AWS Lambda 나중을 **어댑터 추가만으로**. `core/`·`shared/`는 런타임 전역 0건(웹표준 + 인터페이스 DI), 런타임 특수성은 `adapters/`에만. `npm run guard`가 위반 시 빌드 실패.
- **권위 규칙:** 제품 동작·UX·필드 = `panel.html`(최신 기획). 인프라(로케일·RAG·안전 게이트) = 백엔드.

## 아키텍처 (`sidetab/`)

```
shared/    계약 SoT(타입·인터페이스·프롬프트). core는 이 인터페이스에만 의존
core/      런타임 무관 로직: llm(DeepSeek SSE를 StreamEvent로) · rag · locale · pipeline
adapters/  workers(Hono·SSE 직렬화·게이팅) · search-providers(Tavily 영어전용) · lambda(보류)
extension/ MV3 사이드패널(React) — cycle 2에서 panel.html 5화면 이식
```

## 실행 / 빌드 / 검증 (`sidetab/` 기준)

```bash
npm install
npm run check                                             # 타입체크 + 이식성 가드
node --env-file=.env --import tsx packages/scripts/e2e.ts # 실런타임 e2e(실 API 호출)
npm -w @sidetab/extension run build                       # 확장 빌드(dist/)
# 워커 로컬 실행: packages/adapters/workers 에서 wrangler dev (.dev.vars에 키)
```

## 현재 상태 / 다음

- **cycle 1 완료·검증:** 프론트↔백엔드 계약 싱크(SoT)를 shared/core/adapters에 반영. 아키네이터 종료 신호(enough/confidence) · 어휘 상세 3단+출처 · "더 보기" exclude 페이지네이션 · 고위험 거부 · 취소 signal · /summarize 유료 게이팅. 타입체크 + 이식성 가드 + 실런타임 e2e 전부 PASS.
- **cycle 2 완료·검증:** `panel.html` 5화면을 React 확장(`sidepanel/`)으로 이식(theme.css=panel.html verbatim) + 5엔드포인트 배선(DEV는 mock, 빌드는 실 워커). 헤드리스 렌더 검증 통과(entry→classify→narrow→recommend 스트리밍→terms→detail 출처→summary, 콘솔 에러 0). vite 빌드 PASS, dist에 아이콘 포함.
- **cycle 2.1/2.2 + 직접입력 + 복수선택 완료:** 어휘 선정 철학 전환(개론 용어에서 실무 전문 용어·함정으로) · 아키네이터 직접 입력 버튼 + 적응형 입력 UI · 아키네이터 선택지 **무제한 복수 선택**(2개 cap 제거, buildPrompt1/2에 통합 보기 억제 문구).
- **태그→Keep 전환 완료(C1·C2·C3):** 어휘 카드 태그 {알아/몰라/적용모름}을 **단일 Keep 토글**로 교체(C1). Summary 화면 제거 후 **담은 어휘(kept) 뷰**에 복사·공유·AI정리 흡수(C2). 진입 입력 텍스트를 키로 한 **이전 탐색 히스토리**를 `chrome.storage.local`에 저장하고 entry에서 재열람·복원(C3). 백엔드·계약 변경 0건(클라이언트 전용, 저장은 `sidepanel/history.ts`). 실브라우저(vite mock) end-to-end 검증: entry→narrow→terms(Keep)→kept→히스토리 복원, 앱 콘솔 에러 0.
- **로컬 라이브 통합 완료·검증:** 로컬 실 워커(`npm -w @sidetab/workers run dev`, `.dev.vars` 실 키)에 확장 dev(`VITE_WORKER_BASE=http://127.0.0.1:8787`)를 붙여 실 DeepSeek+Tavily로 end-to-end 검증. `/classify`(실 분류·선택지)·`/recommend`(실 어휘 스트리밍)·`/detail`(실 3단 개념·관련어) 동작, Keep·히스토리·상세캐시 영속까지 확인, 앱 콘솔 에러 0. `manifest.json` host_permissions에 로컬 워커 주소 추가됨.
- **다음 — 프로덕션 배포(Cloudflare 로그인 필요, 사람 1회):** `배경어휘-사이드탭-배포-가이드.md` 참조. `wrangler login` → `wrangler secret put` ×4 → `npm -w @sidetab/workers run deploy` → 배포 URL을 빌드 `VITE_WORKER_BASE`와 manifest host_permissions에 반영.
- **별개 백로그:** detail 출처 영어화(한국어 분야는 "확인된 출처 없음"으로 나옴) · Pretendard self-host(MV3 CSP) · userId 익명 게이팅(Tier3). 상세는 `배경어휘-사이드탭-사용자판단대기.md`.
