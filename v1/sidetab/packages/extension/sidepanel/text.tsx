// 표시 헬퍼. 문장 줄바꿈·첫 문장·날짜·용어 강조 등 순수 표시 변환.
import type { ReactNode } from "react";
import type { OutputLocale } from "@sidetab/shared";
import { LOCALE_TAG } from "./constants.js";

// 문장 단위 줄바꿈. 끊는 지점은 세 가지다. 개행 문자, 전각 종결부호(。！？) 바로 뒤,
// 그리고 반각 종결부호(.!?) 뒤에 공백이 오는 자리. 소수점이나 약어처럼 종결부호 뒤가
// 공백이 아니면 끊지 않는다. 또한 "1." "2." 같은 목록 번호(숫자 바로 뒤 마침표)는 끊지 않는다.
// 끊은 문장 사이에 <br/>를 넣는다.
export function sentLines(t: string): ReactNode[] {
  const segs = String(t ?? "")
    .split(/\n+|(?<=[。！？])|(?<=[^\d][.!?])(?=\s)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const out: ReactNode[] = [];
  segs.forEach((s, i) => {
    if (i > 0) out.push(<br key={"br" + i} />);
    out.push(s);
  });
  return out;
}

// 문장 배열로 쪼갠다. sentLines와 같은 분할 규칙(개행, 전각 종결부호, 반각 종결부호+공백,
// 단 숫자 뒤 마침표 "1." "2."는 목록 번호라 안 끊음). 활용 단계 리스트와 개념 핵심/나머지 분리에 쓴다.
export function splitSentences(t: string): string[] {
  return String(t ?? "")
    .split(/\n+|(?<=[。！？])|(?<=[^\d][.!?])(?=\s)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// 조건부 필드(판단 기준·예·내 상황에선 등)를 노출할 값이 실제로 있는지. LLM이 false·"없음"·"N/A"·"-" 같은
// 플레이스홀더를 줄 때가 있어 그런 값은 빈 것으로 본다. 타입은 string이 계약이지만 boolean false가 올 수 있어 방어한다.
export function hasVal(s: string | boolean | null | undefined): boolean {
  if (typeof s === "boolean") return s;
  const t = String(s ?? "").trim();
  return t !== "" && !["false", "null", "없음", "N/A", "해당없음", "해당 없음", "-"].includes(t);
}

// 첫 문장만 남긴다. 추천 이유처럼 한 문장만 보여줄 때 두 번째 문장 이후를 잘라 깔끔하게 한다.
export function firstSentence(t: string): string {
  const m = t.match(/[\s\S]*?[.!?](?=\s|$)/);
  return (m ? m[0] : t).trim();
}

// 이전 탐색 항목의 날짜 표기(로케일에 맞춰).
export function fmtDate(ms: number, locale: OutputLocale): string {
  return new Date(ms).toLocaleDateString(LOCALE_TAG[locale], { month: "short", day: "numeric" });
}

// 세션 목록 날짜 버킷. 오늘 자정 이후면 today, 최근 7일이면 week, 그보다 오래면 older.
export function dateBucket(ms: number): "today" | "week" | "older" {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ms >= startToday) return "today";
  if (ms >= startToday - 6 * 86400000) return "week";
  return "older";
}

// 텍스트에서 주어진 용어를 찾아 <em>로 감싼다(튜토리얼 1스텝의 전문 용어 강조용).
export function markTerms(text: string, terms: string[]): ReactNode[] {
  const list = terms.map((t) => t.trim()).filter(Boolean);
  if (!list.length) return [text];
  const esc = list.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${esc.join("|")})`, "g");
  return text.split(re).map((p, i) => (list.includes(p) ? <em key={i}>{p}</em> : <span key={i}>{p}</span>));
}

// 쉼표를 줄바꿈으로 바꿔 표시한다(쉼표 제거, 각 절을 한 줄로). 튜토리얼 문장·답변용.
export function commaLines(text: string): ReactNode[] {
  return text.split(",").map((s, i) => <span key={i}>{i > 0 && <br />}{s.trim()}</span>);
}
