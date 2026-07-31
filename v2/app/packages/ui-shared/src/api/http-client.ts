// ApiPort의 fetch 구현. 브라우저와 Tauri가 같은 화면 코드를 쓰도록 fetch 자체를 주입받는다.
// 이 파일 밖으로 상태 코드나 서버 에러 문자열이 새지 않는다. 실패는 전부 ApiError로 바꿔 던진다.

import type {
  ClientLimits,
  OutputLocale,
  AssetSummary,
  Page,
  Project,
  RelateIn,
  RelateOut,
  SessionRec,
  SessionSummary,
  PreviewIn,
  PreviewOut,
  PrimerDoc,
  Prompt1In,
  Prompt4In,
  Prompt1Out,
  Prompt2In,
  Prompt2Out,
  Prompt5In,
  Prompt5Out,
  RecommendInput,
  StreamEvent,
} from "@vock/shared";
import { createSseParser, isAssetSummary, isPage, isPrimerDoc, isProject, isRelateOut, isSessionSummary } from "@vock/shared";
import type { ApiPort, AuthPort, AuthSession, KeepBody, ListSessionsArgs } from "./port.js";
import { classifyResponse, isApiError, type ApiError } from "./errors.js";

// 목록 형태 검사기는 한 번만 만든다. 매 호출마다 만들면 같은 함수가 계속 새로 생긴다.
const SESSION_PAGE = isPage(isSessionSummary);
const ASSET_PAGE = isPage(isAssetSummary);
const isProjectList = (v: unknown): v is Project[] => Array.isArray(v) && v.every(isProject);

export interface HttpApiConfig {
  baseUrl: string;
  getAccessToken?: () => string | null;
  // 생성 요청에 실을 출력 언어. 서버는 요청 본문의 outputLocale만 보고 생성 언어를 정한다
  // (pipeline-routes readLocale). 사용자 설정을 아는 쪽은 셸이라 여기서 주입받는다.
  //
  // 선택 사항이 아니다. 기본값 "ko"를 두었더니 웹 셸이 이걸 넘기지 않은 채로 배포됐고,
  // 전 사용자가 조용히 한국어로 고정됐다. e2e는 자기가 값을 주입해 검사했으므로 초록이었다.
  // 필수로 두면 안 넘기는 셸은 타입 검사에서 막힌다 — 잊을 수 있는 자리를 없앤다.
  getOutputLocale: () => OutputLocale;
  // 같은 이유로 필수다(C4 S2 DS2-5). 선택이면 데스크톱 셸이 빠뜨렸을 때 서버가 web 자격증명으로
  // 교환을 시도하고, 그 실패는 Google 쪽 메시지로만 온다 — 원인이 한 층 건너에 있는 오류가 된다.
  platform: "web" | "desktop";
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
  private readonly outputLocale: () => OutputLocale;
  private readonly platform: "web" | "desktop";
  private readonly doFetch: typeof globalThis.fetch;
  private readonly onUnauthorized: (() => Promise<string | null>) | null;

  constructor(cfg: HttpApiConfig) {
    // 끝 슬래시를 지워 경로를 붙일 때 이중 슬래시가 생기지 않게 한다.
    this.base = cfg.baseUrl.replace(/\/+$/, "");
    this.token = cfg.getAccessToken ?? (() => null);
    this.outputLocale = cfg.getOutputLocale;
    this.platform = cfg.platform;
    this.doFetch = cfg.fetch ?? globalThis.fetch.bind(globalThis);
    this.onUnauthorized = cfg.onUnauthorized ?? null;
  }

  login(args: { code: string; codeVerifier: string; redirectUri: string }): Promise<AuthSession> {
    // 서버가 읽는 키는 snake_case로 고정돼 있다(auth-routes.ts:13-16).
    return this.send<AuthSession>("POST", "/auth/google", {
      code: args.code,
      code_verifier: args.codeVerifier,
      redirect_uri: args.redirectUri,
      // "web" 하드코딩이었다(C4 S2에서 교체). 데스크톱 교환이 web 자격증명을 타면 안 된다.
      platform: this.platform,
      // 첫 로그인(계정 생성) 씨앗값. 기존 계정에는 영향이 없다(서버가 생성 경로에만 쓴다).
      locale: this.outputLocale(),
    });
  }

  // FR-952(C4 S2): 언어 설정 영속. 응답은 204 — attempt가 빈 본문 성공을 null로 정상 처리한다
  // (읽고 확인함: "204처럼 본문이 없는 성공은 정상이다").
  async updateLocale(locale: OutputLocale, signal?: AbortSignal): Promise<void> {
    await this.send<unknown>("PATCH", "/me/locale", { locale }, signal);
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

  // 생성 계열 요청 본문. 로케일을 붙이는 자리를 한 곳으로 모은다 —
  // 엔드포인트마다 손으로 붙이면 새로 생긴 엔드포인트가 조용히 "ko"로 떨어진다.
  private gen<T extends object>(input: T): T & { outputLocale: OutputLocale } {
    return { ...input, outputLocale: this.outputLocale() };
  }

  config(signal?: AbortSignal): Promise<ClientLimits> {
    return this.send<ClientLimits>("GET", "/config", undefined, signal);
  }

  classify(input: Prompt1In, signal?: AbortSignal): Promise<Prompt1Out> {
    return this.send<Prompt1Out>("POST", "/classify", this.gen(input), signal);
  }

  next(input: Prompt2In, signal?: AbortSignal): Promise<Prompt2Out> {
    return this.send<Prompt2Out>("POST", "/next", this.gen(input), signal);
  }

  preview(input: PreviewIn, signal?: AbortSignal): Promise<PreviewOut> {
    return this.send<PreviewOut>("POST", "/preview", this.gen(input), signal);
  }

  detail(input: Prompt5In, sessionId: string | null, signal?: AbortSignal): Promise<Prompt5Out> {
    const body = sessionId ? { ...this.gen(input), session_id: sessionId } : this.gen(input);
    return this.send<Prompt5Out>("POST", "/detail", body, signal);
  }

  summarize(input: Prompt4In, signal?: AbortSignal): Promise<PrimerDoc> {
    // 이 응답만 형태를 검사한다. 본문 조립이 배열을 직접 훑기 때문에
    // 어긋난 형태가 화면 렌더 중에 터진다(스펙 P-7 — 실패는 기본 정리로 떨어져야 한다).
    return this.send<PrimerDoc>("POST", "/summarize", this.gen(input), signal, isPrimerDoc);
  }

  // ── 영속(S5). 전부 로그인 필수다 ──────────────────────
  listSessions(q: ListSessionsArgs, signal?: AbortSignal): Promise<Page<SessionSummary>> {
    const p = new URLSearchParams();
    if (q.projectId) p.set("project_id", q.projectId);
    if (q.q) p.set("q", q.q);
    if (q.pinned !== undefined) p.set("pinned", String(q.pinned));
    if (q.cursor) p.set("cursor", q.cursor);
    const qs = p.toString();
    return this.send<Page<SessionSummary>>("GET", `/sessions${qs ? "?" + qs : ""}`, undefined, signal, SESSION_PAGE);
  }

  // 없는 세션은 실패가 아니라 없음이다. 목록에서 지워진 것을 눌렀을 때가 그 경우다.
  async getSession(id: string, signal?: AbortSignal): Promise<SessionRec | null> {
    try {
      return await this.send<SessionRec>("GET", `/sessions/${encodeURIComponent(id)}`, undefined, signal);
    } catch (e) {
      if (isApiError(e) && e.kind === "not_found") return null;
      throw e;
    }
  }

  putSession(rec: Omit<SessionRec, "user_id">, signal?: AbortSignal): Promise<SessionRec> {
    return this.send<SessionRec>("PUT", `/sessions/${encodeURIComponent(rec.session_id)}`, rec, signal);
  }

  deleteSession(id: string, signal?: AbortSignal): Promise<void> {
    return this.send<void>("DELETE", `/sessions/${encodeURIComponent(id)}`, undefined, signal);
  }

  // 유예가 지나면 서버가 NOT_RESTORABLE을 준다. 되돌릴 수 없다는 답이지 오류가 아니다.
  async restoreSession(id: string, signal?: AbortSignal): Promise<boolean> {
    try {
      await this.send<{ restored: boolean }>("POST", `/sessions/${encodeURIComponent(id)}/restore`, undefined, signal);
      return true;
    } catch (e) {
      if (isApiError(e) && e.kind === "not_found") return false;
      throw e;
    }
  }

  keep(sessionId: string, body: KeepBody, signal?: AbortSignal): Promise<void> {
    return this.send<void>("PUT", `/sessions/${encodeURIComponent(sessionId)}/keep`, body, signal);
  }

  // ── 프로젝트와 어휘 자산(S5-2) ────────────────────────
  listAssets(projectId: string | null, cursor?: string | null, signal?: AbortSignal): Promise<Page<AssetSummary>> {
    const p = new URLSearchParams();
    if (projectId) p.set("project_id", projectId);
    if (cursor) p.set("cursor", cursor);
    const qs = p.toString();
    return this.send<Page<AssetSummary>>("GET", `/assets${qs ? "?" + qs : ""}`, undefined, signal, ASSET_PAGE);
  }

  listProjects(signal?: AbortSignal): Promise<Project[]> {
    return this.send<Project[]>("GET", "/projects", undefined, signal, isProjectList);
  }

  createProject(name: string, signal?: AbortSignal): Promise<Project> {
    return this.send<Project>("POST", "/projects", { name }, signal, isProject);
  }

  deleteProject(id: string, signal?: AbortSignal): Promise<void> {
    return this.send<void>("DELETE", `/projects/${encodeURIComponent(id)}`, undefined, signal);
  }

  relate(input: RelateIn, signal?: AbortSignal): Promise<RelateOut> {
    return this.send<RelateOut>("POST", "/relate", this.gen(input), signal, isRelateOut);
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
        body: JSON.stringify(this.gen(input)),
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

  // guard를 준 호출은 서버 응답을 그대로 믿지 않는다. 형태가 어긋나면 malformed로 떨어뜨린다.
  // 검사 없이 캐스팅하면 어긋난 응답이 화면 렌더 도중에 터져 화면 전체를 죽인다(실측: /summarize).
  private async send<T>(
    method: string,
    path: string,
    body: unknown,
    signal?: AbortSignal,
    guard?: (v: unknown) => v is T
  ): Promise<T> {
    const take = (v: unknown): T => {
      if (guard && !guard(v)) return fail({ kind: "malformed" });
      return v as T;
    };

    const first = await this.attempt(method, path, body, signal, this.token());
    if (first.kind === "ok") return take(first.value);

    // 401 한 번에 한해 재발급하고 원 요청을 한 번만 다시 보낸다(스펙 A-7).
    // 인증 경로 자체는 제외한다. /auth/refresh 가 401일 때 다시 refresh 하면 순환이다.
    const retryable = first.status === 401 && this.onUnauthorized !== null && !path.startsWith("/auth/");
    if (!retryable) return fail(first.error);

    const fresh = await this.onUnauthorized!();
    if (!fresh) return fail(first.error);

    const second = await this.attempt(method, path, body, signal, fresh);
    if (second.kind === "ok") return take(second.value);
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
