// 셸이 여정에 주입하는 것의 계약. 구현은 플랫폼(web/desktop)이 갖는다 — 여정 배선이
// localStorage나 fetch를 직접 알면 셸 교체가 불가능해진다(웹 deps.ts의 원래 약속).
//
// C4 S1에서 web/src/deps.ts에 있던 타입을 여기로 올렸다. 여정 배선(journey.tsx)이
// ui-shared로 올라오면서 타입도 같이 와야 했다 — 형제 참조(desktop → web)는 게이트가 막는다.

import type { HttpApiClient, TokenStore } from "../api/index.js";
import type { LocaleStore } from "../i18n/locale.js";

// OAuth 능력(D-12 능력 모델). 로그인 여정은 화면 한 벌이고, 플랫폼은 능력의 유무만 선언한다.
// - 웹: 자기 오리진 콜백이 가능하므로 redirectUri를 준다.
// - 데스크톱 S1: null — 시스템 브라우저+루프백(S2)이 붙기 전까지 로그인 버튼이 뜨지 않는다.
//   client_id 미등록 시 버튼이 뜨지 않는 것(S5a A-2)과 같은 강등 모양이다.
export interface ShellAuth {
  redirectUri(): string;
}

export interface ShellDeps {
  api: HttpApiClient;
  tokens: TokenStore;
  locale: LocaleStore;
  auth: ShellAuth | null;
}
