// keyset 커서. (정렬값, id) 쌍을 불투명 base64로 인코딩한다.
// 목록은 (sortValue DESC, id DESC) 순서이며 커서는 그 경계를 지시한다.

export function encodeCursor(sortValue: number, id: string): string {
  return Buffer.from(JSON.stringify([sortValue, id]), "utf-8").toString("base64url");
}

export function decodeCursor(cursor: string | null | undefined): { sortValue: number; id: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
    if (Array.isArray(parsed) && typeof parsed[0] === "number" && typeof parsed[1] === "string") {
      return { sortValue: parsed[0], id: parsed[1] };
    }
    return null;
  } catch {
    return null;
  }
}
