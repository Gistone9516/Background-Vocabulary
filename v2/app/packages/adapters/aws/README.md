# @vock/aws

AWS 실행 계층 어댑터 — Lambda Function URL(RESPONSE_STREAM) 부트 + RDS Data API SqlRunner + Secrets Manager. 같은 http-app을 AWS에서 띄운다. **배포 게이트 코드**: 로컬 스모크 불가(실 Aurora/Secrets 필요), 첫 AWS 실행에서 검증한다.

## 구조
```
src/
├ index.ts            공개 배럴(buildAwsDeps·DataApiSqlRunner·loadSecrets) — handler는 제외
├ handler.ts          Lambda 진입점(streamHandle). 콜드 스타트 1회 초기화. 핸들러=dist/handler.handler
├ deps.ts             buildAwsDeps(DataApiSqlRunner+실 공급자+Secrets → AppDeps)
├ data-api-runner.ts  SqlRunner의 Data API 구현($n→:pn·Field 매핑·트랜잭션). 리포는 그대로 재사용
└ secrets.ts          Secrets Manager 로더(VockSecrets JSON)
```

## 환경변수(Lambda)
`SECRET_ID`(Secrets Manager) · `DB_RESOURCE_ARN` · `DB_SECRET_ARN` · `DB_NAME` · `AWS_REGION`(도쿄 ap-northeast-1).

## 검증 상태
- 타입체크(tsc -b)로 @aws-sdk 사용이 API-정확함을 확인(컴파일 = SDK 타입 계약 충족).
- 실호출 스모크(Data API 파라미터/Field 매핑·streamHandle SSE·Secrets)는 **핸즈온 배포 세션**에서. 상세 = `../../DEPLOY.md`.
