// DeepSeek LLM 클라이언트. web-standard fetch와 Web Streams만 사용한다.
// Node 전용 또는 Workers 전용 API는 일절 쓰지 않는다.

import type { LlmClient, LlmRequest } from "@sidetab/shared";
import type { StreamEvent, Term } from "@sidetab/shared";

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

// DeepSeek 요청 바디 공통 필드.
interface DeepSeekBody {
  model: string;
  messages: { role: string; content: string }[];
  stream: boolean;
  response_format: { type: "json_object" };
  thinking: { type: "disabled" };
  max_tokens?: number;
}

// json_object 모드라 보통 순수 JSON이지만, 약모델이 드물게 코드펜스나 잡텍스트로 감싸는 경우를 방어한다.
function parseLooseJson<T>(raw: string): T {
  try { return JSON.parse(raw) as T; } catch { /* 아래 폴백으로 */ }
  const fenced = raw.replace(/^[\s\S]*?```(?:json)?\s*/i, "").replace(/```[\s\S]*$/, "").trim();
  try { return JSON.parse(fenced) as T; } catch { /* 아래 폴백으로 */ }
  const s = raw.indexOf("{"); const e = raw.lastIndexOf("}");
  if (s >= 0 && e > s) return JSON.parse(raw.slice(s, e + 1)) as T;
  throw new Error("DeepSeek complete: JSON 파싱 실패");
}

export class DeepSeekLlmClient implements LlmClient {
  private readonly apiKey: string;
  private readonly flashModel: string;
  private readonly proModel: string;

  constructor(opts: { apiKey: string; flashModel?: string; proModel?: string }) {
    this.apiKey = opts.apiKey;
    this.flashModel = opts.flashModel ?? "deepseek-v4-flash";
    this.proModel = opts.proModel ?? "deepseek-v4-pro";
  }

  // 요청의 model 필드로 실제 모델 ID를 고른다.
  // 호출자가 넘긴 model 값이 proModel과 일치하면 pro를 쓰고, 그 외는 flash를 쓴다.
  private resolveModel(model: string): string {
    if (model === this.proModel) return this.proModel;
    return this.flashModel;
  }

  private buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  // 구조화 JSON 1회 응답. 프롬프트 1, 2, 4, 5에 쓴다.
  // thinking 비활성과 json_object 모드를 항상 켠다.
  // content가 빈 문자열이면 한 번 재시도한다.
  async complete<T>(req: LlmRequest): Promise<T> {
    const body: DeepSeekBody = {
      model: this.resolveModel(req.model),
      messages: req.messages,
      stream: false,
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      ...(req.maxTokens !== undefined && { max_tokens: req.maxTokens }),
    };

    const content = await this.fetchOnce(body);
    if (content !== "") {
      return parseLooseJson<T>(content);
    }

    // 빈 content를 받으면 한 번 재시도한다.
    const retried = await this.fetchOnce(body);
    if (retried !== "") {
      return parseLooseJson<T>(retried);
    }

    throw new Error(
      "DeepSeek complete: 두 번 시도했으나 content가 빈 문자열로 반환됨. model=" + body.model,
    );
  }

  // 단일 HTTP 요청을 보내고 choices[0].message.content를 반환한다.
  private async fetchOnce(body: DeepSeekBody): Promise<string> {
    const res = await fetch(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `DeepSeek HTTP ${res.status}: ${text.slice(0, 300)}`,
      );
    }

    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    return json.choices[0]?.message?.content ?? "";
  }

  // term 단위 스트리밍. 프롬프트 3에 쓴다.
  // DeepSeek SSE 바이트를 파싱해 StreamEvent를 내보낸다.
  // ReadableStream이 cancel되면 업스트림 fetch를 AbortController로 중단한다.
  streamTerms(req: LlmRequest, signal?: AbortSignal): ReadableStream<StreamEvent> {
    const body: DeepSeekBody = {
      model: this.resolveModel(req.model),
      messages: req.messages,
      stream: true,
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      ...(req.maxTokens !== undefined && { max_tokens: req.maxTokens }),
    };

    const headers = this.buildHeaders();
    const abortCtrl = new AbortController();
    // 외부에서 받은 signal의 취소를 내부 fetch로 전파한다(구현계획 §5 취소 체인).
    if (signal) {
      if (signal.aborted) abortCtrl.abort();
      else signal.addEventListener("abort", () => abortCtrl.abort(), { once: true });
    }

    return new ReadableStream<StreamEvent>({
      start: async (controller) => {
        let res: Response;
        try {
          res = await fetch(DEEPSEEK_ENDPOINT, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: abortCtrl.signal,
          });
        } catch (err) {
          // fetch 자체 실패(네트워크 오류 또는 abort).
          if (abortCtrl.signal.aborted) {
            controller.close();
            return;
          }
          const msg = err instanceof Error ? err.message : String(err);
          controller.enqueue({ type: "error", code: "NETWORK_ERROR", message: msg });
          controller.close();
          return;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error(`DeepSeek HTTP ${res.status}:`, text.slice(0, 500)); // 업스트림 본문은 서버 로그에만 남긴다(클라 누출 차단)
          controller.enqueue({
            type: "error",
            code: `HTTP_${res.status}`,
            message: "AI 응답 생성에 실패했어요. 잠시 후 다시 시도해 주세요.",
          });
          controller.close();
          return;
        }

        if (!res.body) {
          controller.enqueue({
            type: "error",
            code: "NO_BODY",
            message: "응답 바디가 없음",
          });
          controller.close();
          return;
        }

        try {
          await consumeSseStream(res.body, controller);
        } catch (err) {
          if (abortCtrl.signal.aborted) {
            controller.close();
            return;
          }
          const msg = err instanceof Error ? err.message : String(err);
          controller.enqueue({ type: "error", code: "STREAM_ERROR", message: msg });
          controller.close();
        }
      },

      cancel() {
        abortCtrl.abort();
      },
    });
  }
}

// SSE 바이트 스트림을 읽으면서 term 단위로 StreamEvent를 컨트롤러에 넣는다.
// 누적 content를 증분 파싱해 terms 배열 안의 완성된 Term 객체를 순서대로 꺼낸다.
async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  controller: ReadableStreamDefaultController<StreamEvent>,
): Promise<void> {
  const decoder = new TextDecoder("utf-8");
  const reader = body.getReader();

  // 줄 단위로 이어붙이기 위한 잔여 텍스트 버퍼.
  let lineBuffer = "";
  // 모델이 내보낸 delta.content를 누적하는 버퍼.
  let accContent = "";
  // 지금까지 emit한 term의 개수. 중복 emit을 막는다.
  let emittedCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lineBuffer += decoder.decode(value, { stream: true });

      // 줄바꿈 기준으로 분리한다. 마지막 불완전 줄은 다음 청크까지 보관한다.
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";

      for (const raw of lines) {
        const line = raw.trimEnd();

        // 빈 줄은 SSE 이벤트 구분자. 무시한다.
        if (line === "") continue;
        // keep-alive 또는 주석 줄.
        if (line.startsWith(":")) continue;
        // 스트림 종료 마커.
        if (line === "data: [DONE]") continue;

        if (!line.startsWith("data: ")) continue;

        const payload = line.slice(6);
        let chunk: { choices: { delta: { content?: string } }[] };
        try {
          chunk = JSON.parse(payload);
        } catch {
          // JSON 파싱 실패한 줄은 건너뛴다.
          continue;
        }

        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          accContent += delta;
          // 누적 content에서 완성된 Term 객체를 추출해 emit한다.
          emittedCount = emitCompletedTerms(accContent, emittedCount, controller);
        }
      }
    }

    // 스트림이 끝난 뒤 잔여 lineBuffer에도 data 라인이 남을 수 있다.
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
        // 마지막 잔여 줄 파싱 실패는 무시한다.
      }
    }
  } finally {
    reader.releaseLock();
  }

  controller.enqueue({ type: "done" });
  controller.close();
}

// accContent 안에서 아직 emit하지 않은 완성된 Term 객체를 꺼내 controller에 넣는다.
// 완성된 Term 객체의 개수를 반환한다(다음 호출의 emittedCount로 쓴다).
// 로버스트 증분 파서: brace 깊이와 문자열/이스케이프 상태를 트래킹한다.
// 단순 정규식은 중첩 중괄호나 따옴표 안 중괄호를 깨뜨리므로 사용하지 않는다.
function emitCompletedTerms(
  acc: string,
  alreadyEmitted: number,
  controller: ReadableStreamDefaultController<StreamEvent>,
): number {
  // "terms" 배열의 시작 인덱스를 찾는다.
  const termsArrayStart = findTermsArrayStart(acc);
  if (termsArrayStart < 0) return alreadyEmitted;

  // termsArrayStart 이후에서 개별 객체를 순서대로 추출한다.
  let searchFrom = termsArrayStart + 1; // '[' 바로 다음
  let foundCount = 0;
  let emitted = alreadyEmitted;

  while (true) {
    // 다음 '{' 위치를 찾는다. 공백과 쉼표를 건너뛴다.
    const objStart = findNextObjectStart(acc, searchFrom);
    if (objStart < 0) break;

    // 해당 '{' 부터 짝 '}'까지 추출한다.
    const objEnd = findMatchingClose(acc, objStart);
    if (objEnd < 0) break; // 아직 닫히지 않은 객체. 청크 더 기다린다.

    foundCount++;
    if (foundCount > emitted) {
      // 새로 완성된 객체를 파싱해 emit한다.
      const raw = acc.slice(objStart, objEnd + 1);
      try {
        const term = JSON.parse(raw) as Term;
        controller.enqueue({ type: "term", term });
        emitted++;
      } catch {
        // 파싱 실패한 객체는 건너뛴다. emitted는 증가하지 않는다.
        emitted++;
      }
    }

    searchFrom = objEnd + 1;
  }

  return emitted;
}

// 누적 텍스트에서 "terms" 키의 배열 시작 인덱스 '[' 를 찾는다.
// 못 찾으면 -1을 반환한다.
function findTermsArrayStart(text: string): number {
  // "terms" 키 뒤에 오는 첫 '[' 를 찾는다.
  const keyIdx = text.indexOf('"terms"');
  if (keyIdx < 0) return -1;

  const bracketIdx = text.indexOf("[", keyIdx + 7);
  return bracketIdx;
}

// pos 이후에서 문자열 밖의 첫 '{' 위치를 반환한다. 없으면 -1.
function findNextObjectStart(text: string, pos: number): number {
  let inStr = false;
  let escape = false;
  for (let i = pos; i < text.length; i++) {
    const ch = text[i]!;
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (!inStr && ch === "{") return i;
    // ']' 를 만나면 terms 배열이 닫힌 것이다. 더 찾지 않는다.
    if (!inStr && ch === "]") return -1;
  }
  return -1;
}

// start 위치의 '{' 에 대응하는 '}' 의 위치를 반환한다.
// 문자열 내 중괄호와 이스케이프를 올바르게 처리한다.
// 짝이 없으면(스트림이 잘림) -1을 반환한다.
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
      if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) return i;
      }
    }
  }

  return -1; // 아직 닫히지 않음.
}
