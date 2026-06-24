// 사이드패널 메인 앱.
// 현재는 MVP 셸이다. 하드코딩된 샘플 RecommendInput으로 /recommend를 호출한다.
// 진입 흐름(프롬프트1, 프롬프트2 UI)은 후속 작업이다(구현계획 9장 D 태스크 참고).

import { useState, useEffect, useRef, useCallback } from "react";
import type { StreamEvent, Term } from "@sidetab/shared";
import { streamRecommend } from "./api.js";
import { mockStreamHappy, mockStreamError } from "./mockApi.js";
import { TermCard } from "./TermCard.js";

// 개발 환경에서 목 스트림을 쓸지 여부.
// Vite가 빌드 시 import.meta.env.DEV를 인라인한다.
const USE_MOCK = import.meta.env.DEV;
const MOCK_ERROR = false; // 에러 경로를 테스트할 때 true로 바꾼다.

// 하드코딩된 샘플 입력. 진입 흐름(프롬프트1, 프롬프트2) UI 구현 전 임시 입력이다.
// 실제 입력은 사용자가 자유문장을 입력하면 프롬프트1이 분류하고 프롬프트2가 좁힌다.
const SAMPLE_INPUT = {
  area: "PID 제어 시스템",
  job_type: ["문제해결"] as const,
  domain: "pid_control",
  topic: "적분기 와인드업 문제",
  locale: "en" as const,
};

type Status = "idle" | "loading" | "done" | "error";

export function App() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  // 스트림을 시작한다. 이미 실행 중이면 중단하고 재시작한다.
  const startStream = useCallback(async () => {
    // 이전 요청이 있으면 중단한다.
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setTerms([]);
    setStatus("loading");
    setErrorMsg("");

    const handleEvent = (ev: StreamEvent) => {
      if (ev.type === "term") {
        setTerms((prev) => [...prev, ev.term]);
      } else if (ev.type === "done") {
        setStatus("done");
      } else if (ev.type === "error") {
        setErrorMsg(ev.message);
        setStatus("error");
      }
    };

    try {
      if (USE_MOCK) {
        if (MOCK_ERROR) {
          await mockStreamError(handleEvent, controller.signal);
        } else {
          await mockStreamHappy(handleEvent, controller.signal);
        }
        // 목 스트림은 done 이벤트를 명시적으로 보내지 않아도 된다.
        // handleEvent에서 done을 처리하지만 fixture에 포함돼 있으면 자동으로 처리된다.
        setStatus((prev) => (prev === "loading" ? "done" : prev));
      } else {
        await streamRecommend(SAMPLE_INPUT, "free", handleEvent, controller.signal);
        setStatus((prev) => (prev === "loading" ? "done" : prev));
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // 사용자가 직접 취소했거나 언마운트 시 발생한다. 조용히 무시한다.
        return;
      }
      setErrorMsg((err as Error).message ?? "알 수 없는 오류");
      setStatus("error");
    }
  }, []);

  // 컴포넌트 마운트 시 자동으로 스트림을 시작한다.
  useEffect(() => {
    startStream();
    return () => {
      // 패널이 닫히거나 언마운트될 때 업스트림 fetch를 취소한다.
      // 취소 체인: AbortController.abort() 호출이 fetch signal을 통해 Worker로 전달되고,
      // Worker의 readable cancel이 DeepSeek 업스트림 연결을 중단한다.
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [startStream]);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>배경지식 사이드탭</h1>
        <p style={styles.subtitle}>
          {/* 현재는 샘플 입력으로 실행된다. 진입 흐름 UI는 후속 작업이다. */}
          {USE_MOCK ? "목 모드 (개발용)" : SAMPLE_INPUT.area}
        </p>
      </header>

      <main style={styles.main}>
        {status === "loading" && terms.length === 0 && (
          <div style={styles.loadingState}>
            <div style={styles.spinner} />
            <p style={styles.loadingText}>어휘를 가져오는 중...</p>
          </div>
        )}

        {terms.length > 0 && (
          <section>
            {status === "loading" && (
              <div style={styles.streamingIndicator}>
                <span style={styles.dot} />
                <span style={styles.streamingText}>스트리밍 중</span>
              </div>
            )}
            {terms.map((term, i) => (
              <TermCard key={`${term.term}-${i}`} term={term} />
            ))}
          </section>
        )}

        {status === "done" && terms.length === 0 && (
          <div style={styles.emptyState}>
            <p>추천된 어휘가 없습니다.</p>
          </div>
        )}

        {status === "error" && (
          <div style={styles.errorState}>
            <p style={styles.errorTitle}>오류가 발생했습니다</p>
            <p style={styles.errorMsg}>{errorMsg}</p>
            {terms.length > 0 && (
              <p style={styles.partialNote}>일부 어휘는 위에 표시됩니다.</p>
            )}
            <button style={styles.retryBtn} onClick={startStream}>
              다시 시도
            </button>
          </div>
        )}
      </main>

      {status === "done" && terms.length > 0 && (
        <footer style={styles.footer}>
          <button style={styles.refreshBtn} onClick={startStream}>
            새로고침
          </button>
        </footer>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    background: "#f7f7f8",
  },
  header: {
    padding: "20px 18px 12px",
    borderBottom: "1px solid #ebebeb",
    background: "#fff",
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: "#888",
  },
  main: {
    flex: 1,
    padding: "14px 14px 0",
  },
  loadingState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    paddingTop: 60,
    gap: 14,
  },
  spinner: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "3px solid #e0e0e0",
    borderTopColor: "#3d63dd",
    animation: "spin 0.8s linear infinite",
  },
  loadingText: {
    fontSize: 13,
    color: "#888",
  },
  streamingIndicator: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#3d63dd",
    animation: "pulse 1.2s ease-in-out infinite",
  },
  streamingText: {
    fontSize: 11,
    color: "#3d63dd",
  },
  emptyState: {
    textAlign: "center",
    paddingTop: 60,
    color: "#aaa",
    fontSize: 13,
  },
  errorState: {
    background: "#fff4f4",
    borderRadius: 12,
    padding: "16px 18px",
    border: "1px solid #ffd0d0",
    marginTop: 10,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#c0392b",
    marginBottom: 6,
  },
  errorMsg: {
    fontSize: 12,
    color: "#666",
    marginBottom: 8,
  },
  partialNote: {
    fontSize: 11,
    color: "#888",
    marginBottom: 10,
  },
  retryBtn: {
    padding: "8px 18px",
    borderRadius: 8,
    border: "none",
    background: "#3d63dd",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  footer: {
    padding: "14px 14px",
    display: "flex",
    justifyContent: "center",
  },
  refreshBtn: {
    padding: "8px 22px",
    borderRadius: 8,
    border: "1px solid #ddd",
    background: "#fff",
    color: "#555",
    fontSize: 13,
    cursor: "pointer",
  },
};
