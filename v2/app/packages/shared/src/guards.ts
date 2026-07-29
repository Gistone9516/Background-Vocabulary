// 통신선을 건너온 값의 형태 검사. 타입 선언은 컴파일 때만 존재하므로
// 서버 응답을 캐스팅만 하면 어긋난 형태가 런타임까지 그대로 들어온다.
// 타입 소유자가 검사도 소유해야 서버와 클라가 같은 정의를 본다.

import type { Page, PrimerDoc, SessionSummary } from "./types/persistence.js";

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isOptionalString(v: unknown): boolean {
  return v === undefined || typeof v === "string";
}

// 목록 응답. 커서는 불투명 문자열이므로 형태만 본다.
export function isPage<T>(item: (v: unknown) => v is T) {
  return (v: unknown): v is Page<T> => {
    if (!v || typeof v !== "object") return false;
    const p = v as Record<string, unknown>;
    const cursor = p["nextCursor"];
    if (cursor !== null && typeof cursor !== "string") return false;
    return Array.isArray(p["items"]) && p["items"].every(item);
  };
}

export function isSessionSummary(v: unknown): v is SessionSummary {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s["session_id"] === "string" &&
    typeof s["topic"] === "string" &&
    (s["area"] === null || typeof s["area"] === "string") &&
    typeof s["domain_risk"] === "string" &&
    (s["project_id"] === null || typeof s["project_id"] === "string") &&
    typeof s["pinned"] === "boolean" &&
    typeof s["generating"] === "boolean" &&
    typeof s["created_at"] === "number" &&
    typeof s["updated_at"] === "number"
  );
}

export function isPrimerDoc(v: unknown): v is PrimerDoc {
  if (!v || typeof v !== "object") return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d["locale"] === "string" &&
    typeof d["area"] === "string" &&
    typeof d["task_intent"] === "string" &&
    isOptionalString(d["user_condition"]) &&
    isOptionalString(d["context_note"]) &&
    isStringArray(d["known_terms"]) &&
    isStringArray(d["unknown_terms"])
  );
}
