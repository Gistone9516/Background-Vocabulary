// 통신선을 건너온 값의 형태 검사. 타입 선언은 컴파일 때만 존재하므로
// 서버 응답을 캐스팅만 하면 어긋난 형태가 런타임까지 그대로 들어온다.
// 타입 소유자가 검사도 소유해야 서버와 클라가 같은 정의를 본다.

import type { PrimerDoc } from "./types/persistence.js";

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isOptionalString(v: unknown): boolean {
  return v === undefined || typeof v === "string";
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
