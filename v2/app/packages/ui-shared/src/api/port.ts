// 화면이 서버를 부르는 유일한 통로. 구현은 주입받는다.
// S2 범위는 classify와 next 둘뿐이다. 아직 소비처가 없는 엔드포인트는 여기 올리지 않는다.
// 실패는 예외로 던지되 항상 ApiError 형태여야 한다(errors.ts의 isApiError로 판별 가능).

import type {
  ClientLimits,
  AssetSummary,
  Page,
  Project,
  RelateIn,
  RelateOut,
  SessionRec,
  SessionSummary,
  Term,
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
  Tier,
} from "@vock/shared";

// 로그인 응답. 서버가 주는 필드명을 그대로 쓴다.
// SoT §3-2 표는 {access, refresh, user}로 축약돼 있지만 실제 응답은 아래다(auth-routes.ts:22).
// 표만 보고 짜면 토큰을 못 읽고 조용히 실패한다.
export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { email: string; tier: Tier };
}

// 인증은 ApiPort와 분리한다. 파이프라인 호출과 수명이 다르고 로그인 없이도 앱이 돌아야 한다.
export interface AuthPort {
  login(args: { code: string; codeVerifier: string; redirectUri: string }): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession | null>; // null이면 재로그인 필요
  logout(refreshToken: string): Promise<void>;
}

export interface ApiPort {
  config(signal?: AbortSignal): Promise<ClientLimits>;
  classify(input: Prompt1In, signal?: AbortSignal): Promise<Prompt1Out>;
  next(input: Prompt2In, signal?: AbortSignal): Promise<Prompt2Out>;
  preview(input: PreviewIn, signal?: AbortSignal): Promise<PreviewOut>;
  detail(input: Prompt5In, signal?: AbortSignal): Promise<Prompt5Out>;
  // pro 전용. 구조만 돌려주고 붙여넣을 본문은 클라가 조립한다.
  summarize(input: Prompt4In, signal?: AbortSignal): Promise<PrimerDoc>;
  // 서버가 흘리는 이벤트를 순서 그대로 넘긴다. 취소는 signal로 전파한다.
  recommendStream(input: RecommendInput, signal: AbortSignal): AsyncIterable<StreamEvent>;

  // 영속(S5). 전부 로그인 필수라 비로그인에서는 호출 자체를 하지 않는다(스펙 S-1).
  listSessions(q: ListSessionsArgs, signal?: AbortSignal): Promise<Page<SessionSummary>>;
  getSession(id: string, signal?: AbortSignal): Promise<SessionRec | null>; // null = 없음
  // 전체 upsert(S-22). user_id는 서버가 토큰에서 정하므로 보내지 않는다.
  putSession(rec: Omit<SessionRec, "user_id">, signal?: AbortSignal): Promise<SessionRec>;
  deleteSession(id: string, signal?: AbortSignal): Promise<void>;
  restoreSession(id: string, signal?: AbortSignal): Promise<boolean>; // false = 유예 경과
  keep(sessionId: string, body: KeepBody, signal?: AbortSignal): Promise<void>;

  // 프로젝트와 어휘 자산(S5-2).
  listAssets(projectId: string | null, cursor?: string | null, signal?: AbortSignal): Promise<Page<AssetSummary>>;
  listProjects(signal?: AbortSignal): Promise<Project[]>;
  createProject(name: string, signal?: AbortSignal): Promise<Project>;
  deleteProject(id: string, signal?: AbortSignal): Promise<void>;
  // 연결 턴. 프로젝트에 담은 어휘가 있을 때만 부른다(S-11).
  relate(input: RelateIn, signal?: AbortSignal): Promise<RelateOut>;
}

// 커서는 서버가 만든 불투명 문자열이다. 클라가 열어 보거나 다시 정렬하지 않는다(S-9).
export interface ListSessionsArgs {
  projectId?: string | null;
  q?: string;
  pinned?: boolean;
  cursor?: string | null;
}

export interface KeepBody {
  term: Term;
  term_norm: string; // normTerm()의 결과. 서버는 다시 계산하지 않는다
  keep: boolean;
  domain_tags?: string[];
  project_id?: string | null;
}
