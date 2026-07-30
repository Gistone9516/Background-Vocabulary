// OfflineStore의 tauri 구현(FR-902, C4 S3). 공식 plugin-store — 앱 데이터 폴더의 JSON 파일.
// 저장하는 것은 서버 응답의 사본뿐이다(정본=서버). 토큰과 달리 비밀이 아니라 키링이 아니다.
//
// LazyStore: 첫 접근 때 로드된다 — 팩토리가 동기라 셸 조립(useShellDeps)이 async가 안 된다.
// 쓰기마다 명시 save()를 부른다(DS3-8) — autoSave 기본은 "정상 종료 시 저장"이라, 크래시가
// 캐시를 조용히 비우면 오프라인 열람이 그만큼 조용히 빈다.

import { LazyStore } from "@tauri-apps/plugin-store";
import type { CachedList, OfflineStore } from "@vock/ui-shared";
import type { SessionRec, SessionSummary } from "@vock/shared";

const FILE = "offline-cache.json";
const LIST_KEY = "list";
const sessionKey = (id: string): string => `session:${id}`;

export function tauriOfflineStore(): OfflineStore {
  const store = new LazyStore(FILE);

  return {
    async readList(): Promise<CachedList | null> {
      const v = await store.get<CachedList>(LIST_KEY);
      // 파일은 사용자가 손댈 수 있는 곳이다 — 형태가 어긋나면 없는 것으로 본다(캐시라서 잃어도 된다).
      return v && Array.isArray(v.items) ? v : null;
    },
    async writeList(items: SessionSummary[]): Promise<void> {
      await store.set(LIST_KEY, { savedAt: Date.now(), items } satisfies CachedList);
      await store.save();
    },
    async readSession(id: string): Promise<SessionRec | null> {
      return (await store.get<SessionRec>(sessionKey(id))) ?? null;
    },
    async writeSession(rec: SessionRec): Promise<void> {
      await store.set(sessionKey(rec.session_id), rec);
      await store.save();
    },
    async removeSession(id: string): Promise<void> {
      await store.delete(sessionKey(id));
      await store.save();
    },
    async clear(): Promise<void> {
      await store.clear();
      await store.save();
    },
  };
}
