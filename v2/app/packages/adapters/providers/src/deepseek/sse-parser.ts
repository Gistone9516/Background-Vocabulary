// DeepSeek SSE 바이트 → StreamEvent 증분 파서. v1 core/llm 이식(로직 verbatim).
// 누적 content를 증분 파싱해 terms 배열의 완성된 Term을 순서대로 emit한다.
// 단순 정규식은 중첩 중괄호·따옴표 안 중괄호를 깨뜨리므로 brace 깊이·문자열/이스케이프 상태를 추적한다.

import type { StreamEvent, Term } from "@vock/shared";

// accContent 안에서 아직 emit하지 않은 완성된 Term 객체를 꺼내 controller에 넣는다. 완성 개수를 반환.
export function emitCompletedTerms(acc: string, alreadyEmitted: number, controller: ReadableStreamDefaultController<StreamEvent>): number {
  const termsArrayStart = findTermsArrayStart(acc);
  if (termsArrayStart < 0) return alreadyEmitted;

  let searchFrom = termsArrayStart + 1; // '[' 바로 다음
  let foundCount = 0;
  let emitted = alreadyEmitted;

  while (true) {
    const objStart = findNextObjectStart(acc, searchFrom);
    if (objStart < 0) break;
    const objEnd = findMatchingClose(acc, objStart);
    if (objEnd < 0) break; // 아직 닫히지 않은 객체. 청크 더 기다린다.

    foundCount++;
    if (foundCount > emitted) {
      const raw = acc.slice(objStart, objEnd + 1);
      try {
        const term = JSON.parse(raw) as Term;
        controller.enqueue({ type: "term", term });
        emitted++;
      } catch {
        emitted++; // 파싱 실패 객체는 건너뛴다.
      }
    }
    searchFrom = objEnd + 1;
  }
  return emitted;
}

// "terms" 키 뒤 첫 '[' 인덱스. 없으면 -1.
function findTermsArrayStart(text: string): number {
  const keyIdx = text.indexOf('"terms"');
  if (keyIdx < 0) return -1;
  return text.indexOf("[", keyIdx + 7);
}

// pos 이후 문자열 밖의 첫 '{' 위치. ']'를 만나면 배열이 닫힌 것으로 보고 -1.
function findNextObjectStart(text: string, pos: number): number {
  let inStr = false;
  let escape = false;
  for (let i = pos; i < text.length; i++) {
    const ch = text[i]!;
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (!inStr && ch === "{") return i;
    if (!inStr && ch === "]") return -1;
  }
  return -1;
}

// start의 '{'에 대응하는 '}' 위치. 문자열 내 중괄호·이스케이프 처리. 미완이면 -1.
function findMatchingClose(text: string, start: number): number {
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (!inStr) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

// SSE 바이트 스트림을 읽으며 term 단위로 StreamEvent를 controller에 넣고, 끝에서 done을 enqueue·close한다.
export async function consumeSseStream(body: ReadableStream<Uint8Array>, controller: ReadableStreamDefaultController<StreamEvent>): Promise<void> {
  const decoder = new TextDecoder("utf-8");
  const reader = body.getReader();
  let lineBuffer = "";
  let accContent = "";
  let emittedCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trimEnd();
        if (line === "") continue;
        if (line.startsWith(":")) continue;
        if (line === "data: [DONE]") continue;
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        let chunk: { choices: { delta: { content?: string } }[] };
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          accContent += delta;
          emittedCount = emitCompletedTerms(accContent, emittedCount, controller);
        }
      }
    }
    if (lineBuffer.startsWith("data: ") && lineBuffer !== "data: [DONE]") {
      const payload = lineBuffer.slice(6);
      try {
        const chunk = JSON.parse(payload) as { choices: { delta: { content?: string } }[] };
        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          accContent += delta;
          emitCompletedTerms(accContent, emittedCount, controller);
        }
      } catch {
        // 마지막 잔여 줄 파싱 실패는 무시.
      }
    }
  } finally {
    reader.releaseLock();
  }
  controller.enqueue({ type: "done" });
  controller.close();
}
