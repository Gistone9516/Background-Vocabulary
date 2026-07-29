// ApiPort의 fetch 구현. 브라우저와 Tauri가 같은 화면 코드를 쓰도록 fetch 자체를 주입받는다.
// 이 파일 밖으로 상태 코드나 서버 에러 문자열이 새지 않는다. 실패는 전부 ApiError로 바꿔 던진다.

import type {
  ClientLimits,
  PreviewIn,
  PreviewOut,
  Prompt1In,
  Prompt1Out,
  Prompt2In,
  Prompt2Out,
  Prompt5In,
  Prompt5Out,
  RecommendInput,
  StreamEvent,
} from "@vock/shared";
import { createSseParser } from "@vock/shared";
import type { ApiPort, AuthPort, AuthSession } from "./port.js";
import { classifyResponse, isApiError, type ApiError } from "./errors.js";

export interface HttpApiConfig {
  baseUrl: string;
  getAccessToken?: () => string | null;
  fetch?: typeof globalThis.fetch;
  // 401을 받았을 때 한 번만 재발급을 시도한다. 성공하면 원 요청을 한 번만 다시 보낸다.
  // 재발급도 실패하면 null을 돌려주고, 그때는 재시도하지 않는다(스펙 A-7).
  onUnauthorized?: () => Promise<string | null>;
}

function fail(e: ApiError): never {
  throw e;
}

export class HttpApiClient implements ApiPort, AuthPort {
  private readonly base: string;
  private readonly token: () => string | null;
  private readonly doFetch: typeof globalThis.fetch;
  private readonly onUnauthorized: (() => Promise<string | null>) | null;

  constructor(cfg: HttpApiConfig) {
    // 끝 슬래시를 지워 경로를 붙일 때 이중 슬래시가 생기지 않게 한다.
    this.base = cfg.baseUrl.replace(/\/+$/, "");
    this.token = cfg.getAccessToken ?? (() => null);
    this.doFetch = cfg.fetch ?? globalThis.fetch.bind(globalThis);
    this.onUnauthorized = cfg.onUnauthorized ?? null;
  }

  login(args: { code: string; codeVerifier: string; redirectUri: string }): Promise<AuthSession> {
    // 서버가 읽는 키는 snake_case로 고정돼 있다(auth-routes.ts:13-16).
    return this.send<AuthSession>("POST", "/auth/google", {
      code: args.code,
      code_verifier: args.codeVerifier,
      redirect_uri: args.redirectUri,
      platform: "web",
    });
  }

  async refresh(refreshToken: string): Promise<AuthSession | null> {
    try {
      return await this.send<AuthSession>("POST", "/auth/refresh", { refresh_token: refreshToken });
    } catch (e) {
      // 폐기·만료는 실패가 아니라 "재로그인 필요"라는 답이다.
      if (isApiError(e) && (e.kind === "session_expired" || e.kind === "auth_failed")) return null;
      throw e;
    }
  }

  async logout(refreshToken: string): Promise<void> {
    // 서버가 죽어 있어도 로그아웃은 되어야 한다. 로컬 토큰 삭제는 호출부 책임이고
    // 여기서는 서버 통보 실패를 삼킨다(스펙 A-8).
    try {
      await this.send<void>("POST", "/auth/logout", { refresh_token: refreshToken });
    } catch {
      /* 통보 실패는 무시 */
    }
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

  preview(input: PreviewIn, signal?: AbortSignal): Promise<PreviewOut> {
    return this.send<PreviewOut>("POST", "/preview", input, signal);
  }

  detail(input: Prompt5In, signal?: AbortSignal): Promise<Prompt5Out> {
    return this.send<Prompt5Out>("POST", "/detail", input, signal);
  }

  // 스트림은 send를 쓰지 않는다. 본문을 끝까지 읽지 않고 조각마다 넘겨야 하기 때문이다.
  async *recommendStream(input: RecommendInput, signal: AbortSignal): AsyncIterable<StreamEvent> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const tok = this.token();
    if (tok) headers["authorization"] = `Bearer ${tok}`;

    let res: Response;
    try {
      res = await this.doFetch(this.base + "/recommend", {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify(input),
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      return fail({ kind: "network" });
    }

    // 스트림이 시작되기 전의 실패는 보통 응답처럼 분류한다(게이팅 402·403·429가 여기서 온다).
    if (!res.ok) {
      const body = await this.readJson(res);
      return fail(classifyResponse(res.status, body));
    }
    if (!res.body) return fail({ kind: "malformed" });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parser = createSseParser();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const ev of parser.push(decoder.decode(value, { stream: true }))) yield ev;
      }
      for (const ev of parser.push(decoder.decode())) yield ev;
    } finally {
      // 소비자가 중간에 멈추면(상한 도달 등) 남은 본문을 붙들지 않는다.
      await reader.cancel().catch(() => undefined);
    }
  }

  private async send<T>(method: string, path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const first = await this.attempt(method, path, body, signal, this.token());
    if (first.kind === "ok") return first.value as T;

    // 401 한 번에 한해 재발급하고 원 요청을 한 번만 다시 보낸다(스펙 A-7).
    // 인증 경로 자체는 제외한다. /auth/refresh 가 401일 때 다시 refresh 하면 순환이다.
    const retryable = first.status === 401 && this.onUnauthorized !== null && !path.startsWith("/auth/");
    if (!retryable) return fail(first.error);

    const fresh = await this.onUnauthorized!();
    if (!fresh) return fail(first.error);

    const second = await this.attempt(method, path, body, signal, fresh);
    if (second.kind === "ok") return second.value as T;
    return fail(second.error);
  }

  private async attempt(
    method: string,
    path: string,
    body: unknown,
    signal: AbortSignal | undefined,
    tok: string | null
  ): Promise<{ kind: "ok"; value: unknown } | { kind: "err"; error: ApiError; status: number }> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
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
      return { kind: "err", error: { kind: "network" }, status: 0 };
    }

    const parsed = await this.readJson(res);
    if (!res.ok) return { kind: "err", error: classifyResponse(res.status, parsed), status: res.status };
    // 204처럼 본문이 없는 성공은 정상이다. 인증 라우트가 그렇게 답한다.
    return { kind: "ok", value: parsed === undefined ? null : parsed };
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
