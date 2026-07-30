// 셸 능력과 여정 사이의 다리(C4 S2·S3). journey.tsx에서 갈라냈다 — 화면 전환 배선(여정)과
// 능력 배선(이 파일)은 다른 책임이고, 두 슬라이스가 여기만 자라며 300행 상한을 넘었다.
//
// 담는 것 셋:
// - 오프라인 캐시 데코레이터 조립(FR-902 DS3-2) + offline 신호
// - 언어 설정 동기화(FR-952 §1-4): 로그인 직후 서버 정본이 로컬을 덮고, 로그인 중 변경은 서버 반영
// - 로그아웃 = 캐시 삭제(DS3-5)

import { useEffect, useMemo, useRef, useState } from "react";
import type { OutputLocale } from "@vock/shared";
import type { ApiPort } from "../api/port.js";
import { withOfflineCache } from "../api/offline-cache.js";
import { useOutputLocale } from "../i18n/locale.js";
import type { AuthState } from "../screens/auth/index.js";
import type { ShellDeps } from "./shell-deps.js";

export function useShellBridge(deps: ShellDeps, authState: AuthState): { api: ApiPort; offline: boolean } {
  // 오프라인 캐시. 능력이 있으면 읽기 두 경로를 데코레이터로 감싼다 — 훅과 화면은 자기가
  // 캐시를 쓰는지 모른다. 신호는 onChange 하나로 이 상태에 모인다.
  const [offline, setOffline] = useState(false);
  const api = useMemo(
    () => (deps.offline ? withOfflineCache(deps.api, deps.offline, setOffline) : deps.api),
    [deps.api, deps.offline]
  );

  const { locale: loc, setLocale } = useOutputLocale();
  const signedIn = authState.phase === "signed_in";

  // 언어 설정 동기화(FR-952). 정본=서버.
  // 실패는 삼키되 경고 1줄 — 화면은 로컬 값을 유지하고, 다음 로그인 때 서버 값이 이긴다.
  const serverLocale = useRef<OutputLocale | null>(null);
  useEffect(() => {
    if (authState.phase !== "signed_in") {
      serverLocale.current = null;
      return;
    }
    if (serverLocale.current === null) {
      serverLocale.current = authState.user.locale;
      if (authState.user.locale !== loc) setLocale(authState.user.locale);
      return;
    }
    if (loc !== serverLocale.current) {
      serverLocale.current = loc;
      api.updateLocale(loc).catch(() => console.warn("언어 설정 서버 반영 실패 — 다음 로그인 때 서버 값이 이긴다"));
    }
  }, [authState, loc, setLocale, api]);

  // 로그아웃 = 캐시 삭제(DS3-5). 같은 기기의 다음 사용자에게 남의 목록이 보이면
  // 소유권 규칙(PUT 409 횡령 방지)의 클라이언트 판 위반이다.
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (wasSignedIn.current && !signedIn) void deps.offline?.clear().catch(() => {});
    wasSignedIn.current = signedIn;
  }, [signedIn, deps.offline]);

  return { api, offline };
}
