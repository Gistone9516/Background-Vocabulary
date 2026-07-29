// 반응형 앱 셸. 넓은 화면은 좌측 사이드바와 본문 2열, 좁은 화면은 사이드바를 드로어로 접는다.
// v1 사이드패널의 본문 셸(#app)을 그대로 재사용하고 바깥 레이아웃만 새로 얹었다.
// 이전 탐색 목록은 주입받는다. 프로젝트 목록은 S5-2에서 같은 방식으로 붙는다.

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
  // 이전 탐색 자리. 셸은 목록을 어떻게 얻는지 모른다(S5).
  sessions?: ReactNode;
  // 사이드바 맨 아래 자리. 로그인 버튼처럼 화면 전환과 무관한 것이 들어간다.
  // 셸이 내용을 모르게 두어야 ui-shared가 인증을 몰라도 된다.
  footer?: ReactNode;
}

export function AppShell({ children, sessions, footer }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className="appRoot">
      <aside className={drawerOpen ? "sidebar open" : "sidebar"}>
        <div className="sbHead">
          <Brand />
        </div>
        <div className="sbBody scroll">
          <div className="sbSection">{tr("nav_sessions")}</div>
          {sessions ?? <p className="sbEmpty">{tr("sessions_empty")}</p>}
          <div className="sbSection">{tr("nav_projects")}</div>
          <p className="sbEmpty">{tr("projects_empty")}</p>
        </div>
        {footer ? <div className="sbFoot">{footer}</div> : null}
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
