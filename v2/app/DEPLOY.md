# AWS 배포 — 핸즈온 세션 체크리스트 (C2.5)

C2.1~C2.4 코드는 로컬(Docker PG)로 검증됐고, **aws 어댑터 코드(@vock/aws)는 타입체크만** 됐다(로컬 스모크 불가). 실배포는 당신의 AWS 계정·크레덴셜·실비용이 필요한 협업 단계다. Cloud-OP 포트폴리오 목적에 맞춰 함께 진행한다.

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
- [ ] Lambda(Node 20 ESM) + **Function URL(RESPONSE_STREAM)** + 환경변수(SECRET_ID·DB_RESOURCE_ARN·DB_SECRET_ARN·DB_NAME·AWS_REGION) + IAM(rds-data·secretsmanager:GetSecretValue).
- [ ] CloudFront + S3(웹/랜딩, C3 배포 시).

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
