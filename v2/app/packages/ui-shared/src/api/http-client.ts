// ApiPort의 fetch 구현. 브라우저와 Tauri가 같은 화면 코드를 쓰도록 fetch 자체를 주입받는다.
// 이 파일 밖으로 상태 코드나 서버 에러 문자열이 새지 않는다. 실패는 전부 ApiError로 바꿔 던진다.

import type { Prompt1In, Prompt1Out, Prompt2In, Prompt2Out, ClientLimits } from "@vock/shared";
import type { ApiPort } from "./port.js";
import { classifyResponse, type ApiError } from "./errors.js";

export interface HttpApiConfig {
  baseUrl: string;
  getAccessToken?: () => string | null;
  fetch?: typeof globalThis.fetch;
}

function fail(e: ApiError): never {
  throw e;
}

export class HttpApiClient implements ApiPort {
  private readonly base: string;
  private readonly token: () => string | null;
  private readonly doFetch: typeof globalThis.fetch;

  constructor(cfg: HttpApiConfig) {
    // 끝 슬래시를 지워 경로를 붙일 때 이중 슬래시가 생기지 않게 한다.
    this.base = cfg.baseUrl.replace(/\/+$/, "");
    this.token = cfg.getAccessToken ?? (() => null);
    this.doFetch = cfg.fetch ?? globalThis.fetch.bind(globalThis);
  }

  config(signal?: AbortSignal): Promise<ClientLimits> {
    return this.send<ClientLimits>("GET", "/config", undefined, signal);
  }

  classify(input: Prompt1In, signal?: AbortSignal): Promise<Prompt1Out> {
    return this.send<Prompt1Out>("POST", "/classify", input, signal);
  }

  next(input: Prompt2In, signal?: AbortSignal): Promise<Prompt2Out> {
    return this.send<Prompt2Out>("POST", "/next", input, signal);
  }

  private async send<T>(method: string, path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    const tok = this.token();
    if (tok) headers["authorization"] = `Bearer ${tok}`;

    let res: Response;
    try {
      res = await this.doFetch(this.base + path, {
        method,
        headers,
        signal: signal ?? null,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (e) {
      // 호출자가 취소한 것은 실패가 아니다. 그대로 올려 보내 상태 기계가 무시하게 한다.
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      return fail({ kind: "network" });
    }

    const parsed = await this.readJson(res);
    if (!res.ok) return fail(classifyResponse(res.status, parsed));
    if (parsed === undefined) return fail({ kind: "malformed" });
    return parsed as T;
  }

  // 본문이 비었거나 JSON이 아니어도 던지지 않는다. 에러 응답의 본문 파싱 실패가
  // 원래 에러를 덮어써 원인을 잃는 것을 막는다.
  private async readJson(res: Response): Promise<unknown> {
    try {
      const text = await res.text();
      if (!text) return undefined;
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }
}
