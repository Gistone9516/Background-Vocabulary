// 데스크톱 플랫폼 조립. 웹의 deps.ts에 해당하는 파일이고, 여정(VockApp)은 ui-shared에서 온다.
//
// S1의 임시 상태 두 가지를 여기 명시한다(스펙 DS-6 아님 — C4-S1 §1-3):
// - tokens = memoryTokenStore: 로그인 능력이 없으므로(auth: null) 저장할 토큰 자체가 없다.
//   S2에서 OS 보안 저장소로 교체한다(D-5 — localStorage 금지는 데스크톱에 그대로 적용).
// - locale = browserLocaleStore: 웹뷰에도 localStorage가 있어 웹과 같은 구현을 쓴다.
//   S2에서 users.locale 서버 동기화가 붙으면 재판단한다.

import { useMemo } from "react";
import { HttpApiClient, browserLocaleStore, memoryTokenStore, type ShellDeps } from "@vock/ui-shared";

// D-3: 상대경로 폴백을 두지 않는다. dev 값("/api")은 .env.development에 명시돼 있고,
// 프로덕션 빌드는 vite.config.ts가 미설정 시 빌드를 깬다. 여기는 이중 방어다 —
// 설정이 뚫려도 조용히 웹뷰 자신을 가리키는 대신 첫 화면에서 시끄럽게 죽는다.
// 함수로 감싼 이유: 모듈 상단의 if-throw 가드는 클로저(useMemo 콜백) 안까지 좁혀지지 않아
// string | undefined가 그대로 남는다. 반환값으로 받으면 타입이 string으로 확정된다.
const BASE_URL: string = (() => {
  const v = import.meta.env.VITE_API_BASE;
  if (!v) throw new Error("VITE_API_BASE가 없다 — 데스크톱은 API 주소 폴백을 두지 않는다(C4 D-3).");
  return v;
})();

export function useShellDeps(): ShellDeps {
  const tokens = useMemo(() => memoryTokenStore(), []);
  const locale = useMemo(() => browserLocaleStore(), []);

  const api = useMemo<HttpApiClient>(() => {
    // onUnauthorized가 자기 자신을 부르므로 타입을 명시해 추론 순환을 끊는다(web과 동일).
    const client: HttpApiClient = new HttpApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => tokens.read()?.access ?? null,
      getOutputLocale: () => locale.read(),
      // 401 한 번에 한해 재발급(S5a A-7). S1에서는 로그인이 없어 도달하지 않지만,
      // S2가 토큰 저장소만 갈아 끼우면 되도록 웹과 같은 회로를 미리 둔다.
      onUnauthorized: async (): Promise<string | null> => {
        const held = tokens.read();
        if (!held) return null;
        const next = await client.refresh(held.refresh).catch(() => null);
        if (!next) {
          tokens.clear();
          return null;
        }
        tokens.write({ access: next.access_token, refresh: next.refresh_token });
        return next.access_token;
      },
    });
    return client;
  }, [tokens, locale]);

  return {
    api,
    tokens,
    locale,
    // OAuth 능력 없음(S1). 로그인 버튼이 뜨지 않는다 — 화면 분기가 아니라 능력 강등이다(D-12).
    // S2에서 시스템 브라우저 + 루프백 콜백으로 채운다(계약 §140).
    auth: null,
  };
}
