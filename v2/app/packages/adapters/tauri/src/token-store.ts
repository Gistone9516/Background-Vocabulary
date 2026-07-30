// OS 보안 저장소 토큰 스토어(C4 S2 D-5·§1-3). Windows Credential Manager / Linux Secret Service.
// Rust 쪽 배관 커맨드(secret_get/set/delete — src-tauri/src/lib.rs)를 감싼다.
//
// TokenStore 포트는 동기다(read가 매 요청 경로에 있다). 키링은 비동기이므로:
// - 기동 시 1회 로드(이 팩토리가 async인 이유) → 메모리가 화면과 요청의 정본이 된다.
// - write/clear는 메모리 즉시 + 키링 write-through. 실패는 경고 1줄(DS2-7) — 조용히 삼키면
//   "로그인돼 보이는데 다음 기동에 풀리는" 상태의 원인을 아무도 모르게 된다.

import { invoke } from "@tauri-apps/api/core";
import type { StoredTokens, TokenStore } from "@vock/ui-shared";

// 키링 항목 좌표. identifier(kr.co.bewe.vocknote)와 맞춘다 — OS 자격 증명 관리자에서
// 사용자가 이 앱의 항목을 알아볼 수 있는 이름이어야 한다.
const SERVICE = "kr.co.bewe.vocknote";
const ACCOUNT = "tokens";

function warn(what: string): (e: unknown) => void {
  // 토큰 값은 절대 로그에 싣지 않는다.
  return () => console.warn(`키링 ${what} 실패 — 다음 기동에서 로그인이 풀려 있을 수 있다(DS2-7)`);
}

export async function tauriTokenStore(): Promise<TokenStore> {
  let held: StoredTokens | null = null;
  try {
    const raw = await invoke<string | null>("secret_get", { service: SERVICE, account: ACCOUNT });
    if (raw) {
      const p = JSON.parse(raw) as Partial<StoredTokens>;
      // 저장소 값을 그대로 믿지 않는다(웹 localTokenStore와 같은 태도).
      held = typeof p.access === "string" && typeof p.refresh === "string" ? { access: p.access, refresh: p.refresh } : null;
    }
  } catch {
    // 읽기 실패 = 로그아웃 상태로 기동(DS2-7). 예외를 밖으로 던지면 앱 자체가 못 뜬다.
    held = null;
  }
  return {
    read: () => held,
    write: (t: StoredTokens): void => {
      held = t;
      void invoke("secret_set", { service: SERVICE, account: ACCOUNT, value: JSON.stringify(t) }).catch(warn("저장"));
    },
    clear: (): void => {
      held = null;
      void invoke("secret_delete", { service: SERVICE, account: ACCOUNT }).catch(warn("삭제"));
    },
  };
}
