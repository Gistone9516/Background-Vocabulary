# v2/docs/specs — 사이클별 파생 스펙 (정본 인덱스)

각 구현 사이클/하위 단계 착수 전 SoT(`../인터페이스계약-v2.md`)에서 파생하는 ≤400행 스펙. SoT가 상위 정본이고 여기는 구현 단위 결정을 명문화한다. 스펙 추가·폐기 시 이 인덱스 갱신이 커밋 조건.

| 스펙 | 사이클 | 범위 | 상태 |
|---|---|---|---|
| [C2.1-영속계층.md](C2.1-영속계층.md) | C2 | 세션·자산·지식·프로젝트 서버 정본(타입·리포·PG 스키마·CRUD) | 구현 완료(Docker PG e2e 18/18) |
| [C2.2-인증.md](C2.2-인증.md) | C2 | JWT·Google OAuth PKCE·엔타이틀먼트·UserRepository·/auth/*·게이팅 전 단계 | 구현 완료(인증 e2e 11/11) |
| [C2.3-게이팅.md](C2.3-게이팅.md) | C2 | 티어·IP/전역캡·고위험·주간한도(TR-02)·pro전용·/usage(CounterStore 포트) | 구현 완료(게이팅 e2e 9/9) |
| [C2.4-실공급자.md](C2.4-실공급자.md) | C2 | DeepSeek(SSE)·Tavily(ko가드)·Upstash(cache+counter) 어댑터·buildLocalRealDeps | 구현 완료(SSE 파서 결정 검증, 실키는 핸즈온) |
| [C2.5-aws.md](C2.5-aws.md) | C2 | DataApiSqlRunner·Secrets·streamHandle 핸들러·buildAwsDeps(배포 게이트 코드) | 코드 완료(타입체크, 실배포=핸즈온) |

C2 코드 전량 완료(C2.1~C2.4 로컬 검증, C2.5 타입체크). 실 AWS 배포 = 핸즈온(`../app/DEPLOY.md`). 다음 사이클 = C3 웹·랜딩.
