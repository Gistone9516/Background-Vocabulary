// 사이드바에 무엇을 담을지. 여정 배선(journey.tsx)과 다른 책임이라 파일을 나눈다.
// 셸은 자리만 주고 내용을 모른다.
// C4 S1에서 web/src/Sidebar.tsx를 그대로 올렸다 — 이미 ui-shared만 import하고 있었다.

import { ProjectList } from "./ProjectList.js";
import { SessionList } from "./SessionList.js";
import type { useProjects, useSessionSync } from "../session/index.js";

export interface SidebarProps {
  sync: ReturnType<typeof useSessionSync>;
  projects: ReturnType<typeof useProjects>;
  onOpenSession(id: string): void;
  // 오프라인 폴백 고지(C4 S3). 문구를 아는 쪽(여정)이 만들어 넘긴다. null = 없음.
  offlineNotice?: string | null;
}

export function sidebarSlots({ sync, projects, onOpenSession, offlineNotice }: SidebarProps) {
  return {
    sessions: (
      <SessionList
        items={sync.list.items}
        off={sync.list.off}
        notice={offlineNotice ?? null}
        loading={sync.list.loading}
        hasMore={sync.list.cursor !== null}
        query={sync.query}
        onSearch={sync.search}
        onOpen={onOpenSession}
        onRemove={sync.remove}
        onRestore={sync.restore}
        onMore={sync.more}
      />
    ),
    projects: (
      <ProjectList
        items={projects.items}
        off={sync.list.off}
        selected={projects.selected}
        onSelect={projects.select}
        onCreate={projects.create}
        onRemove={projects.remove}
      />
    ),
  };
}
