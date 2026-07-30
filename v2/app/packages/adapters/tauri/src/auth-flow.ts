// 데스크톱 OAuth 왕복(C4 S2 D-4·DS2-6): 시스템 브라우저 + 루프백 리스너.
// 계약 §140 "데스크톱(Tauri): 시스템 브라우저 + 루프백/커스텀 스킴 콜백" 중 **루프백 확정** —
// Google이 데스크톱 앱에 커스텀 스킴을 제한하는 경우가 있어 루프백이 표준 경로다(스펙 §6 웹 근거).
//
// PKCE·state 검증·교환은 ui-shared의 useAuth가 갖는다. 여기는 이동과 수신만 안다(D-12 능력 모델).

import { cancel, onInvalidUrl, onUrl, start } from "@fabianlars/tauri-plugin-oauth";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { AuthFlow } from "@vock/ui-shared";

// 사용자가 브라우저를 그냥 닫으면 콜백이 영영 안 온다. 리스너와 프라미스를 이 시간 뒤에 정리한다.
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

export function tauriAuthFlow(): AuthFlow {
  let port: number | null = null;

  const closeListener = (): void => {
    if (port !== null) {
      // README: "must call cancel()" — 성공·실패·중단 전부에서 닫는다(DS2-6).
      void cancel(port).catch(() => {});
      port = null;
    }
  };

  return {
    platform: "desktop",

    async redirectUri(): Promise<string> {
      // 재시도로 리스너가 남아 있으면 먼저 닫는다 — 포트가 다르면 이전 리스너는 유령이 된다.
      closeListener();
      port = await start();
      return `http://127.0.0.1:${port}`;
    },

    async navigate(url: string): Promise<void> {
      await openUrl(url);
    },

    waitForCallback(): Promise<string> {
      return new Promise<string>((resolve, reject) => {
        const unsubs: Array<() => void> = [];
        const timer = setTimeout(() => finish(() => reject(new Error("timeout"))), CALLBACK_TIMEOUT_MS);
        const finish = (settle: () => void): void => {
          clearTimeout(timer);
          for (const u of unsubs) u();
          closeListener();
          settle();
        };
        void onUrl((url) => finish(() => resolve(url))).then((u) => unsubs.push(u));
        void onInvalidUrl(() => finish(() => reject(new Error("invalid_callback")))).then((u) => unsubs.push(u));
      });
    },
  };
}
