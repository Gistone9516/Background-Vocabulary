# @vock/web

브라우저 SPA 셸(Vite). `@vock/ui-shared`의 화면을 마운트하고 브라우저 전용 구현을 주입한다. 라우팅, OAuth 콜백, 광고 슬롯은 뒤 슬라이스에서 붙인다.

## 실행
```
corepack pnpm --dir packages/web run dev        # http://localhost:5180
corepack pnpm --dir packages/web run typecheck  # tsc --noEmit
corepack pnpm --dir packages/web run build      # 프로덕션 번들
```

## 메모
- 개발 중에는 vite alias로 `@vock/ui-shared`와 `@vock/shared`를 소스로 연결해 수정이 바로 반영된다(빌드 산출물 경유 아님).
- 폰트는 v1과 같은 Pretendard를 CDN으로 불러온다. 오프라인이나 CSP 정책이 필요해지면 self host로 바꾼다.
- tsc 프로젝트 레퍼런스 솔루션에는 넣지 않는다(Vite가 빌드). 타입 검사는 위 typecheck 스크립트로 한다.
