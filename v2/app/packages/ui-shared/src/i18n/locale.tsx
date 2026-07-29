// 출력 로케일의 단일 소유자.
//
// 정본은 저장소다. 화면이 읽는 값과 생성 요청에 실리는 값이 같은 저장소를 보므로 둘이 어긋날 수 없다(S-17).
// React 상태는 다시 그리기 위한 사본이고, 요청 경로는 상태를 보지 않는다 — 상태를 보게 하면 클라이언트를
// memo에서 다시 만들어야 하고, 그러면 언어를 바꿀 때마다 /config 재호출과 세션·프로젝트 재구독이 딸려온다.
//
// 저장 방식은 셸이 정한다(웹은 localStorage, 데스크톱은 C4에서 자기 저장소). 토큰 저장소와 같은 형태다.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { OUTPUT_LOCALES, type OutputLocale } from "@vock/shared";

// read가 null을 돌려주지 않는 것이 이 포트의 핵심이다. "값이 없으면 무엇" 이라는 판단을 구현 한 곳에
// 가두어, 그 판단을 빠뜨린 호출부가 생길 자리를 없앤다.
export interface LocaleStore {
  read(): OutputLocale;
  write(locale: OutputLocale): void;
}

// 알 수 없는 값을 로케일로 좁힌다. 저장소는 사용자가 건드릴 수 있는 곳이라 읽은 값을 믿지 않는다.
// 목록은 OUTPUT_LOCALES 하나에서 온다. 여기에 배열을 다시 적으면 서버의 readLocale과 조용히 어긋난다.
export function asOutputLocale(v: unknown): OutputLocale | null {
  return OUTPUT_LOCALES.includes(v as OutputLocale) ? (v as OutputLocale) : null;
}

// 언어 이름은 그 언어로 적는다. 언어를 바꾸려는 사람은 지금 언어를 못 읽는 사람이다. [v1 원문]
export const LOCALE_LABELS: Record<OutputLocale, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  zh: "中文",
};

interface LocaleCtx {
  locale: OutputLocale;
  setLocale: (locale: OutputLocale) => void;
}

const Ctx = createContext<LocaleCtx | null>(null);

export interface LocaleProviderProps {
  store: LocaleStore;
  children: ReactNode;
}

export function LocaleProvider({ store, children }: LocaleProviderProps) {
  const [locale, setState] = useState<OutputLocale>(() => store.read());

  // 저장소를 먼저 쓰고 화면을 갱신한다. 이 순서라야 갱신 도중에 나가는 요청도 새 값을 싣는다.
  const setLocale = useCallback((next: OutputLocale) => {
    store.write(next);
    setState(next);
  }, [store]);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOutputLocale(): LocaleCtx {
  const ctx = useContext(Ctx);
  // 조용히 "ko"로 떨어지지 않는다. 그 폴백이 이번 슬라이스가 고치는 버그의 모양이다.
  if (!ctx) throw new Error("useOutputLocale은 LocaleProvider 안에서만 쓸 수 있다");
  return ctx;
}
