// 로그인 상태와 콜백 처리. 전이 규칙이 단순해 상태 기계를 따로 두지 않는다.
// 로그인은 관문이 아니다. 여기가 실패해도 앱의 나머지는 그대로 돈다(스펙 A-1).

import { useCallback, useEffect, useRef, useState } from "react";
import type { OutputLocale } from "@vock/shared";
import type { AuthPort, TokenStore } from "../../api/index.js";
import { isApiError } from "../../api/index.js";
import { buildAuthorizeUrl, preparePkce, readCallback } from "./pkce.js";

const STATE_KEY = "vock:auth:state";
const VERIFIER_KEY = "vock:auth:verifier";

export interface AuthUser {
  email: string;
  tier: "free" | "paid";
  // FR-952: 로그인 응답에 서버 정본 locale이 실려 온다(C4 S2). 여정이 저장소에 덮는다.
  locale: OutputLocale;
}

export type AuthState =
  | { phase: "anonymous" }
  | { phase: "exchanging" }
  | { phase: "signed_in"; user: AuthUser }
  | { phase: "failed"; message: string };

// OAuth 왕복의 플랫폼 차이(C4 S2 §1-1). PKCE·state 검증·교환은 이 훅이 갖고,
// "어떻게 브라우저로 가고 어떻게 돌아오는가"만 셸이 정한다. 화면 분기가 아니라 포트다(D-12).
// - 웹: navigate = location.assign(페이지가 떠난다), 콜백 = 마운트 경로(location.search).
// - 데스크톱: navigate = 시스템 브라우저, waitForCallback = 루프백 리스너가 받은 콜백 URL.
export interface AuthFlow {
  platform: "web" | "desktop";
  redirectUri(): string | Promise<string>; // 데스크톱은 리스너를 시작한 뒤에야 포트를 안다
  navigate(url: string): void | Promise<void>;
  waitForCallback?(): Promise<string>; // 있으면 같은 페이지에서 콜백을 기다린다(데스크톱)
}

export interface UseAuthOptions {
  auth: AuthPort;
  tokens: TokenStore;
  // 구글 client_id. 없으면 로그인 자체를 제공하지 않는다(스펙 A-2).
  clientId: string | null;
  // null = 이 플랫폼은 OAuth 능력이 없다(로그인 버튼이 뜨지 않는다 — A-2와 같은 강등).
  flow: AuthFlow | null;
  // 리다이렉트 왕복에 쓰는 임시 저장. 세션 한정이라 sessionStorage가 맞다.
  scratch?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

export function useAuth(opts: UseAuthOptions) {
  const [state, setState] = useState<AuthState>({ phase: "anonymous" });
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const scratch = (): UseAuthOptions["scratch"] =>
    optsRef.current.scratch ?? (typeof sessionStorage === "undefined" ? undefined : sessionStorage);

  // 콜백 처리의 공통 반쪽. 마운트 경로(웹)와 루프백 경로(데스크톱)가 같은 코드를 탄다 —
  // state 검증(A-4)이 경로에 따라 달라지면 한쪽만 위조에 열린다.
  const completeExchange = (search: string, redirectUri: string): void => {
    const s = scratch();
    if (!s) return;
    const expected = s.getItem(STATE_KEY);
    const verifier = s.getItem(VERIFIER_KEY);
    s.removeItem(STATE_KEY);
    s.removeItem(VERIFIER_KEY);

    const got = readCallback(search, expected);
    if ("error" in got) {
      // state 불일치는 위조 가능성이라 교환하지 않는다(스펙 A-4).
      setState({ phase: "failed", message: got.error === "state_mismatch" ? "로그인 요청이 확인되지 않았어요." : "로그인이 취소되었어요." });
      return;
    }
    if (!verifier) {
      setState({ phase: "failed", message: "로그인 정보를 찾지 못했어요. 다시 시도해 주세요." });
      return;
    }

    setState({ phase: "exchanging" });
    optsRef.current.auth
      .login({ code: got.code, codeVerifier: verifier, redirectUri })
      .then((session) => {
        optsRef.current.tokens.write({ access: session.access_token, refresh: session.refresh_token });
        setState({ phase: "signed_in", user: session.user });
      })
      .catch((e) => {
        setState({ phase: "failed", message: isApiError(e) && "message" in e ? e.message : "로그인에 실패했어요." });
      });
  };

  // 리다이렉트로 돌아온 경우 한 번만 교환한다(웹 경로 — 데스크톱은 웹뷰가 이동하지 않으므로
  // location.search에 코드가 실릴 일이 없고, 이 effect는 자연히 무동작이다).
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    const flow = optsRef.current.flow;
    if (!flow || typeof location === "undefined") return;
    if (!location.search.includes("code=") && !location.search.includes("error=")) return;
    handled.current = true;

    const search = location.search;
    // 주소창에서 코드를 지운다. 남겨 두면 새로고침 때 이미 쓴 코드로 다시 교환한다.
    history.replaceState(null, "", location.pathname);
    // 웹의 redirectUri()는 동기 문자열이지만 계약이 Promise를 허용하므로 감싼다.
    void Promise.resolve(flow.redirectUri()).then((uri) => completeExchange(search, uri));
  }, []);

  const signIn = useCallback(async () => {
    const { clientId, flow } = optsRef.current;
    const s = scratch();
    if (!clientId || !flow || !s) return; // client_id나 능력이 없으면 아무 일도 하지 않는다(A-2)
    const redirectUri = await flow.redirectUri();
    const prep = await preparePkce();
    s.setItem(STATE_KEY, prep.state);
    s.setItem(VERIFIER_KEY, prep.verifier);
    await flow.navigate(buildAuthorizeUrl({ clientId, redirectUri, challenge: prep.challenge, state: prep.state }));
    // 웹은 여기서 페이지가 떠난다 — 나머지는 돌아온 뒤 마운트 경로가 처리한다.
    if (!flow.waitForCallback) return;
    // 데스크톱: 같은 페이지에서 루프백 콜백을 기다린다. 취소·실패도 여기서 끝난다.
    try {
      const cbUrl = await flow.waitForCallback();
      completeExchange(new URL(cbUrl).search, redirectUri);
    } catch {
      setState({ phase: "failed", message: "로그인이 취소되었어요." });
    }
  }, []);

  const signOut = useCallback(async () => {
    const held = optsRef.current.tokens.read();
    // 서버 통보가 실패해도 로컬은 반드시 지운다(스펙 A-8).
    if (held) await optsRef.current.auth.logout(held.refresh);
    optsRef.current.tokens.clear();
    setState({ phase: "anonymous" });
  }, []);

  // 능력(flow)과 등록(clientId) 어느 쪽이 없어도 버튼이 뜨지 않는다 — 같은 강등 경로다.
  return { state, signIn, signOut, available: opts.clientId !== null && opts.flow !== null };
}
