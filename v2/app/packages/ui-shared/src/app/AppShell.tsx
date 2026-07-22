// 반응형 앱 셸. 넓은 화면은 좌측 사이드바와 본문 2열, 좁은 화면은 사이드바를 드로어로 접는다.
// v1 사이드패널의 본문 셸(#app)을 그대로 재사용하고 바깥 레이아웃만 새로 얹었다.
// 세션과 프로젝트 목록은 S5에서 실데이터로 채운다. 지금은 빈 상태 문구만 보여준다.

import { useState, type ReactNode } from "react";
import { tr } from "../i18n/strings.js";

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="logo" style={{ background: "var(--grad)" }} aria-hidden="true" />
      <div style={{ minWidth: 0 }}>
        <b>{tr("brand")}</b>
        <span>{tr("brand_sub")}</span>
      </div>
    </div>
  );
}

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className="appRoot">
      <aside className={drawerOpen ? "sidebar open" : "sidebar"}>
        <div className="sbHead">
          <Brand />
        </div>
        <div className="sbBody scroll">
          <div className="sbSection">{tr("nav_sessions")}</div>
          <p className="sbEmpty">{tr("sessions_empty")}</p>
          <div className="sbSection">{tr("nav_projects")}</div>
          <p className="sbEmpty">{tr("projects_empty")}</p>
        </div>
      </aside>

      {drawerOpen ? <div className="scrim" onClick={() => setDrawerOpen(false)} /> : null}

      <div className="mainCol">
        <div id="app">
          <header>
            <button className="iconbtn sbToggle" onClick={() => setDrawerOpen(true)} aria-label={tr("menu")} title={tr("menu")}>
              <MenuIcon />
            </button>
            <div className="hdrBrand">
              <Brand />
            </div>
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}
