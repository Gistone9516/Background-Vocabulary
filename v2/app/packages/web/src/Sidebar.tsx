// 사이드바에 무엇을 담을지. 여정 배선(App)과 다른 책임이라 파일을 나눈다.
// 셸은 자리만 주고 내용을 모른다.

import { ProjectList, SessionList, type useProjects, type useSessionSync } from "@vock/ui-shared";

export interface SidebarProps {
  sync: ReturnType<typeof useSessionSync>;
  projects: ReturnType<typeof useProjects>;
  onOpenSession(id: string): void;
}

export function sidebarSlots({ sync, projects, onOpenSession }: SidebarProps) {
  return {
    sessions: (
      <SessionList
        items={sync.list.items}
        off={sync.list.off}
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
