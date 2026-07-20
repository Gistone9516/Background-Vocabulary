// 파일 첨부(pro 전용) 보조. 텍스트 파일 판별과 읽기.

// 텍스트 파일만 허용(타입 또는 확장자). 바이너리(PDF·이미지 등)는 거부한다.
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
