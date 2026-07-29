# C3 S4b 스펙 — AI로 더 정리 (SoT §1·§3-1에서 파생)

> 상위 = [C3-웹랜딩.md](C3-웹랜딩.md). 앞 = [C3-S4](C3-S4-담기와게이팅.md) · [C3-S5a](C3-S5a-로그인.md).
> 규칙: P-1~P-10 (10건)

## 0. 범위

- **포함**: `/summarize` 출력을 `PrimerDoc`으로 개편(서버 계약·프롬프트·타입) · pro 게이팅 UX · 담은 어휘 화면의 "AI로 더 정리".
- **제외**: 구조화 구체화 아키네이터(FR-607 `/refine-primer`, C5) · 프라이머 서버 저장(S5) · 실 결제(C5).

## 1. 계약 변경

`/summarize`가 `Prompt4Out` 대신 `PrimerDoc`을 돌려준다.

| 항목 | 현재 `Prompt4Out` | `PrimerDoc` |
|---|---|---|
| 어휘 | `vocab: {term, tag}[]` | `known_terms: string[]` · `unknown_terms: string[]` |
| 맥락 | `context_object` + `context_sentence` | `context_note?` |
| 로케일 | 없음 | `locale` |
| 붙여넣기 본문 | `paste_text`(서버가 만듦) | **없음. 클라가 구조에서 조립한다** |

`paste_text`가 사라지는 것이 이 개편의 핵심이다. FR-604가 요구하는 것은 항목형 구조(분야 / 하려는 것 / 내 상황 / 아는·모르는 어휘 / 참고 맥락)이고, 붙여넣을 한 덩어리는 그 구조에서 파생된다. 서버가 완성 문장을 만들면 로케일을 바꾸거나 형식을 손볼 때마다 서버를 다시 불러야 하고, FR-607의 `refined`를 나중에 얹을 자리도 없다.

## 2. 게이트 충돌과 해소

`prompt-parity`는 v1 프롬프트 문구 94개가 v2에 전부 남아 있는지 검사한다. `summarize.ts`를 고치면 그 중 일부가 사라져 게이트가 실패한다.

**해소**: 베이스라인을 갱신한다(`prompt-parity.mjs --gen`이 아니라 손으로 해당 문구만 제거). 근거는 코드규약 §7의 이식 기준이다 — 무손실 이식 대상은 프롬프트 문구이지만, **SoT가 명시적으로 개편을 지시한 프롬프트는 예외**다. 패리티 게이트는 **의도치 않은 소실**을 막는 장치이지 의도된 변경을 막는 장치가 아니다.

단 조건이 붙는다. 베이스라인에서 지우는 문구는 **`/summarize` 프롬프트에 속한 것만**이다. 다른 프롬프트의 문구가 함께 사라지면 그것은 사고다.

## 3. 동작 규칙

| # | 규칙 | 근거 |
|---|---|---|
| P-1 | `/summarize`는 `PrimerDoc`을 돌려준다. `paste_text`를 만들지 않는다 | FR-604 구조화 |
| P-2 | 붙여넣을 본문은 클라가 `PrimerDoc`에서 조립한다. S4의 기본 정리와 같은 자리에서 같은 방식으로 | 서버 왕복 없이 형식·로케일 변경 |
| P-3 | 어휘는 태그로 갈라 `known_terms`와 `unknown_terms`에 넣는다 | PrimerDoc 정의 |
| P-4 | 프라이머 문구는 메인 AI에게 어휘를 다시 설명하라고 지시하지 않는다 | FR-604. 어휘는 이미 아는 맥락으로 전제 |
| P-5 | 값이 없는 항목은 생략한다 | FR-604 |
| P-6 | pro 전용이다. free가 누르면 페이월로 끌고 가지 않고 그 자리서 알린다 | SoT §4 `gate(/summarize)` 402 `PRO_ONLY`, S4 K-7 |
| P-7 | 실패해도 기본 정리는 그대로 남는다. AI 정리는 기본 정리를 대체하지 않고 덧붙는다 | 무비용 경로가 유료 경로 실패에 끌려가면 안 된다 |
| P-8 | 같은 담은 어휘 조합에 대해 이미 받은 프라이머는 다시 부르지 않는다 | pro 호출은 비싸다. S3b 상세 캐시와 같은 규칙 |
| P-9 | 어휘를 한 줄 설명에 이을 때 동일성 판단은 담기와 같은 정규화를 쓴다. 표기는 사용자가 카드에서 본 것을 따른다 | S4 K-2. 서버는 맨 문자열을, 카드는 괄호 원어를 가진다("안티와인드업" vs "안티와인드업 (Anti-Windup)"). 정확 일치로 이으면 설명이 통째로 떨어진다 |
| P-10 | 형태가 어긋난 `/summarize` 응답은 `ready`가 아니라 실패다. 형태 검사는 통신 경계 한 곳에서 한다 | P-7. 타입 선언은 컴파일 때만 있어 캐스팅만 하면 어긋난 응답이 렌더 도중 터져 화면 전체가 죽는다 |

## 4. 파일

```
packages/shared/src/types/pipeline-io.ts   Prompt4Out 제거, summarize 반환을 PrimerDoc으로
packages/shared/src/pipeline-contract.ts   Pipeline.summarize 시그니처
packages/shared/src/guards.ts              isPrimerDoc — 통신선 형태 검사(P-10)
packages/core/src/prompts/summarize.ts     구조화 출력으로 재작성
packages/core/src/pipeline.ts              반환 매핑
packages/adapters/local/src/mocks/mock-llm.ts  픽스처 판별 토큰과 SUMMARIZE 픽스처
packages/scripts/prompt-baseline.v1.txt    summarize 문구만 제거
packages/ui-shared/src/api/http-client.ts  send의 guard 인자와 summarize 검사(P-10)
packages/ui-shared/src/api/port.ts         summarize 추가
packages/ui-shared/src/screens/kept/
  ├ primer.ts        상태 타입과 순수 로직 전부. 본문 조립(P-2)·캐시 키(P-8)·실패 분류(P-6)·표시 본문 결정(P-7)
  ├ usePrimer.ts     호출과 캐시 보관. 판단은 primer.ts가 한다
  └ KeptScreen.tsx   "AI로 더 정리" 버튼과 결과 렌더
```

목 픽스처는 프롬프트의 포맷 지시 토큰으로 골라진다. 프롬프트를 고치면 판별이 조용히 어긋나므로 `e2e-local`이 `/summarize`까지 관통해야 한다.

## 5. 검증

`e2e-keep.mjs`를 확장한다(새 파일을 만들지 않는다). 서버 쪽은 `e2e-local.mjs`가 본다.

| 케이스 | 기대 |
|---|---|
| PrimerDoc → 붙여넣기 본문 | known/unknown이 갈려 들어가고, 빈 항목은 줄이 없다 (P-3·P-5) |
| 기본 정리와 AI 정리 | 같은 조립 함수를 쓴다 (P-2) |
| 402 PRO_ONLY | 잠김 상태, 기본 정리는 그대로 (P-6·P-7) |
| 같은 어휘 조합 재요청 | 호출 없음 (P-8) |
| 어휘 조합 변경 | 새로 호출 |
| 괄호 원어 표기 차이 | 한 줄 설명이 붙고, 표기는 카드 그대로 (P-9) |
| 옛 형태·필드 누락 응답 | `isPrimerDoc` 거부 → 실패 상태, 기본 정리 유지 (P-10) |
| `/summarize` 관통 | 200 · PrimerDoc 형태 · `paste_text` 없음 (P-1) |

`prompt-parity`는 베이스라인 갱신 후 통과해야 하며, **summarize 외 프롬프트의 문구 수가 줄지 않았음**을 커밋에서 확인한다.

## 6. 열린 항목

- 없음. `PrimerDoc.locale`은 서버가 채운다(출력 로케일을 아는 쪽이 서버다).
