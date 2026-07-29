// 로그인 버튼. client_id가 없으면 아예 그리지 않는다.
// 없는 채로 버튼을 띄우면 눌러서 깨진다. 기능이 없는 것과 고장난 것은 다르다(스펙 A-2).

import { tr } from "../../i18n/strings.js";
import type { AuthState } from "./useAuth.js";

export interface AuthButtonProps {
  state: AuthState;
  available: boolean;
  onSignIn(): void;
  onSignOut(): void;
}

export function AuthButton({ state, available, onSignIn, onSignOut }: AuthButtonProps) {
  if (!available) return null;

  if (state.phase === "exchanging") {
    return <span className="sbEmpty">{tr("auth_signing_in")}</span>;
  }

  if (state.phase === "signed_in") {
    return (
      <button className="sublink" onClick={onSignOut} title={state.user.email}>
        {tr("auth_sign_out")}
      </button>
    );
  }

  return (
    <>
      <button className="sublink" onClick={onSignIn}>
        {tr("auth_sign_in")}
      </button>
      {state.phase === "failed" ? <p className="errmsg">{state.message}</p> : null}
    </>
  );
}
