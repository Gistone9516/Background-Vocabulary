// DeepSeek LLM 클라이언트(공급자 어댑터). 웹표준 fetch·Web Streams만 사용. v1 core/llm 이식.
// complete=구조화 JSON 1회(P1·P2·P4·P5), streamTerms=term 단위 스트리밍(P3). 취소는 업스트림 fetch까지 전파.

import type { LlmClient, LlmRequest, StreamEvent } from "@vock/shared";
import { consumeSseStream } from "./sse-parser.js";

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

interface DeepSeekBody {
  model: string;
  messages: { role: string; content: string }[];
  stream: boolean;
  response_format: { type: "json_object" };
  thinking: { type: "disabled" };
  max_tokens?: number;
}

// json_object 모드라 보통 순수 JSON이지만 약모델이 드물게 코드펜스·잡텍스트로 감싸는 경우를 방어한다.
function parseLooseJson<T>(raw: string): T {
  try { return JSON.parse(raw) as T; } catch { /* 폴백 */ }
  const fenced = raw.replace(/^[\s\S]*?```(?:json)?\s*/i, "").replace(/```[\s\S]*$/, "").trim();
  try { return JSON.parse(fenced) as T; } catch { /* 폴백 */ }
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
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

  private resolveModel(model: string): string {
    if (model === this.proModel) return this.proModel;
    return this.flashModel;
  }

  private buildHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" };
  }

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
    if (content !== "") return parseLooseJson<T>(content);
    const retried = await this.fetchOnce(body); // 빈 content면 1회 재시도
    if (retried !== "") return parseLooseJson<T>(retried);
    throw new Error("DeepSeek complete: 두 번 시도했으나 content가 빈 문자열. model=" + body.model);
  }

  private async fetchOnce(body: DeepSeekBody): Promise<string> {
    const res = await fetch(DEEPSEEK_ENDPOINT, { method: "POST", headers: this.buildHeaders(), body: JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    return json.choices[0]?.message?.content ?? "";
  }

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
    if (signal) {
      if (signal.aborted) abortCtrl.abort();
      else signal.addEventListener("abort", () => abortCtrl.abort(), { once: true });
    }

    return new ReadableStream<StreamEvent>({
      start: async (controller) => {
        let res: Response;
        try {
          res = await fetch(DEEPSEEK_ENDPOINT, { method: "POST", headers, body: JSON.stringify(body), signal: abortCtrl.signal });
        } catch (err) {
          if (abortCtrl.signal.aborted) { controller.close(); return; }
          const msg = err instanceof Error ? err.message : String(err);
          controller.enqueue({ type: "error", code: "NETWORK_ERROR", message: msg });
          controller.close();
          return;
        }
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error(`DeepSeek HTTP ${res.status}:`, text.slice(0, 500)); // 업스트림 본문은 서버 로그에만
          controller.enqueue({ type: "error", code: `HTTP_${res.status}`, message: "AI 응답 생성에 실패했어요. 잠시 후 다시 시도해 주세요." });
          controller.close();
          return;
        }
        if (!res.body) {
          controller.enqueue({ type: "error", code: "NO_BODY", message: "응답 바디가 없음" });
          controller.close();
          return;
        }
        try {
          await consumeSseStream(res.body, controller);
        } catch (err) {
          if (abortCtrl.signal.aborted) { controller.close(); return; }
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
