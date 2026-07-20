# 축3: 백엔드·인프라 후보 조사 (AWS vs Cloudflare vs 하이브리드)

조사일 2026-07-21. 표기: [fact-cited]=출처 확보, [assumption]=출처 없이 논리적 추정.

## 0. 결론 요약

**추천: 후보 A(AWS 전환), 단 DB는 DynamoDB가 아니라 "Aurora Serverless(PostgreSQL) + RDS Data API"로.**

- 클라우드 운영 포트폴리오 축을 명시적으로 가중하라는 사용자 지시를 반영하면, v1이 처음부터 포트-어댑터로 설계된 이유("어댑터 추가만으로 AWS 이식 가능")가 실제로 발동할 차례다. Hono는 `hono/aws-lambda`에 `streamHandle`을 공식 지원해 SSE 스트리밍까지 어댑터 교체만으로 이관 가능하다[fact-cited].
- 다만 DB를 DynamoDB로 가면 스키마를 단일테이블 NoSQL로 완전 재설계해야 해 "어댑터만 추가"라는 전제가 깨진다. Aurora(PostgreSQL 호환) + Data API 조합은 D1과 마찬가지로 **HTTP 기반 바인딩 접근**이라 커넥션 풀링 문제도 없고[fact-cited], SQL 스키마도 거의 그대로 재사용 가능해 이식 비용이 가장 낮다.
- 비용은 CF Workers+D1보다 확실히 비싸다(월 최소가 CF는 $0, AWS는 사실상 $5~20대). 이 차이를 "교육비"로 볼지는 사용자 판단 영역이라 정직하게 병기한다.
- Cognito는 요구사항이 이미 "자체 JWT(내부 user_id) 유지"를 못박았으므로 Cognito 전면 도입은 요구사항과 충돌한다. Google 연동만 Cognito Identity Pool(또는 Google IdP 직결 자체 OAuth)로 처리하고 내부 JWT는 자체 발급하는 절충을 권한다(§C-3).

---

## 1. 후보 비교표

| 항목 | A. AWS 스택 | B. CF Workers+D1(현행) | C. 하이브리드 |
|---|---|---|---|
| 컴퓨트 | Lambda (Node/Hono, Function URL 스트리밍) | Workers (V8 isolate) | 프론트 AWS(S3+CF) + API는 CF Workers 유지, 또는 그 역 |
| DB | Aurora Serverless(PG)+Data API 권장, DynamoDB는 비권장(§A-2) | D1(SQLite) | 유지 대상 스택에 종속 |
| 인증 | 자체 JWT + Google OAuth 직결(Cognito는 선택) | 자체 JWT + Google OAuth 직결(현행) | 좌동 |
| 정적 호스팅 | S3+CloudFront | Workers(같은 워커) 또는 Pages | S3+CloudFront (교육가치 확보) |
| 월 비용(1만 사용자 규모, LLM API 비용 제외) | 약 $10~30(§A-6) | 약 $0~5(§B) | 약 $10~25 |
| 이식 노력(v1 대비) | 중(DB는 Data API로 낮음, 컴퓨트는 어댑터 교체) | 없음(현행) | 중~상(스택 분리 관리 부담 추가) |
| 클라우드 운영 포트폴리오 가치 | 높음(IAM·Lambda·CloudWatch·CDK/SAM·EventBridge·CloudFront 전부 실습) | 낮음(CF 고유 생태계, 이력서 임팩트 약함) | 중(AWS 부분만큼만) |
| 운영 복잡도 | 상(리전·IAM·VPC 여부·모니터링·IaC 관리 대상 多) | 하(현행 그대로) | 상(두 클라우드 계정·CORS·모니터링 이원화) |

---

## 2. 후보 A: AWS 스택 상세

### A-1. 컴퓨트 및 SSE 스트리밍

- **Lambda 응답 스트리밍은 2026년 4월 전체 상용 리전으로 확대됐다**[fact-cited: [AWS What's New 2026/04](https://aws.amazon.com/about-aws/whats-new/2026/04/aws-lambda-response-streaming/)].
- 두 경로가 있다.
  - **Lambda Function URL + `RESPONSE_STREAM`**: API Gateway를 완전히 우회. 15분까지 스트리밍 가능, API Gateway 요청과금이 없음[fact-cited: [Lambda Function URL 문서/블로그 종합](https://aws.amazon.com/blogs/compute/introducing-aws-lambda-response-streaming/)]. 단점은 **Function URL이 커스텀 도메인을 네이티브 지원하지 않음** — CloudFront를 origin으로 앞에 둬야 하고, 이때 `AllViewerExceptHostHeader` origin request policy 설정이 필요하다[fact-cited: [CloudFront+Lambda Function URL 가이드](https://zirkelc.dev/posts/aws-lambda-function-url-iam-cloudfront)].
  - **API Gateway REST API 스트리밍**: 2025년 11월 REST API에 응답 스트리밍(`STREAM` transfer mode)이 추가돼 최대 15분 타임아웃까지 지원[fact-cited: [API Gateway 응답 스트리밍 발표](https://aws.amazon.com/about-aws/whats-new/2025/11/api-gateway-response-streaming-rest-apis/)]. 단, **HTTP API(v2, 저가형)는 스트리밍 미지원** — REST API($3.5/백만 요청)로 가야 하는데 이는 HTTP API($1/백만 요청)보다 71% 비싸다[fact-cited: [API Gateway 가격 비교](https://apigatewaycost.com/aws)]. 사용량 계획(usage plan)·API 키·WAF 통합이 필요하면 REST API, 아니면 Function URL+CloudFront가 더 저렴.
  - **권장**: Function URL(RESPONSE_STREAM) + CloudFront(커스텀 도메인·WAF 부착) 조합. API Gateway 비용을 아끼면서 CloudFront는 어차피 정적 호스팅용으로 필요하니 인프라 재사용.
- **Hono 어댑터**: `hono/aws-lambda`의 `streamHandle()`이 Lambda Response Streaming을 그대로 지원 — `handle` 대신 `streamHandle`로 export만 바꾸면 됨[fact-cited: [Hono AWS Lambda 문서](https://hono.dev/docs/getting-started/aws-lambda)]. v1의 core/shared가 Web Standard Request/Response만 쓰는 포트-어댑터 구조라면 이 축은 정말로 "어댑터 교체"만으로 끝난다.
- **비용 주의점(중요, 자체 확인 필요)**: Lambda는 GB-seconds 과금으로 **호출이 살아있는 벽시계 시간(대기 포함) 전체**가 과금 대상이다[fact-cited: [Lambda 가격 페이지 근거](https://aws.amazon.com/lambda/pricing/)]. 반면 CF Workers는 CPU 시간만 과금되고 LLM/검색 API 응답을 기다리는 I/O 대기 시간은 과금되지 않는다는 것이 Workers 상품의 핵심 차별점으로 알려져 있다[assumption: 이번 조사에서 "Workers는 I/O 대기 제외, CPU만 과금"이라는 문장을 CF 공식 pricing 페이지에서 명시적으로 재확인하지 못함 — 기존 CF 공식 문서·업계 통설로는 맞으나 이번 세션에서 1차 출처 재확인 못 함, 확인 필요 항목으로 하단에 재기재]. 이 구조 때문에 LLM 스트리밍처럼 I/O 대기가 긴 워크로드는 Lambda가 Workers보다 GB-초 기준으로 더 비쌀 잠재 리스크가 있다 — 실사용 트래픽으로 벤치마크 필요.

### A-2. 데이터베이스: DynamoDB vs Aurora Serverless vs RDS 인스턴스

세 옵션을 실제로 비교했다.

**DynamoDB (on-demand)**
- 온디맨드 모드는 월 250만 RRU + 250만 WRU가 상시 무료(12개월 한정이 아님), 스토리지도 25GB까지 상시 무료[fact-cited: [DynamoDB 가격](https://aws.amazon.com/dynamodb/pricing/)]. 1만 사용자 규모라면 **사실상 DB 비용이 $0에 수렴할 가능성이 높다.**
- 그러나 v1의 D1(SQLite, 관계형)을 단일테이블 NoSQL로 재설계해야 함 — 이건 어댑터 교체가 아니라 **데이터 모델·쿼리 로직 재작성**이다. "어댑터 추가만으로 이식 가능"이라는 v1의 하드 제약과 정면으로 충돌. 포트폴리오 관점에서 DynamoDB 단일테이블 설계 자체는 시장 가치가 있지만, 이번 결정에서는 이식 비용이 축4를 크게 깎는다.

**Aurora Serverless (PostgreSQL 호환)**
- 2026년 4월 "Aurora Serverless v2"가 "Aurora serverless"로 리브랜딩되며 **0 ACU까지 스케일다운(scale-to-zero)을 정식 지원**하기 시작했다[fact-cited: [AWS 블로그, scale to zero](https://aws.amazon.com/blogs/database/aurora-serverless-faster-performance-enhanced-scaling-and-still-scales-down-to-zero/)]. 유휴 시 ACU 과금이 없고 스토리지만 과금되므로, 트래픽이 뜨문뜨문한 1만 사용자 규모에서 상시 최소과금($0.5 ACU 상시가동 시 약 $44/월[fact-cited: [Aurora Serverless v2 최소비용 가이드](https://www.usage.ai/blogs/aws/rds/aurora-serverless-v2/)])을 피할 수 있다.
- **커넥션 문제**: Lambda는 호출마다 새 DB 커넥션을 여는 경향이 있어 관계형 DB의 최대 커넥션 수를 쉽게 고갈시킨다. 표준 해법인 RDS Proxy는 Aurora Serverless와 조합 시 **최소 8 ACU 상당을 과금**해(ACU당 $0.015/시간 × 8 × 730시간 ≈ 월 $87.6) 소규모 프로젝트에는 배보다 배꼽이 크다[fact-cited: [RDS Proxy 가격/최소과금](https://www.usage.ai/blogs/aws/reserved-instances/rds/proxy-cost/)].
- **해법 = RDS Data API.** 2023년 말 Aurora PostgreSQL 호환판에 Data API가 추가됐고, HTTP 엔드포인트로 SQL을 실행하며 **커넥션 관리·풀링을 AWS가 대신 처리**해 RDS Proxy가 필요 없다[fact-cited: [Aurora PostgreSQL Data API 발표](https://aws.amazon.com/about-aws/whats-new/2023/12/amazon-aurora-postgresql-rds-data-api/), [Data API 재설계 상세](https://aws.amazon.com/blogs/database/introducing-the-data-api-for-amazon-aurora-serverless-v2-and-amazon-aurora-provisioned-clusters/)]. 2026년 기준도 활성 지원[fact-cited: 동일 출처군].
- **이식 관점의 강점**: D1도 원래 Workers 바인딩(HTTP 유사 RPC)으로 접근하는 구조라, Data API의 "HTTP로 SQL 실행" 모델이 D1 어댑터와 형태적으로 가장 유사하다. 어댑터 계층만 D1 클라이언트 → Data API 클라이언트로 바꾸면 되고, 스키마(DDL)도 SQLite→PostgreSQL 변환만 필요해 DynamoDB 전환보다 압도적으로 이식이 쉽다.
- 권장: **Aurora Serverless(PostgreSQL) + Data API**, RDS Proxy는 도입하지 않음.

**RDS 단일 인스턴스(db.t4g.micro)**
- 온디맨드 $0.016/시간 ≈ 월 $11.68[fact-cited: [db.t4g.micro 가격](https://aiven.io/tools/instances/db.t4g.micro)], 신규 계정은 12개월 무료(750시간/월)[fact-cited: [RDS 프리티어](https://aws.amazon.com/rds/pricing/)]. 다만 **2025-07-15 이후 신규 가입자는 舊 방식 12개월 무료 대신 Free Plan/Paid Plan 중 선택** 구조로 바뀌어 무료 혜택 적용 여부를 계정 생성 시점 기준으로 재확인해야 한다[fact-cited: [RDS 프리티어 변경 공지](https://aws.amazon.com/rds/pricing/)].
- 트래픽이 항상 일정하다면 Aurora Serverless(scale-to-zero 활용 안 하는 상시가동)보다 저렴할 수 있으나, Data API가 없어(RDS Data API는 Aurora 전용) 결국 커넥션 풀링을 직접 구현하거나 Lambda 동시성 제한을 걸어야 함 — 관리 부담이 다시 올라간다. 소규모+트래픽 변동 있는 이 프로젝트엔 Aurora Serverless+Data API가 더 적합.

### A-3. 인증: Cognito vs 자체 JWT

- 제품 요구사항이 이미 "Google SSO + 자체 JWT(내부 user_id)"로 못박혀 있음. Cognito를 인증의 정본으로 전면 도입하면 내부 user_id 연속성 요구와 충돌 소지가 있다(Cognito sub을 내부 user_id로 강제 치환해야 함).
- Cognito 무료 티어는 Lite/Essentials 등급 기준 월 1만 MAU까지 무료(직접/소셜 로그인 기준, 상시 무료 — 12개월 제한 아님)이지만, **SAML/OIDC 페더레이션 로그인은 별도로 월 50 MAU까지만 무료**라는 예외가 있다[fact-cited: [Cognito 가격](https://aws.amazon.com/cognito/pricing/)]. Google 로그인은 소셜 IdP 경로라 1만 MAU 무료 구간에 해당할 가능성이 높지만, 이 구간 분류(소셜 vs OIDC 페더레이션)를 실제 콘솔에서 확인 필요.
- Cognito 요금 체계가 2025~2026년 개편되며 "복잡하고 비용이 예측하기 어렵다"는 업계 비판이 있었다[fact-cited: [The Stack, Cognito 가격 개편 비판](https://www.thestack.technology/awss-new-cognito-pricing-complicated-potentially-costly/)].
- **대안(자체 JWT 유지, 권장)**: Lambda에서 `google-auth-library`로 Google ID 토큰을 검증하고, 자체 `jsonwebtoken`으로 내부 user_id를 담은 JWT를 발급하는 패턴이 실사례로 문서화돼 있다[fact-cited: [AWS Lambda + Google Auth 구현 가이드](https://blog.stackademic.com/aws-lambda-and-google-authentication-a-comprehensive-implementation-guide-061635b46700)]. 이는 v1의 현행 방식과 동일한 구조이므로 **인증 로직은 사실상 포팅 불필요, Lambda 핸들러로 감싸기만 하면 됨.**
- 절충안(포트폴리오 가치를 살리고 싶다면): Cognito Identity Pool/User Pool에 Google IdP만 연동해 "Cognito 설정·IAM 페더레이션 실습" 경험은 얻되, Cognito가 내준 토큰을 검증한 뒤 최종적으로는 자체 서명 JWT(내부 user_id)를 다시 발급하는 브로커 계층을 둘 수 있음. 단 이건 순수 비용/일정 관점에서는 불필요한 레이어 추가이므로 "학습 목적 한정" 옵션으로 명시.

### A-4. 정적 웹 호스팅: S3 + CloudFront

- CloudFront 무료 플랜: 월 100GB + 100만 요청 영구 무료, 이후 Pro $15/월(50TB+1000만 요청)[fact-cited: [CloudFront 프리티어/플랜](https://go-cloud.io/amazon-cloudfront-pricing/)]. AWS 오리진(S3 등)→CloudFront 엣지 전송은 무료, CloudFront→최종 사용자 전송(DTO)만 과금[fact-cited: 동일 계열 출처].
- 소규모 정적 사이트는 대체로 월 $2~12 수준[fact-cited: [S3+CloudFront 비용 가이드](https://bdwebit.com/blog/cost-of-hosting-static-website-on-aws-complete-pricing-guide/)].
- S3+CloudFront+ACM(인증서)+OAC(Origin Access Control) 조합은 클라우드 운영 실무에서 매우 흔한 구성이라 포트폴리오 서사에 직접 활용 가능(IAM 정책, 캐시 무효화, WAF 부착 등 실습 포인트가 많음).

### A-5. 크론: EventBridge Scheduler

- 월 1,400만 회 호출까지 무료(리전 합산 아닌 전역 기준, 영구 무료), 이후 $1/백만 회[fact-cited: [EventBridge Scheduler 가격](https://aws.amazon.com/eventbridge/pricing/)]. cron·rate·1회성·유연 시간창 전부 지원. 이 프로젝트 규모의 크론(도메인 근거 캐시 갱신 등)은 전 구간 무료로 커버될 것.

### A-6. 레이트리밋 방식

- API Gateway 사용량 계획(usage plan)은 **API 키 단위로만 제한**되고, JWT의 user_id나 IP 단위 제한은 네이티브로 안 된다[fact-cited: [API Gateway 사용량 계획 한계](https://irensaltali.com/the-complete-guide-to-aws-api-gateway-rate-limiting-throttling-2026/)].
- AWS WAF의 rate-based rule은 집계 키를 IP·헤더 등으로 구성 가능하지만 표준 패턴은 IP 기반이고, per-user(JWT sub) 세밀 제한은 커스텀 Lambda authorizer + 카운터 스토어 조합이 정석[fact-cited: [WAF rate-based rule 문서](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based.html), [Rate limiting 3계층 설명](https://oneuptime.com/blog/post/2026-02-12-implement-api-rate-limiting-with-api-gateway-and-waf/view)].
- 카운터 스토어 후보: ElastiCache Serverless(Valkey 최소 약 $6.13/월, Redis OSS는 최소 약 $91/월로 훨씬 비쌈)[fact-cited: [ElastiCache Serverless 가격 비교](https://upstash.com/blog/aws-elasticache-pricing-explained-2026-full-cost-breakdown)] 또는 DynamoDB(조건부 원자적 증가, 무료 티어 내 수렴 가능성).
- **핵심 발견**: v1이 이미 쓰는 **Upstash Redis는 REST API 기반 서드파티 SaaS라 AWS Lambda에서도 그대로 재사용 가능**하다(원래 Vercel/CF Workers/Deno 등 TCP 소켓을 못 쓰는 엣지·서버리스 환경에서도 동작하도록 REST 인터페이스로 설계된 제품)[assumption: 이 서술은 Upstash 제품 설계 취지에 대한 일반 지식이며, 이번 세션에서 "Lambda에서 Upstash 사용" 사례를 직접 1차 출처로 재확인하지는 못함 — 확인 필요 항목에 재기재]. 사실이면 레이트리밋 계층은 **포팅 비용 0**으로 그대로 재사용 가능해 축4 평가가 크게 개선된다.

### A-7. 월 비용 추정(1만 사용자 규모, LLM/검색 API 비용 제외)

| 구성요소 | 추정 월 비용 |
|---|---|
| Lambda(요청+GB-초, free tier 상당 소진 가정) | $0~10 |
| Function URL + CloudFront | $0~5(요청량이 CloudFront 무료 100만 이내면 $0) |
| Aurora Serverless(scale-to-zero, Data API) | $0~10(유휴 구간 스토리지만, 활성 구간만 ACU 과금) |
| S3(정적 자산) | $1 미만 |
| EventBridge Scheduler | $0(무료 티어 내) |
| 레이트리밋(Upstash 유지 시) | 기존과 동일(변화 없음) |
| **합계** | **약 $10~30/월** |

CF Workers+D1 현행 추정치(프로젝트 기존 `docs/비용수익_예측.md` 참고, 이번 조사에서 재검증은 안 함)는 이보다 낮은 $0~5대로 알려져 있어, AWS 전환은 확정적으로 비용 증가를 수반한다. 이 증가분이 "클라우드 운영 학습 투자"로서 타당한지는 사용자 판단.

---

## 3. 후보 B: CF Workers + D1 유지 (현행)

- Workers 무료 티어: 일 10만 요청, 요청당 CPU 10ms, 128MB 메모리, 요청당 서브리퀘스트 50개[fact-cited: [Workers 가격](https://developers.cloudflare.com/workers/platform/pricing/)].
- D1 무료 티어: 일 500만 행 읽기, 10만 행 쓰기, 총 5GB 스토리지[fact-cited: 동일 계열, [D1 가격](https://developers.cloudflare.com/d1/platform/pricing/)].
- 유료 플랜은 계정당 월 $5부터, 1000만 요청/3000만 CPU-ms 포함, 초과 시 요청 $0.30/백만·CPU $0.02/백만ms[fact-cited: [Workers 가격 페이지](https://developers.cloudflare.com/workers/platform/pricing/)].
- Cron Trigger는 무료 플랜 계정당 5개, 유료 250개, 최소 간격 1분[fact-cited: [Cron Triggers 문서](https://developers.cloudflare.com/workers/configuration/cron-triggers/)].
- **네이티브 Rate Limiting 바인딩 존재**: Workers 런타임에 내장된 Rate Limiting API가 있어(Wrangler 4.36.0+), 별도 Redis 없이도 요청 단위 제한을 엣지에서 저지연으로 처리 가능[fact-cited: [Rate Limiting 바인딩 문서](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)]. v1이 Upstash Redis를 쓰는 이유가 레이트리밋 외 다른 용도(세션/캐시)도 있다면 이 바인딩은 대체재라기보다 추가 선택지.
- 이미 실서비스가 이 스택에서 동작 중이므로 이식 비용 0, 운영 복잡도 최저. 다만 이력서/포트폴리오 관점에서 "CF Workers 운영 경험"은 AWS 생태계 대비 채용시장 인지도가 낮다는 것이 사용자가 명시한 특수 평가축의 전제.

---

## 4. 후보 C: 하이브리드

두 방향을 검토했다.

**C-1. 정적 자산만 AWS(S3+CloudFront), API는 CF Workers+D1 유지**
- 프론트엔드 배포·CDN 운영만 AWS 실습 대상이 됨(S3 버킷 정책, OAC, ACM, 캐시 무효화, WAF). API 쪽 학습 기회(Lambda, IAM 실행 역할, VPC 여부 판단, CloudWatch 로그 인사이트, Data API 등)는 포기.
- 크로스 오리진(CORS) 설정과 두 클라우드 계정의 로그·모니터링을 병행 관리해야 해 운영 복잡도는 오히려 늘어나는데, 포트폴리오 임팩트는 "일부만 AWS"라 절반짜리.

**C-2. API는 AWS Lambda, 정적 자산은 CF Pages/R2 유지**
- 반대로 API(핵심 로직·LLM 파이프라인·인증·과금)만 AWS로 옮기고 프론트는 CF에 남기는 방향. API 쪽이 이 프로젝트의 핵심 IP·복잡도가 몰린 부분이라 학습 가치는 이쪽이 더 크지만, 여전히 계정 두 개·모니터링 두 벌 운영 부담이 남는다.
- CORS·쿠키 도메인(SSO 세션) 설계가 두 클라우드 간 분리로 더 까다로워짐 — 유지보수성 하드룰(계층 분리는 하되 이중 스택 남용 금지)과 충돌 소지.

**평가**: 하이브리드는 "포트폴리오 가치 대비 관리 부담"에서 전량 이관(A)보다 열위. 부분 이관은 이력서에 "AWS S3/CloudFront 운영" 정도의 얕은 임팩트만 남기고, API 이관 없이는 IAM·Lambda·모니터링·IaC 같은 핵심 클라우드 운영 스킬은 못 얻는다. C는 **전량 이관이 정치적/일정상 부담스러울 때의 단계적 이행 경로**로만 의미가 있음(1단계: S3+CloudFront로 정적 자산 이관해 저위험으로 AWS 계정·IAM·CDK 익히기 → 2단계: API를 Lambda로).

---

## 5. 기각 대안 및 사유

- **DynamoDB를 1차 DB로 채택**: 무료 티어·비용 면에서는 최선이지만, v1의 관계형 스키마를 단일테이블 NoSQL로 전면 재설계해야 해 "어댑터 추가만으로 이식 가능"이라는 하드 제약과 정면 충돌. 포팅 비용이 이 축의 점수를 크게 깎아 비권장.
- **API Gateway REST API + Lambda(Function URL 대신)**: REST API가 사용량 계획·WAF·API 키 등 부가기능은 많지만, HTTP API보다 3.5배 비싸고 커스텀 도메인은 Function URL+CloudFront 조합으로도 해결되므로 굳이 REST API 과금을 얹을 이유가 약함. WAF 세밀 제어가 조직적으로 꼭 필요해지면 그때 REST API로 전환 검토.
- **Cognito를 인증 정본으로 전면 채택**: 요구사항이 "자체 JWT(내부 user_id) 유지"를 명시했고, Cognito 요금 체계 개편 이후 예측 어려움에 대한 업계 비판도 있어 정본 인증 시스템으로는 과잉.
- **RDS Proxy 도입**: Aurora Serverless와 조합 시 최소 8 ACU 상당(월 약 $87.6)이 강제돼 소규모 프로젝트엔 부적합. Data API로 대체.
- **RDS 단일 인스턴스(db.t4g.micro) 채택**: 상시 트래픽이면 저렴할 수 있으나 Data API가 없어 커넥션 관리를 직접 해야 하고, 프리티어도 2025-07-15 이후 신규 계정은 예전만큼 관대하지 않을 수 있음. Aurora Serverless+Data API보다 이점이 불명확.
- **하이브리드(C) 전면 채택**: 이중 클라우드 운영 부담이 포트폴리오 이득 대비 큼. 단계적 전환 경로로서만 남겨둠.

---

## 6. 리스크 및 확인 필요 사항

1. **[확인 필요] CF Workers가 "CPU 시간만 과금, I/O 대기 제외"라는 통설을 이번 세션에서 CF 공식 문서로 재확인하지 못함.** 이 프로젝트의 LLM 스트리밍(대기시간 김) 워크로드에서 Lambda(GB-초, 벽시계 시간 과금) 대비 Workers가 실제로 얼마나 저렴한지는 실측 벤치마크 또는 CF 공식 pricing/billing 문서 재확인 필요 — A-6 비용 비교의 정확도에 직접 영향.
2. **[확인 필요] Upstash Redis의 AWS Lambda 호환성.** REST 기반이라 이론상 Lambda에서도 동작해야 하나, 이번 조사에서 "Lambda+Upstash" 실사례를 1차 출처로 검증하지 못함. 사실이면 레이트리밋 계층 이식 비용이 0에 가까워지므로 축4 점수에 영향이 크다 — 착수 전 PoC로 확인 권장.
3. **Google 로그인이 Cognito 무료 티어의 "소셜 로그인 1만 MAU 무료" 구간에 드는지, 아니면 "OIDC 페더레이션 50 MAU 무료" 구간에 드는지**는 Cognito를 절충안(§A-3)으로 채택할 경우 콘솔에서 재확인 필요(가격 문서상 문구가 다소 모호했음).
4. **Aurora Serverless scale-to-zero의 재기동 지연(cold resume latency)**을 확인 안 함 — 유휴 후 첫 요청이 로그인/추천 SSE 첫 응답에 지연을 줄 수 있어 사용자 체감 영향 실측 필요.
5. **RDS 프리티어 정책 변경(2025-07-15 기준 신규/기존 계정 분기)**이 실제 사용할 AWS 계정에 어떻게 적용되는지 계정 생성일 기준 재확인 필요.
6. 본 문서의 CF Workers+D1 비용 수치는 기존 프로젝트 문서(`docs/비용수익_예측.md`)를 참고했다고 언급했으나 **이번 조사에서 그 문서를 재확인(재정독)하지 않았음** — 최종 결정 전 해당 문서의 최신 숫자와 교차검증 필요.

---

## 7. 출처 목록

- [AWS Lambda 응답 스트리밍 전체 리전 확대(2026/04)](https://aws.amazon.com/about-aws/whats-new/2026/04/aws-lambda-response-streaming/)
- [API Gateway 응답 스트리밍 소개 블로그](https://aws.amazon.com/blogs/compute/building-responsive-apis-with-amazon-api-gateway-response-streaming/)
- [API Gateway 응답 스트리밍 개발자 문서](https://docs.aws.amazon.com/apigateway/latest/developerguide/response-transfer-mode.html)
- [API Gateway REST API 응답 스트리밍 발표(2025/11)](https://aws.amazon.com/about-aws/whats-new/2025/11/api-gateway-response-streaming-rest-apis/)
- [AWS Lambda 응답 스트리밍 소개 블로그](https://aws.amazon.com/blogs/compute/introducing-aws-lambda-response-streaming/)
- [Hono AWS Lambda 어댑터 공식 문서](https://hono.dev/docs/getting-started/aws-lambda)
- [Hono aws-lambda 어댑터 소스(streamHandle)](https://github.com/honojs/hono/blob/main/src/adapter/aws-lambda/index.ts)
- [Cloudflare Workers 가격](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare D1 가격](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare Workers Cron Triggers 문서](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare Rate Limiting 바인딩 문서](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [AWS Lambda 가격](https://aws.amazon.com/lambda/pricing/)
- [Amazon Cognito 가격](https://aws.amazon.com/cognito/pricing/)
- [The Stack, Cognito 가격 개편 비판 기사](https://www.thestack.technology/awss-new-cognito-pricing-complicated-potentially-costly/)
- [AWS Lambda + Google 인증 구현 가이드(Stackademic)](https://blog.stackademic.com/aws-lambda-and-google-authentication-a-comprehensive-implementation-guide-061635b46700)
- [Amazon DynamoDB 가격](https://aws.amazon.com/dynamodb/pricing/)
- [Aurora 가격](https://aws.amazon.com/rds/aurora/pricing/)
- [Aurora Serverless v2 최소 비용/ACU 가이드(Usage.ai)](https://www.usage.ai/blogs/aws/rds/aurora-serverless-v2/)
- [Aurora Serverless scale-to-zero 발표 블로그](https://aws.amazon.com/blogs/database/aurora-serverless-faster-performance-enhanced-scaling-and-still-scales-down-to-zero/)
- [Aurora PostgreSQL Data API 지원 발표(2023/12)](https://aws.amazon.com/about-aws/whats-new/2023/12/amazon-aurora-postgresql-rds-data-api/)
- [Aurora Serverless v2/provisioned Data API 재설계 블로그](https://aws.amazon.com/blogs/database/introducing-the-data-api-for-amazon-aurora-serverless-v2-and-amazon-aurora-provisioned-clusters/)
- [RDS Proxy 가격 및 Aurora Serverless 조합 시 최소과금](https://www.usage.ai/blogs/aws/reserved-instances/rds/proxy-cost/)
- [Amazon RDS 가격(프리티어 정책 변경 포함)](https://aws.amazon.com/rds/pricing/)
- [db.t4g.micro 시간당 가격](https://aiven.io/tools/instances/db.t4g.micro)
- [Amazon ElastiCache Serverless 가격 비교(Upstash 블로그)](https://upstash.com/blog/aws-elasticache-pricing-explained-2026-full-cost-breakdown)
- [Amazon CloudFront 가격](https://go-cloud.io/amazon-cloudfront-pricing/)
- [S3+CloudFront 정적 사이트 비용 가이드](https://bdwebit.com/blog/cost-of-hosting-static-website-on-aws-complete-pricing-guide/)
- [Amazon EventBridge 가격](https://aws.amazon.com/eventbridge/pricing/)
- [API Gateway 가격 비교(REST vs HTTP)](https://apigatewaycost.com/aws)
- [API Gateway 사용량 계획/레이트리밋 가이드](https://irensaltali.com/the-complete-guide-to-aws-api-gateway-rate-limiting-throttling-2026/)
- [AWS WAF rate-based rule 문서](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based.html)
- [API Gateway+WAF 레이트리밋 구현 가이드](https://oneuptime.com/blog/post/2026-02-12-implement-api-rate-limiting-with-api-gateway-and-waf/view)
- [Lambda Function URL + CloudFront 커스텀 도메인 가이드](https://zirkelc.dev/posts/aws-lambda-function-url-iam-cloudfront)

---

## 검증 정정

조사일 2026-07-21, 독립 재검증. 원문(§1~§7)은 그대로 두고 아래에 정정·보강만 추가함. 표기: [확인됨]=재검색으로 사실 확정, [오류]=원문이 틀림, [누락]=원문에 없던 신규 항목, [불확실]=확인했으나 낮은 신뢰.

### 정정 1 — [오류] DynamoDB "온디맨드 모드 상시 무료 250만 RRU/WRU"는 사실이 아님 (§A-2)
- 원문: "온디맨드 모드는 월 250만 RRU + 250만 WRU가 상시 무료... 사실상 DB 비용이 $0에 수렴할 가능성이 높다."
- 재검증(AWS 공식 DynamoDB Pricing 페이지 직접 확인): **DynamoDB Always Free 티어는 프로비저닝(provisioned) 용량 모드에만 적용**되며, 정확한 항목은 리전당 "25 WCU + 25 RCU + 25GB 스토리지 + 스트림 읽기 250만 회"다. **온디맨드(on-demand) 모드 테이블은 첫 요청부터 과금**되고 이 무료 티어 대상이 아니다. 즉 §A-2 소제목이 "DynamoDB (on-demand)"인데 본문 서술은 프로비저닝 모드 무료 티어 수치를 온디맨드에 잘못 적용한 것.
- 영향: DynamoDB는 어차피 스키마 재설계 문제로 기각된 후보라 **최종 추천(후보 A, Aurora Serverless+Data API)은 그대로 유지**되지만, "DynamoDB가 비용 면에서는 최선"이라는 §5의 보조 근거는 과장이었음 — 온디맨드로 쓰면 비용도 무조건 $0은 아니고 트래픽에 비례해 즉시 과금된다. 프로비저닝 모드로 25 RCU/WCU 안에 맞추면 무료가 될 수 있으나 이는 처리량 상한을 직접 관리해야 하는 별개 설계.
- 출처: [DynamoDB Pricing 공식 페이지](https://aws.amazon.com/dynamodb/pricing/)

### 정정 2 — [누락] RDS Data API는 리전이 4곳으로 한정, 서울(ap-northeast-2) 미포함
- 원문(§A-2, §6)에 지역 제약 언급이 없었음. 재검증 결과 **Aurora PostgreSQL Data API 지원 리전은 us-east-1(버지니아), us-west-2(오레곤), eu-central-1(프랑크푸르트), ap-northeast-1(도쿄) 4곳뿐**이며 **서울(ap-northeast-2)은 미지원**이다.
- 영향: 이 프로젝트가 한국 사용자 대상 서비스(사이드탭/Vock note)라는 점을 고려하면, Data API를 쓰려면 도쿄 리전을 선택해야 해 서울 대비 지연시간이 늘어난다. 이는 추천을 뒤집을 정도는 아니지만(포트폴리오 목적상 리전 선택 자체가 큰 문제는 아님), §A-2·§6에 빠진 실질적 제약이므로 최종 리전 결정 전에 명시적으로 고려해야 함.
- 출처: [RDS Data API 지원 리전/엔진](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.Aurora_Fea_Regions_DB-eng.Feature.Data_API.html)

### 정정 3 — [확인됨] CF Workers "CPU 시간만 과금, I/O 대기 제외"는 사실 — §6-1의 "확인 필요" 해제
- 원문이 스스로 [assumption]으로 낮춰 표기하며 "재확인 못 함"이라 명시했던 항목. 재검증 결과 **Cloudflare 공식 문서·블로그에서 명시적으로 확인됨**: Workers는 실행 중인 CPU 시간만 과금하고, DB/LLM 응답을 기다리는 I/O 대기 시간은 과금 대상이 아니다. Cloudflare는 이를 "duration이 아닌 CPU 시간 기준 과금을 제공하는 유일한 글로벌 서버리스 플랫폼"이라고 자체 명시.
- 영향: 이 프로젝트처럼 LLM 스트리밍(I/O 대기 김)이 많은 워크로드에서 **Lambda(GB-초, 벽시계 시간 과금)가 Workers 대비 구조적으로 더 비쌀 수 있다는 원문의 리스크 경고는 추정이 아니라 확정된 사실**이다. 다만 이는 원문이 이미 "AWS 전환은 비용 증가를 수반, 교육비로 볼지는 사용자 판단"이라고 정직하게 병기해둔 부분이라 **추천 자체를 뒤집지는 않음** — 오히려 원문의 비용 증가 경고를 강화하는 방향.
- 출처: [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Cloudflare 블로그 "never pay to wait on I/O again"](https://blog.cloudflare.com/workers-pricing-scale-to-zero/)

### 정정 4 — [확인됨] Upstash Redis REST API의 Lambda 호환성 — §6-2의 "확인 필요" 해제
- 원문이 [assumption]으로 표기했던 항목. 재검증 결과 **Upstash 공식 블로그·문서에 "AWS Lambda + Upstash Redis" 사례가 다수 직접 존재**함(Go/Python 예제, "Stateful AWS Lambda with Redis REST" 등). REST 기반이라 커넥션 관리 불필요, Lambda·Workers·Deno 등 서버리스 환경 전반에서 쓰도록 설계된 제품이 맞음.
- 영향: 레이트리밋 계층(Upstash)의 AWS 이식 비용이 사실상 0이라는 원문의 낙관적 판단이 확정됨. 이 축은 축4(이식 비용) 평가에 긍정적으로 반영해도 됨.
- 출처: [Upstash 블로그: AWS Lambda + Redis REST](https://upstash.com/blog/aws-lambda-redis-rest), [Upstash 사용 사례 문서](https://upstash.com/docs/redis/overall/usecases)

### 정정 5 — [확인됨, 정확] 나머지 핵심 사실 주장 재검증 결과 (오류 없음)
아래 항목들은 원문 그대로 재확인됨(정정 불필요, 신뢰도만 상향):
- Hono `hono/aws-lambda`의 `streamHandle()`이 Lambda Response Streaming을 지원 — 공식 문서로 확인.
- AWS Lambda 응답 스트리밍이 2026년 4월 전체 상용 리전으로 확대 — AWS 공식 발표로 확인.
- API Gateway HTTP API(v2)는 응답 스트리밍 미지원, REST API만 지원 — AWS 공식 문서로 확인.
- Aurora Serverless v2가 2026년 4월 "Aurora serverless"로 리브랜딩되며 0 ACU 스케일다운 정식 지원 — AWS 공식 블로그로 확인.
- RDS Proxy를 Aurora Serverless와 조합 시 최소 8 ACU(약 월 $87.6) 강제 과금 — 복수 출처로 확인.
- Cognito 무료 티어(직접/소셜 로그인 1만 MAU, SAML/OIDC 페더레이션 50 MAU)와 Lite/Essentials/Plus 신규 요금체계 — 공식 페이지로 확인.
- CloudFront 무료 플랜(월 100GB+100만 요청 영구 무료) — 확인됨. 단, **추가로 발견된 사실**: 이와 별개로 "1TB 데이터 전송 + 1000만 요청" 규모의 상시 무료 티어도 병행 존재한다는 자료가 있어(레거시 AWS Free Tier 프로그램), 원문이 제시한 CF 비용 추정치는 오히려 보수적(=실제 비용이 원문 추정보다 낮을 가능성)일 수 있음[불확실: 두 무료 티어 프로그램의 공존 여부·적용 조건이 출처마다 서술이 갈려 완전히 확정하지는 못함].
- EventBridge Scheduler 월 1,400만 회 상시 무료(전역 기준) — 확인됨.
- API Gateway REST API가 HTTP API보다 "71% 비싸다"는 표현 — 업계 표준 계산 관행((3.5-1)/3.5)과 일치, 오류 아님.

### 정정 6 — [누락] 유력 대안 탐색: Aurora DSQL (신규 AWS 네이티브 서버리스 분산 SQL, PostgreSQL 호환)
- 원문에 없던 후보. **Aurora DSQL**은 AWS가 내놓은 완전 서버리스 분산 SQL DB로 PostgreSQL 호환, 유휴 시 완전 스케일제로(사용량 0시 DPU 과금 없음), **월 10만 DPU + 1GB 스토리지가 만료 없는 상시 무료**로 Aurora Serverless보다 무료 구간이 넉넉하다[fact-cited: AWS 공식 DSQL 가격 페이지].
- 그러나 **Data API 같은 HTTP 기반 접근 방식이 없고**, 표준 PostgreSQL 드라이버(psycopg, node-postgres, JDBC)로 IAM 토큰 인증하며 접속하는 구조라, 이 문서가 §A-2에서 강조한 "D1과 형태적으로 가장 유사한 HTTP 이식 경로"라는 이식 장점은 DSQL에는 적용되지 않는다[fact-cited: AWS DSQL 커넥터 발표].
- 판정: **추천을 뒤집을 근거는 아님** — Aurora Serverless+Data API가 이 프로젝트의 "이식 용이성" 우선순위에는 여전히 더 부합. 다만 무료 티어·운영 단순성만 놓고 보면 DSQL이 매력적인 후보이므로, 착수 전 짧은 PoC로 "Data API 없이 표준 드라이버+커넥션풀링 라이브러리로도 Lambda 콜드스타트 지연이 허용 범위인지"를 확인해볼 가치는 있음[불확실: DSQL 자체가 2025년 하반기 GA된 비교적 신제품이라 실전 사례·성숙도가 Aurora Serverless 대비 검증량이 적음].
- 출처: [Aurora DSQL 공식 소개](https://aws.amazon.com/rds/aurora/dsql/), [Aurora DSQL 가격](https://aws.amazon.com/rds/aurora/dsql/pricing/), [Aurora DSQL 커넥터 발표](https://aws.amazon.com/about-aws/whats-new/2025/11/aurora-dsql-python-node-js-jdbc-connectors-iam/)

### 최종 판정
**원문의 최종 추천(후보 A: AWS 전환, DB는 DynamoDB 대신 Aurora Serverless+Data API)은 유지.** 재검증에서 발견된 것은 ① DynamoDB 온디맨드 무료 티어 서술 오류(어차피 기각된 대안이라 결론 불변) ② RDS Data API 서울 리전 미지원(신규 제약, 리전 선택 시 고려 필요) ③ CF Workers CPU-only 과금·Upstash Lambda 호환성은 [assumption]에서 [확인됨]으로 격상(원문 판단이 맞았음을 강화) ④ Aurora DSQL이라는 검토 안 된 대안 존재(추천을 뒤집진 않으나 PoC 가치 있음). 뒤집힘 없음, 단 §A-2 텍스트와 리전 선택 부분은 수정 권고.
