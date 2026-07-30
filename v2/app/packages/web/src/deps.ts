// 플랫폼 조립. 이 브라우저의 저장소와 서버 통로를 만들어 여정 배선(VockApp)에 넘긴다.
// ShellDeps 타입과 여정은 ui-shared에 있다(C4 S1에서 승격) — 데스크톱은 이 파일에 해당하는
// 자기 deps.ts를 갖는다. 여정 배선이 localStorage나 fetch를 알면 그 교체가 불가능해진다.

import { useMemo } from "react";
import { HttpApiClient, browserLocaleStore, type ShellDeps } from "@vock/ui-shared";
import { localTokenStore } from "./auth-storage.js";

// 개발 중에는 vite 프록시를 지나 로컬 서버로 간다. 배포 주소는 빌드 시 주입한다.
const BASE_URL = import.meta.env.VITE_API_BASE ?? "/api";

export function useShellDeps(): ShellDeps {
  const tokens = useMemo(() => localTokenStore(), []);
  const locale = useMemo(() => browserLocaleStore(), []);

  const api = useMemo<HttpApiClient>(() => {
    // onUnauthorized가 자기 자신을 부르므로 타입을 명시해 추론 순환을 끊는다.
    // 클로저는 생성 이후에만 실행되니 런타임에는 문제가 없다.
    const client: HttpApiClient = new HttpApiClient({
      baseUrl: BASE_URL,
      platform: "web",
      getAccessToken: () => tokens.read()?.access ?? null,
      // 저장소를 매 요청 직접 읽는다. React 상태를 읽게 하면 locale이 이 memo의 의존성이 되어
      // 언어를 바꿀 때마다 클라이언트가 새로 생기고 /config 재호출과 세션·프로젝트 재구독이 딸려온다.
      getOutputLocale: () => locale.read(),
      // 401 한 번에 한해 재발급하고 원 요청을 한 번만 다시 보낸다(S5a A-7).
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
    // 오프라인 캐시 능력 없음(C4 S3 — 포트만 준비됨). IndexedDB 구현은 별도 결정.
    offline: null,
    // 웹의 OAuth 능력: 자기 오리진 콜백 + 페이지 이동(S5a). location 가드는 App.tsx 시절 그대로.
    // waitForCallback이 없다 — 페이지가 떠났다 돌아오므로 마운트 경로가 콜백을 처리한다.
    auth: {
      platform: "web",
      redirectUri: () => (typeof location === "undefined" ? "" : location.origin + location.pathname),
      navigate: (url: string) => {
        location.assign(url);
      },
    },
  };
}
