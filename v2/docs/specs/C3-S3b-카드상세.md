# C3 S3b 스펙 — 카드 상세 (SoT §1·§3-1·§4에서 파생)

> 상위 = [C3-웹랜딩.md](C3-웹랜딩.md). 앞 = [C3-S3](C3-S3-난이도와어휘생성.md).
> v1 코드는 **동작 명세로만** 쓴다. 구조는 계승하지 않는다(코드규약 §6~§9).

## 0. 범위

- **포함**: `/detail` 호출 · 카드 펼치기 · what·whymine·how 3단 렌더 · 출처 목록 · 무료 열람 횟수 게이팅 UX · 열람 캐시.
- **제외**: 그룹별 추가 생성(담기와 그룹 UI가 S4에 오므로 함께) · 담기(S4) · 세션 저장(S5).

### 0-1. 상위 스펙에서 벗어나는 결정 1건

| 항목 | S3 스펙 | 제안 | 사유 |
|---|---|---|---|
| 그룹별 추가 생성 | S3b | **S4로 이월** | 그룹 머리(`.grouphead`)와 그 옆 생성 버튼은 카드가 그룹으로 묶여 있을 때만 의미가 있다. 그룹 묶기는 담기·정리 UI(S4)와 함께 와야 한다. 지금 붙이면 그룹이 하나뿐인 목록에 버튼만 뜬다 |

## 1. v1에서 계승하는 동작

| # | 규칙 | 출처 | 근거 |
|---|---|---|---|
| D-1 | 카드를 누르면 펼쳐지고 다시 누르면 접힌다. 한 번에 하나만 열린다 | v1 `openId` 단일 값 | 여러 개가 열리면 목록이 길어져 비교가 어렵다 |
| D-2 | 이미 받아 온 상세는 다시 부르지 않는다 | v1 상세 캐시 | 같은 카드를 접었다 펴는 것에 과금하지 않는다 |
| D-3 | 무료는 세션당 상세 열람 횟수가 제한된다. 서버가 402로 막는다 | SoT §4 `gate(/detail)`, `detailLimitFree` | 상세는 RAG를 태우는 비싼 호출이다 |
| D-4 | 상세는 what·whymine·how 3단으로 보여 준다 | `Prompt5Out` | v1이 확정한 구조. deepen은 폐기 유지 |
| D-5 | 출처가 비어 있으면 출처 없음을 표시한다. 지어내지 않는다 | `Prompt5Out.sources` 주석 "애매하면 빈 배열(프론트 폴백)" | 근거 없는 귀속이 더 나쁘다 |
| D-6 | 펼친 카드로 화면을 부드럽게 이동한다 | v1 `scrollIntoView` | 목록 아래쪽 카드를 펼치면 내용이 화면 밖에 생긴다 |

## 2. v1 구조에서 바꾸는 것

| v1 | 문제 | v2 |
|---|---|---|
| 펼침 애니메이션(340ms)이 끝나기를 `setTimeout(60)`으로 어림잡아 스크롤 | 타이밍 상수 두 개가 서로를 추측한다. 느린 기기에서 어긋난다 | 애니메이션 종료 이벤트를 듣거나 스크롤을 CSS에 맡긴다. 시간 상수를 두지 않는다 |
| 상세 열람 수를 클라가 세어 미리 막음 | 서버 카운터와 두 벌이 되어 어긋난다(S2에서 없앤 이중 카운터와 같은 문제) | **클라는 세지 않는다.** 서버 402를 받아 그때 안내한다. 남은 횟수 표시는 `/usage`가 정본 |
| 상세 상태가 카드 목록 상태에 섞임 | 어느 카드가 로딩인지 오류인지 조합이 불명확 | 열린 카드 하나의 상세만 별도 상태로 두고 phase로 표현 |

**D-3 처리 방식이 이 슬라이스의 핵심 결정이다.** v1은 클라가 세어 미리 막았다. v2는 세지 않는다. 카운터를 둘 두지 않는다는 규칙(코드규약 §8)을 그대로 적용한다.

## 3. 파일 구조

```
packages/ui-shared/src/
├ api/port.ts            detail 추가
└ screens/terms/
   ├ detail-machine.ts   열기·닫기·로딩·캐시·오류 전이
   ├ useDetail.ts        React 배선
   └ TermDetail.tsx      3단 본문과 출처
```

`TermsScreen`은 카드 렌더에 상세 영역을 끼우는 것만 바뀐다. 200행을 넘으면 카드 하나를 `TermCardView`로 분리한다.

## 4. 계약

```ts
detail(input: Prompt5In, signal?: AbortSignal): Promise<Prompt5Out>;

export type DetailState =
  | { phase: "closed" }
  | { phase: "loading"; id: string; runId: number }
  | { phase: "open"; id: string; out: Prompt5Out }
  | { phase: "locked"; id: string; message: string }   // 무료 열람 소진(402)
  | { phase: "failed"; id: string; error: ApiError };
```

- 캐시는 `id → Prompt5Out` 맵. 열려 있는 카드가 캐시에 있으면 호출하지 않는다(D-2).
- `Prompt5In`은 어휘와 세션 맥락에서 만든다. `connection_hint`는 연결 턴 산물이라 S5까지 비운다.

## 5. 검증

`e2e-detail.mjs`를 게이트에 추가한다.

| 케이스 | 기대 |
|---|---|
| 카드 열기 | phase=loading, callDetail 명령 |
| 도착 | phase=open, 캐시에 저장 |
| 같은 카드 다시 열기 | 즉시 open, **호출 명령 없음**(D-2) |
| 다른 카드 열기 | 이전 닫힘, 새 호출(D-1) |
| 열린 카드 다시 누르기 | phase=closed |
| 402 pro/무료 소진 | phase=locked, 안내 메시지 보존(D-3) |
| 네트워크 실패 | phase=failed, 재시도 가능 |
| runId 불일치 응답 | 상태 불변 |
| 로딩 중 다른 카드 열기 | 이전 요청 abort |

## 6. 함께 처리하는 것

- 상세 구간 `tokens.css`(`.readbtn`·`.detail`·`.dparts`·`.dsteps`·`.dsub`·`.dmemo`·`.related`·`.src`·`.nosrc`)를 rem으로 옮긴다.
- 문구는 v1 원문을 확인하고 그대로 쓴다. 새로 쓰는 것만 `[신규]` 표시.

## 7. 열린 항목

- 남은 열람 횟수를 화면에 보여 줄지는 `/usage` 연동과 함께 S4에서 정한다. S3b는 소진 시점에만 안내한다.
