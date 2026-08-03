// 종착 화면의 재료 조달과 선택 집합 보관. 여정은 이 훅 하나만 부른다 —
// 배선이 journey.tsx에 쌓이면 그 파일이 다시 300행 상한에 닿는다(shell-bridge.ts와 같은 이유).

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Term } from "@vock/shared";
import { normTerm } from "@vock/shared";
import type { ApiPort } from "../../api/index.js";
import { buildSources, initialSelection, toggle, type Selection, type SourceTerm } from "./selection.js";

export interface PrimerSourcesArgs {
  api: ApiPort;
  sessionId: string | null;
  kept: Term[];
  generated: Term[]; // 이번 탐색의 카드. 조회 기록의 이름을 여기서 잇는다
  enabled: boolean; // 종착 화면에 있을 때만 서버를 부른다
  projectId: string | null; // 스코프 2의 범위. null이면 전체 자산
}

export function usePrimerSources(args: PrimerSourcesArgs) {
  const [viewedNorms, setViewedNorms] = useState<string[]>([]);
  // 사용자가 손댔는지. 손대기 전에는 기본값(저장분)을 따라가고, 손댄 뒤에는 그 선택을 지킨다.
  const [touched, setTouched] = useState<Selection | null>(null);

  useEffect(() => {
    if (!args.enabled || !args.sessionId) return;
    const ac = new AbortController();
    // 조회 목록 실패가 종착 화면을 막지 않는다. 저장분만으로도 붙여넣을 글은 완성된다.
    args.api
      .listViewed(args.sessionId, ac.signal)
      .then((items) => setViewedNorms(items.map((i) => i.term_norm)))
      .catch(() => setViewedNorms([]));
    return () => ac.abort();
  }, [args.api, args.sessionId, args.enabled]);

  const session: SourceTerm[] = useMemo(
    () => buildSources({ kept: args.kept, viewedNorms, generated: args.generated }),
    [args.kept, viewedNorms, args.generated]
  );

  // 스코프 2. GET /assets를 그대로 쓴다(T-9) — 두 번째 목록 API를 만들지 않는다.
  const [assetTerms, setAssetTerms] = useState<Term[]>([]);
  useEffect(() => {
    if (!args.enabled) return;
    const ac = new AbortController();
    args.api
      .listAssets(args.projectId, null, ac.signal)
      .then((page) => {
        // 목록 요약은 term 전체가 아니라 표시 필드만 온다(Data API 1MB 상한, §6).
        // 패널이 쓰는 것은 이름·한 줄·우선순위뿐이라 여기서 카드 형태로 맞춘다.
        setAssetTerms(
          page.items.map((a) => ({ term: a.term_name, kind: a.kind, priority: 99, why: "", one_line: a.one_line }))
        );
      })
      .catch(() => setAssetTerms([]));
    return () => ac.abort();
  }, [args.api, args.projectId, args.enabled]);

  // 이번 탐색에 이미 있는 어휘는 스코프 2에서 뺀다 — 같은 어휘가 두 절에 뜨면 어느 쪽을 눌러야
  // 하는지 알 수 없고, 선택 집합은 하나이므로 상태가 두 곳에 보이게 된다.
  const assets: SourceTerm[] = useMemo(() => {
    const inSession = new Set(session.map((s) => normTerm(s.term.term)));
    return assetTerms
      .filter((t) => !inSession.has(normTerm(t.term)))
      .map((t) => ({ term: t, kept: true, viewed: false }));
  }, [assetTerms, session]);

  // 기본 선택은 저장분(T-13). 사용자가 한 번이라도 손대면 그 집합이 정본이 된다.
  const auto = useMemo(() => initialSelection(session), [session]);
  const selection = touched ?? auto;

  const onToggle = useCallback((termName: string) => setTouched((prev) => toggle(prev ?? auto, termName)), [auto]);

  return { session, assets, selection, onToggle };
}
