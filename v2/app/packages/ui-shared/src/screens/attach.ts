// 파일 첨부 판정·읽기(FR-901, C4 S4 DS4-1). v1 sidepanel/file.ts 이식 — 웹 표준(File·FileReader)만
// 쓰므로 웹과 데스크톱 웹뷰가 같은 코드를 탄다(§1-1: 어댑터 없이 화면 한 벌로 두 플랫폼이 켜진다).
//
// 텍스트 계열만 받는다. 바이너리 추출(PDF·이미지)은 하지 않는다 — C-09가 OCR·문서 자동읽기를
// 금지하므로 애초에 범위 밖이고, "웹보다 넓은 형식"(FR-901)이 필요해지는 날 능력 필드를 만든다.

export function isTextFile(f: File): boolean {
  if (f.type && (f.type.startsWith("text/") || f.type === "application/json" || f.type === "application/xml")) return true;
  return /\.(txt|md|markdown|csv|json|ya?ml|xml|html?|css|js|ts|tsx|jsx|py|java|c|cpp|cs|go|rs|rb|php|sh|sql|log|tex)$/i.test(f.name);
}

export function readTextFile(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsText(f);
  });
}

// 화면이 드는 첨부 상태. 절단 여부를 함께 들어 고지(attach_truncated)에 쓴다.
export interface AttachedFile {
  name: string;
  text: string;
  truncated: boolean;
}

// 파일 → 첨부 상태. 절단 상한은 /config의 maxContextChars(서버도 같은 값으로 다시 자른다 — DS4-2).
// 텍스트 파일이 아니면 null — 호출부가 attach_texterr를 고지한다.
export async function toAttached(f: File, maxChars: number): Promise<AttachedFile | null> {
  if (!isTextFile(f)) return null;
  const raw = (await readTextFile(f)).trim();
  const truncated = raw.length > maxChars;
  return { name: f.name, text: truncated ? raw.slice(0, maxChars) : raw, truncated };
}
