# @vock/scripts

경계 게이트·품질 검사·e2e 스모크 도구. TS 빌드 대상이 아니라 `.mjs` 툴링이다(루트 tsconfig 참조에 없음). 전부 실행 CWD = `v2/app` 기준.

## 게이트
| 스크립트 | 명령 | 검사 |
|---|---|---|
| `portability-guard.mjs` | `pnpm guard` | core/shared 런타임·공급자 누수, 프론트 프롬프트 유출(SoT §0-1·§8) |
| `check-file-size.mjs` | `pnpm size` | 소스 파일 300행 상한(코드규약 §1), 200행 초과 경고 |
| `prompt-parity.mjs` | `pnpm prompt-parity` | v1 골든 베이스라인의 모든 프롬프트 문구가 v2 core/prompts에 보존(§2-1·§8) |
| `e2e-local.mjs` | `pnpm e2e` | local 부트로 /classify→/next→/recommend 관통(mock LLM, 빌드 선행 필요) |

경계 게이트 3중의 나머지 둘 = TS 프로젝트 레퍼런스(`pnpm build` = `tsc -b`)와 dependency-cruiser(`pnpm cruise`). 전체는 `pnpm gate`.

## 프롬프트 베이스라인
`prompt-baseline.v1.txt` = v1 `shared/prompts/index.ts`에서 추출한 프롬프트 문구 골든 스냅샷. 의도된 프롬프트 변경 시에만 `node packages/scripts/prompt-parity.mjs --gen`으로 갱신하며, 그 diff는 리뷰 대상이다.
