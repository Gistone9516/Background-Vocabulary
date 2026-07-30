# AWS 배포 — 핸즈온 세션 체크리스트 (C2.5)

C2.1~C2.4 코드는 로컬(Docker PG)로 검증됐고, **aws 어댑터 코드(@vock/aws)는 타입체크만** 됐다(로컬 스모크 불가). 실배포는 당신의 AWS 계정·크레덴셜·실비용이 필요한 협업 단계다. Cloud-OP 포트폴리오 목적에 맞춰 함께 진행한다.

> 이 문서는 인프라 목표 2단계 중 **1차(AWS 배포)**의 체크리스트다. 2차(리눅스 직접 구축·운영)는 루트 `README.md`의 v2 방향 절을 참조한다.

## 0. 먼저 정할 결정 (당신 몫)
- **IaC 도구**: CDK(TypeScript, AWS 친화·포트폴리오 인기) vs SAM(Lambda 특화·간결) vs Terraform(멀티클라우드·업계 표준). Cloud-OP 지향이면 CDK 또는 Terraform 추천. 선택 후 그 도구로 아래 리소스를 코드화한다. (이 결정 전까지 IaC 템플릿은 미작성.)

## 1. 사전 준비
- [ ] AWS 계정 + IAM 사용자(관리 권한) + `aws configure`(AWS CLI 설치).
- [ ] 리전 = **ap-northeast-1(도쿄)** — 서울은 Data API 미지원(ADR).
- [ ] Google Cloud Console: OAuth 클라이언트 2개(web/desktop) 발급 → client_id/secret.
- [ ] DeepSeek·Tavily·Upstash 실키(Upstash는 서버리스라 필수).

## 2. 프로비저닝(IaC로 코드화)
- [ ] Aurora Serverless v2(PostgreSQL) + **Data API 활성화** + DB 시크릿(Secrets Manager).
- [ ] Secrets Manager 시크릿 1개(JSON = `VockSecrets` 형태: jwtSecretCurrent·jwtKid·deepseekKey·tavilyKey·upstash{url,token}·google{web,desktop}).
- [ ] Lambda(**nodejs22.x**, ESM) + **Function URL(RESPONSE_STREAM)** + 환경변수(SECRET_ID·DB_RESOURCE_ARN·DB_SECRET_ARN·DB_NAME·AWS_REGION, 선택: **VOCK_ALLOWED_ORIGINS**[콤마 구분 — CORS와 clientCheck 웹 표식이 같은 목록]·**VOCK_CLIENT_CHECK=1**[명시적으로 켬]) + IAM(rds-data·secretsmanager:GetSecretValue). Secrets JSON에 선택 키 둘(C4 S2): `google.desktop{clientId,clientSecret}`(콘솔 등록 후), `desktopClientToken`(x-vock-client 표식 — 비밀 아님, NFR-308). **데스크톱 웹뷰 Origin 실측값(C4 S5 설치본) = `http://tauri.localhost`** — VOCK_ALLOWED_ORIGINS에 웹 도메인과 함께 이 값을 넣는다. curl 증명 완료(허용 시 ACAO 반환·타 Origin 거부).

## 데스크톱 패키징 (C4 S5 — 무서명. 서명·업데이터는 인증서 결정 뒤)

재현 절차(Windows, 관리자 불요):
```
cd packages/desktop
VITE_API_BASE=<실 API 절대 URL>  corepack pnpm exec tauri build
# 산출: src-tauri/target/release/bundle/nsis/vock-note_<버전>_x64-setup.exe (스모크 실측 4.1MB)
# 설치: setup.exe /S  → %LOCALAPPDATA%\vock-note (per-user, HKCU 언인스톨 등록)
```
- `VITE_API_BASE` 미주입 시 vite 단계에서 빌드가 깨진다(D-3 — 의도된 실패). 스모크는 로컬 mock
  (`http://127.0.0.1:8787`) 주입으로 했다 — 실배포는 CloudFront/Function URL 절대 주소.
- 형식 = **NSIS 단일**(`bundle.targets`): per-user 설치라 관리자 승인이 필요 없다(이 세션에서
  원격 중 UAC 불가를 실측한 것이 근거). v2 업데이터는 NSIS 지원이라 후일 그대로 잇는다.
- identifier `kr.co.bewe.vocknote` / productName `vock-note`는 **S5에서 확정** — 설치 후 바꾸면
  다른 앱으로 취급된다.
- ★SmartScreen: 로컬 빌드 파일은 MOTW(다운로드 표식)가 없어 경고가 **뜨지 않았다** — 실배포
  경로(웹 다운로드)에서의 경고는 미실측이며, 그것이 서명 인증서 지출 판단의 실측 항목이다.
- **서명 + 업데이터(FR-905) 선행 조건**: ① OV 인증서(사용자 지출 결정, 연 $200~300) →
  ② bundle 서명 설정 → ③ updater 플러그인 + 서명 공개키 + 배포 엔드포인트 → ④ 업데이트 왕복
  스모크. **서명 없는 업데이터는 켜지 않는다**(NFR-604와 쌍 — C4 완료 기준 원문).
  - 런타임은 로컬 개발 환경과 맞춘다(로컬 Node 22.x, `package.json` engines `>=22`). 최초 문서는 Node 20으로 적혀 있었으나 Node 20은 2026년 4월경 업스트림 지원이 끝나 폐기 대상이다(2026-07-28 정정).
  - **배포 직전에 AWS 공식 런타임 표에서 nodejs22.x의 폐기 예정일을 직접 확인할 것.** 이 문서 작성 시점에 정확한 날짜를 확정하지 못했다. 표: `https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html`
- [ ] CloudFront + S3(웹/랜딩, C3 배포 시). **경로 분할(S6 L-7): 랜딩 = `/`, 앱 SPA = `/app`.**
      한 버킷·한 오리진을 공유하고 두 빌드가 모두 `dist/`를 뿜으므로 접두어를 갈라 올려야 서로
      덮어쓰지 않는다. 랜딩 자산 폴더는 `_landing`으로 고정해 두었다(`astro.config.mjs`).

## 3. 마이그레이션
- [ ] Aurora에 `packages/adapters/persistence/migrations/*.sql` 적용. `migrate()`는 문장 단위 분리라 Data API로도 실행 가능(DataApiSqlRunner 주입). 1회성 마이그레이션 Lambda 또는 로컬에서 Data API로 실행.

## 4. 배포 + 스모크(실 LLM 1회 — SoT §9 C2 완료 기준)
- [ ] Lambda 배포(핸들러 = `dist/handler.handler`). 번들: 워크스페이스 dist + node_modules.
- [ ] 스모크: `/health` → `/auth/google`(실 code) → `/classify`(실 DeepSeek) → `/recommend`(실 SSE 스트리밍) → CRUD(Data API 왕복). **여기서 DataApiSqlRunner 파라미터/Field 매핑·streamHandle 취소 거동을 실측 검증**.
- [ ] Data API 제약 실측: 트랜잭션 3분·응답 1MB(커서 페이지네이션 동작 확인).

## 5. 검증 후 코드 보정 지점(예상)
- DataApiSqlRunner의 jsonb 바인딩(현재 stringValue+`::jsonb` 캐스트) — 실패 시 typeHint 'JSON' 추가.
- BIGINT longValue가 문자열로 오면 asNum이 흡수(이미 대응).
- streamHandle 취소(§5 aws 보완: 스트림당 토큰·개수 상한) 실측 후 조정.
