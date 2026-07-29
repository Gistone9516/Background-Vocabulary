// 토큰 저장소 포트. ui-shared는 저장 방식을 모른다(C3 §1-3 플랫폼 주입).
// 웹은 localStorage, 데스크톱은 C4에서 보안 저장소를 넣는다.

export interface StoredTokens {
  access: string;
  refresh: string;
}

export interface TokenStore {
  read(): StoredTokens | null;
  write(t: StoredTokens): void;
  clear(): void;
}

// 저장소를 주입받지 못한 셸에서 쓰는 기본값. 새로고침하면 사라진다.
// 로그인 자체를 막지 않기 위해 존재한다(스펙 A-1: 로그인은 관문이 아니다).
export function memoryTokenStore(): TokenStore {
  let held: StoredTokens | null = null;
  return {
    read: () => held,
    write: (t) => {
      held = t;
    },
    clear: () => {
      held = null;
    },
  };
}
