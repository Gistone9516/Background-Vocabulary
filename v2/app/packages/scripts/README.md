# @vock/scripts

경계 게이트·품질 검사·e2e 스모크 도구. TS 빌드 대상이 아니라 `.mjs` 툴링이다(루트 tsconfig 참조에 없음). 전부 실행 CWD = `v2/app` 기준.

## 게이트
| 스크립트 | 명령 | 검사 |
|---|---|---|
| `portability-guard.mjs` | `pnpm guard` | core/shared 런타임·공급자 누수, 프론트 프롬프트 유출(SoT §0-1·§8) |
| `check-file-size.mjs` | `pnpm size` | 소스 파일 300행 상한(코드규약 §1), 200행 초과 경고 |
| `prompt-parity.mjs` | `pnpm prompt-parity` | v1 골든 베이스라인의 모든 프롬프트 문구가 v2 core/prompts에 보존(§2-1·§8) |
| `check-i18n.mjs` | `pnpm check-i18n` | 로케일별 자리표시자 일치·빈 값·ko 복사 흔적(S-19). 키 집합 일치는 `Record<StringKey, string>` 타이핑이 tsc에서 막으므로 검사하지 않는다. AI 작성분 건수를 보고한다(S-37) |
| `e2e-local.mjs` | `pnpm e2e` | local 부트로 /classify→/next→/recommend 관통(mock LLM, 빌드 선행 필요) |

경계 게이트 3중의 나머지 둘 = TS 프로젝트 레퍼런스(`pnpm build` = `tsc -b`)와 dependency-cruiser(`pnpm cruise`). 전체는 `pnpm gate`.

## 이식 도구 (게이트 아님)
`measure-i18n-port.mjs` = v1→v2 문구 이식 대상을 A/B/C/D로 가르고 교차 검증 5건을 출력한다. `port-i18n.mjs` = v1 원문과 스펙 §6-2 초안표에서 `strings.{en,ja,zh}.ts`·`strings.origin.ts`를 생성한다(`--write`). 둘 다 통과·실패를 판정하지 않으므로 `gate` 체인에 없다 — 이식이 끝나면 A·C가 0으로 수렴하는 것이 정상이고, 그때 실패를 내면 게이트가 거짓말을 한다.

## 프롬프트 베이스라인
`prompt-baseline.v1.txt` = v1 `shared/prompts/index.ts`에서 추출한 프롬프트 문구 골든 스냅샷. 의도된 프롬프트 변경 시에만 `node packages/scripts/prompt-parity.mjs --gen`으로 갱신하며, 그 diff는 리뷰 대상이다.
