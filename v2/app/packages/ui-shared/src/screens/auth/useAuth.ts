// 로그인 상태와 콜백 처리. 전이 규칙이 단순해 상태 기계를 따로 두지 않는다.
// 로그인은 관문이 아니다. 여기가 실패해도 앱의 나머지는 그대로 돈다(스펙 A-1).

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthPort, TokenStore } from "../../api/index.js";
import { isApiError } from "../../api/index.js";
import { buildAuthorizeUrl, preparePkce, readCallback } from "./pkce.js";

const STATE_KEY = "vock:auth:state";
const VERIFIER_KEY = "vock:auth:verifier";

export interface AuthUser {
  email: string;
  tier: "free" | "paid";
}

export type AuthState =
  | { phase: "anonymous" }
  | { phase: "exchanging" }
  | { phase: "signed_in"; user: AuthUser }
  | { phase: "failed"; message: string };

export interface UseAuthOptions {
  auth: AuthPort;
  tokens: TokenStore;
  // 구글 client_id. 없으면 로그인 자체를 제공하지 않는다(스펙 A-2).
  clientId: string | null;
  redirectUri: string;
  // 리다이렉트 왕복에 쓰는 임시 저장. 세션 한정이라 sessionStorage가 맞다.
  scratch?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

export function useAuth(opts: UseAuthOptions) {
  const [state, setState] = useState<AuthState>({ phase: "anonymous" });
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const scratch = (): UseAuthOptions["scratch"] =>
    optsRef.current.scratch ?? (typeof sessionStorage === "undefined" ? undefined : sessionStorage);

  // 리다이렉트로 돌아온 경우 한 번만 교환한다.
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    const s = scratch();
    if (typeof location === "undefined" || !s) return;
    if (!location.search.includes("code=") && !location.search.includes("error=")) return;
    handled.current = true;

    const expected = s.getItem(STATE_KEY);
    const verifier = s.getItem(VERIFIER_KEY);
    s.removeItem(STATE_KEY);
    s.removeItem(VERIFIER_KEY);
    // 주소창에서 코드를 지운다. 남겨 두면 새로고침 때 이미 쓴 코드로 다시 교환한다.
    history.replaceState(null, "", location.pathname);

    const got = readCallback(location.search, expected);
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
      .login({ code: got.code, codeVerifier: verifier, redirectUri: optsRef.current.redirectUri })
      .then((session) => {
        optsRef.current.tokens.write({ access: session.access_token, refresh: session.refresh_token });
        setState({ phase: "signed_in", user: session.user });
      })
      .catch((e) => {
        setState({ phase: "failed", message: isApiError(e) && "message" in e ? e.message : "로그인에 실패했어요." });
      });
  }, []);

  const signIn = useCallback(async () => {
    const { clientId, redirectUri } = optsRef.current;
    const s = scratch();
    if (!clientId || !s) return; // client_id가 없으면 아무 일도 하지 않는다(A-2)
    const prep = await preparePkce();
    s.setItem(STATE_KEY, prep.state);
    s.setItem(VERIFIER_KEY, prep.verifier);
    location.assign(buildAuthorizeUrl({ clientId, redirectUri, challenge: prep.challenge, state: prep.state }));
  }, []);

  const signOut = useCallback(async () => {
    const held = optsRef.current.tokens.read();
    // 서버 통보가 실패해도 로컬은 반드시 지운다(스펙 A-8).
    if (held) await optsRef.current.auth.logout(held.refresh);
    optsRef.current.tokens.clear();
    setState({ phase: "anonymous" });
  }, []);

  return { state, signIn, signOut, available: opts.clientId !== null };
}
