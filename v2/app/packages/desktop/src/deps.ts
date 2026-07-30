// 데스크톱 플랫폼 조립. 웹의 deps.ts에 해당하는 파일이고, 여정(VockApp)은 ui-shared에서 온다.
//
// S2에서 채워진 것: tokens = OS 보안 저장소(키링, main.tsx가 기동 시 1회 로드해 넘긴다),
// auth = 시스템 브라우저 + 루프백(tauriAuthFlow). locale 동기화는 여정이 갖는다(FR-952 —
// 플랫폼 무관 로직이라 여기 두면 웹과 갈라진다). browserLocaleStore는 로컬 캐시 역할로 유지.

import { useMemo } from "react";
import { HttpApiClient, browserLocaleStore, type ShellDeps, type TokenStore } from "@vock/ui-shared";
import { tauriAuthFlow, tauriOfflineStore } from "@vock/tauri";

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

// tokens는 main.tsx가 기동 시 키링에서 1회 로드해 넘긴다(비동기 팩토리 — C4-S2 §1-3).
// 훅 안에서 만들 수 없는 이유: TokenStore.read()는 동기인데 키링은 비동기라, 첫 로드가
// 렌더보다 늦으면 "로그인 풀린 화면"이 먼저 그려진다.
export function useShellDeps(tokens: TokenStore): ShellDeps {
  const locale = useMemo(() => browserLocaleStore(), []);

  const api = useMemo<HttpApiClient>(() => {
    // onUnauthorized가 자기 자신을 부르므로 타입을 명시해 추론 순환을 끊는다(web과 동일).
    const client: HttpApiClient = new HttpApiClient({
      baseUrl: BASE_URL,
      // 서버가 이 값으로 web/desktop 자격증명 쌍을 고른다(계약 §135). 필수라 빠뜨릴 수 없다(DS2-5).
      platform: "desktop",
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

  // 시스템 브라우저 + 루프백(계약 §140, S2에서 채움). 리스너 수명은 어댑터가 관리한다.
  const auth = useMemo(() => tauriAuthFlow(), []);
  // 오프라인 캐시(FR-902, S3). plugin-store JSON — 여정이 데코레이터로 감싼다.
  const offline = useMemo(() => tauriOfflineStore(), []);

  return { api, tokens, locale, auth, offline };
}
