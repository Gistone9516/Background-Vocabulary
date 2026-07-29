# C3 S5a 스펙 — 로그인 (SoT §3-2·§4에서 파생)

> 상위 = [C3-웹랜딩.md](C3-웹랜딩.md). 앞 = [C3-S4](C3-S4-담기와게이팅.md).
> 착수 전 brief 실행함(2026-07-29). 근거는 `scratchpad/brief-auth.md`.
> 규칙: A-1~A-9 (9건) · 계약 확인 4건

## 0. 범위

- **포함**: Google OAuth PKCE 로그인 · 토큰 저장(포트 주입) · 요청에 토큰 싣기 · 401 재발급 · 로그아웃 · 인증 에러 분류.
- **제외**: 담기·세션 서버 저장(S5 본편) · 데스크톱 콜백(C4) · 실 Google 콘솔 등록(핸즈온).

### 0-1. 로그인은 관문이 아니다

지금 앱은 로그인 없이 전 여정이 돈다(entry → 좁히기 → 난이도 → 어휘 → 상세 → 담기). **그 경로를 막지 않는다.** 로그인은 담은 것을 계정에 남기기 위한 선택이다. 비로그인 사용자가 벽을 만나면 안 된다.

## 1. 확인된 계약 (원문 대조 완료)

브리핑이 알려 준 것을 `auth-routes.ts` 전문을 읽어 직접 확인했다. **SoT 표기와 실제가 다른 곳이 있다.**

| # | 확인 결과 | 근거 |
|---|---|---|
| C-1 | `/auth/google` 응답은 `{access_token, refresh_token, expires_in, user}`다. **SoT §3-2 표의 `{access, refresh, user}` 축약과 필드명이 다르다.** SoT 표만 보고 짰으면 토큰을 못 읽고 조용히 실패했다 | auth-routes.ts:22 |
| C-2 | 요청 바디는 snake_case 고정: `code`·`code_verifier`·`redirect_uri`·`platform`. 셋 중 하나라도 없으면 401 `AUTH_FAILED` | auth-routes.ts:13-18 |
| C-3 | `/auth/refresh`는 `{refresh_token}`을 받아 같은 모양을 돌려준다. 실패는 401 `TOKEN_REVOKED` | auth-routes.ts:30-37 |
| C-4 | `/auth/logout`은 `{refresh_token}`, 204. 멱등 | auth-routes.ts:40-45 |

`state`는 백엔드 계약에 없다. **없는 것이 맞다.** state는 리다이렉트 위조를 막는 클라이언트 측 장치이고 서버는 볼 일이 없다. 그래도 **클라는 반드시 쓴다**(A-3).

## 2. 동작 규칙

| # | 규칙 | 출처·근거 |
|---|---|---|
| A-1 | 비로그인 상태로 전 여정이 그대로 돈다. 로그인은 어디서도 강제되지 않는다 | §0-1 |
| A-2 | Google client_id는 `/config`가 준다. **없으면 로그인 UI를 아예 띄우지 않는다** | 실 콘솔 등록이 핸즈온 미완이다. 없는 채로 버튼을 띄우면 눌러서 깨진다. **기능이 없는 것과 고장난 것은 다르다** |
| A-3 | PKCE `code_verifier`와 `state`는 클라가 만든다. verifier는 교환 때 서버로, state는 돌아온 값과 대조만 하고 버린다 | C-2, PKCE 규격 |
| A-4 | 리다이렉트로 돌아왔을 때 `state`가 다르면 교환하지 않고 중단한다 | 위조 방지 |
| A-5 | 토큰 저장은 `TokenStore` 포트로 주입받는다. ui-shared는 저장소를 모른다 | C3 §1-3 플랫폼 주입. 웹=localStorage, 데스크톱=C4에서 보안 저장소 |
| A-6 | 모든 요청의 `Authorization: Bearer <access_token>` 형식은 이미 고정돼 있다. 새 규약을 만들지 않는다 | http-client.ts:23, middleware/auth.ts:7-12 |
| A-7 | 401을 받으면 `/auth/refresh`로 한 번만 재발급하고 원 요청을 한 번만 재시도한다. 재발급도 실패하면 로그아웃 상태로 되돌린다 | 무한 재시도 금지 |
| A-8 | 로그아웃은 서버 호출 결과와 무관하게 로컬 토큰을 지운다 | 서버가 죽어도 로그아웃은 되어야 한다 |
| A-9 | 인증 에러 코드 4종을 분류기에 추가한다: `AUTH_FAILED`·`TOKEN_REVOKED`·`AUTH_REQUIRED`·`TOKEN_EXPIRED` | 지금은 전부 `server`로 떨어져 화면이 "요청을 처리하지 못했어요"만 보여준다 |

## 3. 파일 구조

```
packages/ui-shared/src/
├ api/
│  ├ port.ts        AuthPort 추가(login·refresh·logout). ApiPort와 분리한다
│  ├ errors.ts      인증 코드 4종 분류 추가(A-9)
│  ├ token-store.ts TokenStore 포트 정의(A-5)
│  └ http-client.ts 401 재발급 1회(A-7)
└ screens/auth/
   ├ pkce.ts        verifier·challenge·state 생성. 순수 함수
   ├ useAuth.ts     로그인 상태와 콜백 처리
   └ AuthButton.tsx 로그인·로그아웃 버튼. client_id 없으면 렌더 안 함(A-2)

packages/web/src/
└ auth-storage.ts   localStorage TokenStore 구현(웹 전용)
```

## 4. 계약

```ts
export interface TokenStore {                 // 플랫폼이 구현해 주입한다
  read(): { access: string; refresh: string } | null;
  write(t: { access: string; refresh: string }): void;
  clear(): void;
}

export interface AuthPort {
  login(args: { code: string; codeVerifier: string; redirectUri: string }): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession | null>;   // null이면 재로그인 필요
  logout(refreshToken: string): Promise<void>;
}

export interface AuthSession {                // 서버 응답 그대로. 필드명을 바꾸지 않는다(C-1)
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { email: string; tier: Tier };        // core/auth-service.ts:17 LoginResult 확인
}
```

**C-5 (초안 정정)**: 초안에 `user`를 `{user_id, email, name}`으로 적었으나 `LoginResult`(auth-service.ts:15-18)는 `{email, tier}`다. 이 문서가 "추측해서 적지 않는다"고 써 놓고 추측한 자리였다. `UserRecord`에는 `user_id`가 있지만 로그인 응답은 그것을 싣지 않는다.

## 5. 검증

`e2e-auth-client.mjs`를 게이트에 추가한다. 네트워크 없이 순수 함수와 재시도 규칙만 돌린다.

| 케이스 | 기대 |
|---|---|
| PKCE challenge | verifier에서 S256 challenge가 결정적으로 나온다 |
| state 불일치 | 교환 호출 없음 (A-4) |
| client_id 없음 | 로그인 UI 렌더 0 (A-2) |
| 401 한 번 | refresh 1회 + 원 요청 1회 재시도 (A-7) |
| refresh도 401 | 토큰 삭제, 재시도 없음 (A-7) |
| 로그아웃 중 서버 오류 | 로컬 토큰은 지워짐 (A-8) |
| 인증 코드 4종 | 각각 전용 kind로 분류 (A-9) |

## 6. 열린 항목

- `/config`에 `googleClientId`를 싣는 것이 맞는지. 지금은 운영 한도만 담고 있어 성격이 다르다. 대안은 별도 `/client-config`. **구현 전 판단 필요.**
- refresh 토큰을 localStorage에 두는 것의 XSS 노출. 웹 SPA에 서버 세션 쿠키가 없어 현실적 대안이 좁다. NFR과 대조해 S5 본편에서 재검토한다.
