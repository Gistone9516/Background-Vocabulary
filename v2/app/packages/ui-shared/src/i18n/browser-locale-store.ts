// localStorage 기반 로케일 저장소. 웹과 데스크톱 웹뷰가 같은 구현을 쓴다 —
// 둘 다 localStorage가 있는 웹 표준 환경이고, 두 벌이면 키가 갈라진다.
// C4 S1에서 web/src/locale-storage.ts를 올렸다(memoryTokenStore가 ui-shared에 있는 선례).
// 데스크톱은 S2에서 users.locale 서버 동기화가 붙으면 재판단한다.

import { asOutputLocale, type LocaleStore } from "./locale.js";
import type { OutputLocale } from "@vock/shared";

const KEY = "vock:locale";

// 브라우저가 알려주는 표시 언어에서 첫 기본값을 고른다. 못 고르면 한국어다.
// 저장된 값이 생기는 순간부터 이 함수는 다시 쓰이지 않는다.
function fromBrowser(): OutputLocale {
  try {
    for (const tag of navigator.languages ?? [navigator.language]) {
      const hit = asOutputLocale(tag.slice(0, 2).toLowerCase());
      if (hit) return hit;
    }
  } catch {
    /* navigator가 없는 환경. 아래 기본값으로 떨어진다 */
  }
  return "ko";
}

export function browserLocaleStore(): LocaleStore {
  return {
    read(): OutputLocale {
      try {
        // 저장소는 사용자가 손댈 수 있는 곳이라 읽은 값을 그대로 믿지 않는다.
        return asOutputLocale(localStorage.getItem(KEY)) ?? fromBrowser();
      } catch {
        return fromBrowser();
      }
    },
    write(locale: OutputLocale): void {
      try {
        localStorage.setItem(KEY, locale);
      } catch {
        /* 사생활 보호 모드 등에서 막힐 수 있다. 이번 세션만 유지된다 */
      }
    },
  };
}
