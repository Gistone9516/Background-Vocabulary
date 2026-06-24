// 추천 어휘 카드 하나를 렌더한다.
// term, one_line, why, priority를 필수로 보여준다.
// 조건부 필드(direction, use_example, context_note, relates_to)는 있으면 보여준다.

import type { Term } from "@sidetab/shared";

interface Props {
  term: Term;
}

export function TermCard({ term }: Props) {
  return (
    <article style={styles.card}>
      <header style={styles.header}>
        <span style={styles.priority}>{term.priority}</span>
        <div style={styles.titleGroup}>
          <span style={styles.termName}>{term.term}</span>
          <span style={styles.kind}>{term.kind}</span>
        </div>
      </header>

      <p style={styles.oneLine}>{term.one_line}</p>

      <p style={styles.why}>{term.why}</p>

      {term.direction && (
        <div style={styles.extra}>
          <span style={styles.extraLabel}>적용 방향</span>
          <span>{term.direction}</span>
        </div>
      )}

      {term.use_example && (
        <div style={styles.extra}>
          <span style={styles.extraLabel}>용례</span>
          <span>{term.use_example}</span>
        </div>
      )}

      {term.context_note && (
        <div style={styles.extra}>
          <span style={styles.extraLabel}>맥락 주의</span>
          <span>{term.context_note}</span>
        </div>
      )}

      {term.relates_to && term.relates_to.length > 0 && (
        <div style={styles.extra}>
          <span style={styles.extraLabel}>같이 볼 어휘</span>
          <span>{term.relates_to.join(", ")}</span>
        </div>
      )}
    </article>
  );
}

// 인라인 스타일. calm, rounded, 정보 밀도 낮게 유지한다.
const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "#ffffff",
    borderRadius: 14,
    padding: "16px 18px",
    marginBottom: 10,
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
    border: "1px solid #ebebeb",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  priority: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
    borderRadius: 8,
    background: "#e8f0fe",
    color: "#3d63dd",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
    marginTop: 2,
  },
  titleGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  termName: {
    fontSize: 15,
    fontWeight: 700,
    color: "#111",
    lineHeight: 1.3,
  },
  kind: {
    fontSize: 11,
    color: "#888",
    fontWeight: 400,
  },
  oneLine: {
    fontSize: 13,
    color: "#333",
    lineHeight: 1.55,
    marginBottom: 6,
  },
  why: {
    fontSize: 12,
    color: "#777",
    lineHeight: 1.5,
    borderLeft: "2px solid #e0e0e0",
    paddingLeft: 8,
  },
  extra: {
    display: "flex",
    gap: 6,
    marginTop: 8,
    fontSize: 12,
    color: "#555",
    lineHeight: 1.5,
  },
  extraLabel: {
    color: "#3d63dd",
    fontWeight: 600,
    flexShrink: 0,
    fontSize: 11,
    paddingTop: 1,
  },
};
