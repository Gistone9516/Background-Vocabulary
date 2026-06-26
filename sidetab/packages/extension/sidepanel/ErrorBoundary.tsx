// 렌더 중 예기치 못한 throw가 나도 화면이 통째로 사라지지 않게 막는 안전망.
// 예를 들어 백엔드가 비정상 응답을 줘서 렌더가 깨지면, 블랭크 대신 복구 화면을 보여주고 다시 시작하게 한다.
import { Component, type ReactNode, type ErrorInfo } from "react";

const FALLBACK: Record<string, { title: string; lead: string; retry: string }> = {
  ko: { title: "문제가 생겼어요", lead: "예상치 못한 오류로 화면이 멈췄어요. 다시 시작해 주세요.", retry: "다시 시작" },
  en: { title: "Something went wrong", lead: "An unexpected error stopped the screen. Please restart.", retry: "Restart" },
  ja: { title: "問題が発生しました", lead: "予期しないエラーで画面が止まりました。もう一度始めてください。", retry: "やり直す" },
  zh: { title: "出现了问题", lead: "意外错误导致页面停止。请重新开始。", retry: "重新开始" },
};
function fbLocale(): string {
  try { const l = localStorage.getItem("sidetab:locale"); if (l && FALLBACK[l]) return l; } catch { /* 무시 */ }
  return "ko";
}

interface Props { children: ReactNode }
interface S { failed: boolean }
export class ErrorBoundary extends Component<Props, S> {
  state: S = { failed: false };
  static getDerivedStateFromError(): S { return { failed: true }; }
  componentDidCatch(err: Error, info: ErrorInfo) { console.error("렌더 오류로 복구 화면 표시:", err, info); }
  render() {
    if (!this.state.failed) return this.props.children;
    const t = FALLBACK[fbLocale()];
    // 다시 시작은 페이지 리로드로 상태를 초기화한다. pro 여부는 localStorage에 남아 있어 유지된다.
    return (
      <div id="app">
        <div className="center">
          <div className="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}><path d="M12 8v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg></div>
          <h2>{t.title}</h2>
          <p className="lead" style={{ margin: 0 }}>{t.lead}</p>
          <button className="btn btn-ghost" style={{ width: "auto", padding: "11px 18px" }} onClick={() => location.reload()}>{t.retry}</button>
        </div>
      </div>
    );
  }
}
