// 웹 셸의 로케일 저장소 구현. ui-shared는 저장 방식을 모르고 이 포트만 받는다.
// 데스크톱(C4)은 같은 포트를 자기 저장소로 구현해 넣는다. 토큰 저장소와 같은 형태다.

import { asOutputLocale, type LocaleStore } from "@vock/ui-shared";
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

export function localLocaleStore(): LocaleStore {
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
