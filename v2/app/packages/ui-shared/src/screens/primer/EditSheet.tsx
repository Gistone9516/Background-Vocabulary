// 좁은 화면의 편집 진입점(T-5). 좌측 하단 원형 버튼과, 그 버튼이 여는 하단 슬라이딩 패널.
//
// 표시 조건이 화면 폭이 아니라 **'이대로 복사'의 가시성**이다(사용자 확정 2026-08-03).
// 폭으로 재면 브레이크포인트를 하나 더 들고 다녀야 하고, 사용자가 아직 프라이머를 훑는 중에도
// 버튼이 떠서 방해가 된다. 복사 버튼이 눈에 들어왔다는 것은 종착에 도달했다는 뜻이다.
//
// 넓은 화면에서는 뜨지 않는다 — 우측 패널이 이미 같은 일을 하므로 진입점이 둘이 된다.
// 그 판정은 CSS가 한다(.editFab { display: none } above the breakpoint): JS로 폭을 재면
// 같은 규칙이 두 곳에 생긴다.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTr } from "../../i18n/locale.js";

export interface EditSheetProps {
  // 가시성을 감시할 대상. 복사 버튼을 감싼 요소를 넘긴다.
  watchRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
}

export function EditSheet({ watchRef, children }: EditSheetProps) {
  const tr = useTr();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = watchRef.current;
    // 관찰자가 없는 환경(테스트 런타임 등)에서는 버튼을 계속 띄운다 —
    // 안 띄우면 편집 경로가 통째로 사라져, 관측 실패가 기능 상실이 된다.
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    // threshold 0 = 끄트머리라도 걸치면 참(사용자 표현: "끄트머리라도 보이면").
    const io = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [watchRef]);

  // 시트가 열려 있는 동안 ESC로 닫는다. 열려 있지 않으면 핸들러를 걸지 않는다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {visible ? (
        <button className="editFab" onClick={() => setOpen(true)} aria-expanded={open} aria-label={tr("primer_edit")}>
          <span aria-hidden="true">✎</span>
        </button>
      ) : null}

      {open ? (
        <div className="sheetScrim" onClick={() => setOpen(false)}>
          <div className="sheet" ref={sheetRef} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="sheetHandle" aria-hidden="true" />
            <button className="link sheetClose" onClick={() => setOpen(false)}>
              {tr("detail_close")}
            </button>
            {children}
          </div>
        </div>
      ) : null}
    </>
  );
}
