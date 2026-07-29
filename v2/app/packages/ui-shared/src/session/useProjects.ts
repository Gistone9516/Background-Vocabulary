// 프로젝트 목록과 선택. 선택된 프로젝트가 세션 목록의 범위와 새 탐색의 배속을 정한다(S-15).
// 연결 턴을 켤지 여부도 여기서 나온다 — 그 프로젝트에 담은 어휘가 있어야 켠다(S-11).

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssetSummary, Project, RelateIn } from "@vock/shared";
import type { ApiPort } from "../api/index.js";
import type { NarrowCtx } from "../screens/narrow/index.js";

// /relate에 실을 어휘 수 상한. 프로젝트가 커져도 프롬프트가 무한정 길어지면 안 된다.
const RELATE_KEPT_CAP = 30;

export interface UseProjectsOptions {
  api: ApiPort;
  enabled: boolean;
}

export function useProjects({ api, enabled }: UseProjectsOptions) {
  const [items, setItems] = useState<Project[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  // 선택한 프로젝트에 담긴 어휘. 연결 턴 발동 조건이자 그 입력이다.
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const assetsRef = useRef<AssetSummary[]>([]);
  assetsRef.current = assets;

  const refresh = useCallback(() => {
    if (!enabled) {
      setItems([]);
      setSelected(null);
      return;
    }
    api
      .listProjects()
      .then(setItems)
      .catch(() => undefined);
  }, [api, enabled]);

  useEffect(() => refresh(), [refresh]);

  // 선택이 바뀌면 그 프로젝트의 어휘를 다시 읽는다. 선택이 없으면 연결 턴도 없다.
  useEffect(() => {
    if (!enabled || !selected) {
      setAssets([]);
      return;
    }
    const ac = new AbortController();
    api
      .listAssets(selected, null, ac.signal)
      .then((page) => setAssets(page.items))
      .catch(() => setAssets([]));
    return () => ac.abort();
  }, [api, enabled, selected]);

  const create = useCallback(
    (name: string) => {
      if (!enabled) return;
      api
        .createProject(name)
        .then((p) => {
          setItems((prev) => [...prev, p]);
          setSelected(p.project_id);
        })
        .catch(() => undefined);
    },
    [api, enabled]
  );

  const remove = useCallback(
    (id: string) => {
      if (!enabled) return;
      // 프로젝트만 사라지고 세션은 남는다(S-10). 서버가 소속만 해제한다.
      setItems((prev) => prev.filter((p) => p.project_id !== id));
      setSelected((cur) => (cur === id ? null : cur));
      api.deleteProject(id).catch(() => refresh());
    },
    [api, enabled, refresh]
  );

  // 담은 어휘가 없으면 서버가 항상 relevant:false를 준다. 부르지 않는다(S-11).
  const canConnect = enabled && selected !== null && assets.length > 0;

  const relate = useCallback(
    (ctx: NarrowCtx) => {
      const kept = assetsRef.current;
      if (!enabled || kept.length === 0) return Promise.resolve(null);
      const input: RelateIn = {
        area: ctx.classifyOut.domain,
        job_type: ctx.classifyOut.job_type,
        history: ctx.answers.flatMap((a) => (a.kind === "picks" ? a.labels : [])),
        topic: ctx.topic,
        kept: kept.slice(0, RELATE_KEPT_CAP).map((a) => ({ term: a.term_name, one_line: a.one_line })),
      };
      return api.relate(input).catch(() => null);
    },
    [api, enabled]
  );

  return { items, selected, select: setSelected, create, remove, refresh, canConnect, relate };
}
