// 영속 CRUD 라우트(SoT §3-3). 전부 로그인 필수·자기 소유 행만.
// user_id는 주입된 리졸버로 얻는다(인증 구성 시 JWT sub, 미구성 DEV 시 x-user-id).

import type { Hono } from "hono";
import type { Repositories, SessionRec, AssetTerm, Project } from "@vock/shared";
import { OwnershipError } from "@vock/shared";
import type { ResolveUserId } from "../middleware/auth.js";

// 소프트 삭제 복구 유예(기본 30일). restore는 이 유예 내 삭제만 되살린다.
const RESTORE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

type Body = Record<string, unknown>;

export function registerCrudRoutes(app: Hono, repos: Repositories, resolveUserId: ResolveUserId): void {
  // ── 세션 ──────────────────────────────────────────────
  app.get("/sessions", async (c) => {
    const userId = await resolveUserId(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED" }, 401);
    const pinnedRaw = c.req.query("pinned");
    const q = c.req.query("q");
    const page = await repos.sessions.list({
      userId,
      projectId: c.req.query("project_id") ?? null,
      cursor: c.req.query("cursor") ?? null,
      ...(q !== undefined ? { q } : {}),
      ...(pinnedRaw !== undefined ? { pinned: pinnedRaw === "true" } : {}),
    });
    return c.json(page);
  });

  // 재진입 카드(C5-S3 FR-707). 반드시 "/sessions/:id" 앞에 등록한다 —
  // 뒤에 두면 :id 가 "recent" 를 잡아 세션 단건 조회로 새고, 404 가 나므로 원인이 라우팅으로 안 보인다.
  //
  // 목록과 같은 정렬(updated_at DESC)의 첫 건에 담은 어휘 수를 붙인다. 개수를 위한 집계 쿼리를
  // 따로 두지 않는다 — 세션당 담기 상한이 있어 목록 길이가 곧 개수다(V-18).
  app.get("/sessions/recent", async (c) => {
    const userId = await resolveUserId(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED" }, 401);
    const page = await repos.sessions.list({ userId, projectId: c.req.query("project_id") ?? null, limit: 1 });
    const session = page.items[0];
    if (!session) return c.json(null);
    const kept = await repos.assets.listBySession(userId, session.session_id);
    return c.json({ session, kept_count: kept.length });
  });

  app.get("/sessions/:id", async (c) => {
    const userId = await resolveUserId(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED" }, 401);
    const rec = await repos.sessions.get(userId, c.req.param("id"));
    return rec ? c.json(rec) : c.json({ error: "NOT_FOUND" }, 404);
  });

  app.put("/sessions/:id", async (c) => {
    const userId = await resolveUserId(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED" }, 401);
    const body = (await c.req.json()) as Body;
    const now = Date.now();
    const rec: SessionRec = {
      session_id: c.req.param("id"),
      user_id: userId,
      topic: (body.topic as string) ?? "",
      area: (body.area as string | null) ?? null,
      domain_risk: (body.domain_risk as SessionRec["domain_risk"]) ?? "low",
      job_type: (body.job_type as SessionRec["job_type"]) ?? [],
      gap_type: (body.gap_type as SessionRec["gap_type"]) ?? null,
      user_condition: (body.user_condition as string | null) ?? null,
      context_object: (body.context_object as string | null) ?? null,
      narrow: (body.narrow as SessionRec["narrow"]) ?? null,
      generated: (body.generated as SessionRec["generated"]) ?? null,
      primer: (body.primer as SessionRec["primer"]) ?? null,
      project_id: (body.project_id as string | null) ?? null,
      pinned: Boolean(body.pinned),
      deleted_at: null,
      created_at: (body.created_at as number) ?? now,
      updated_at: now,
    };
    try {
      return c.json(await repos.sessions.upsert(rec));
    } catch (e) {
      if (e instanceof OwnershipError) return c.json({ error: "OWNERSHIP_CONFLICT" }, 409);
      throw e;
    }
  });

  app.delete("/sessions/:id", async (c) => {
    const userId = await resolveUserId(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED" }, 401);
    const ok = await repos.sessions.softDelete(userId, c.req.param("id"), Date.now());
    return ok ? c.body(null, 204) : c.json({ error: "NOT_FOUND" }, 404);
  });

  app.post("/sessions/:id/restore", async (c) => {
    const userId = await resolveUserId(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED" }, 401);
    const ok = await repos.sessions.restore(userId, c.req.param("id"), Date.now() - RESTORE_GRACE_MS);
    return ok ? c.json({ restored: true }) : c.json({ error: "NOT_RESTORABLE" }, 404);
  });

  app.put("/sessions/:id/keep", async (c) => {
    const userId = await resolveUserId(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED" }, 401);
    const body = (await c.req.json()) as Body;
    const sessionId = c.req.param("id");
    const termNorm = body.term_norm as string;
    if (body.keep === false) {
      const ok = await repos.assets.unkeep(userId, sessionId, termNorm);
      return c.json({ kept: false, removed: ok });
    }
    const asset: AssetTerm = {
      asset_id: (body.asset_id as string) ?? crypto.randomUUID(),
      user_id: userId,
      session_id: sessionId,
      term: body.term as AssetTerm["term"],
      term_norm: termNorm,
      domain_tags: (body.domain_tags as string[]) ?? [],
      project_id: (body.project_id as string | null) ?? null,
      created_at: Date.now(),
    };
    return c.json({ kept: true, asset: await repos.assets.keep(asset) });
  });

  // ── 자산 ──────────────────────────────────────────────
  app.get("/assets", async (c) => {
    const userId = await resolveUserId(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED" }, 401);
    const page = await repos.assets.listByProject(userId, c.req.query("project_id") ?? null, c.req.query("cursor") ?? null);
    return c.json(page);
  });

  // ── 프로젝트 ──────────────────────────────────────────
  app.get("/projects", async (c) => {
    const userId = await resolveUserId(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED" }, 401);
    return c.json(await repos.projects.list(userId));
  });

  app.post("/projects", async (c) => {
    const userId = await resolveUserId(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED" }, 401);
    const body = (await c.req.json()) as Body;
    const project: Project = {
      project_id: (body.project_id as string) ?? crypto.randomUUID(),
      user_id: userId,
      name: (body.name as string) ?? "",
      created_at: Date.now(),
    };
    return c.json(await repos.projects.create(project));
  });

  app.delete("/projects/:id", async (c) => {
    const userId = await resolveUserId(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED" }, 401);
    const ok = await repos.projects.delete(userId, c.req.param("id"));
    return ok ? c.body(null, 204) : c.json({ error: "NOT_FOUND" }, 404);
  });

  // ── 조회 기록 ─────────────────────────────────────────
  // 종착 화면 우측 패널의 스코프 1(C5-S2). 소유권 경계는 WHERE user_id다 —
  // 세션 소유자 대조를 따로 하지 않는 이유는, 남의 세션 id를 넣어도 자기 행만 나오기 때문이다.
  app.get("/sessions/:id/viewed", async (c) => {
    const userId = await resolveUserId(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED" }, 401);
    return c.json({ items: await repos.details.listBySession(userId, c.req.param("id")) });
  });

  // 세션 스코프 담은 어휘(C5-S3 V-18). 재개 시 담기 복원이 읽고, 위 /sessions/recent 의 개수도
  // 같은 리포 조회에서 나온다. 소유권 경계는 viewed 와 같은 이유로 WHERE user_id 하나다.
  app.get("/sessions/:id/assets", async (c) => {
    const userId = await resolveUserId(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED" }, 401);
    return c.json({ items: await repos.assets.listBySession(userId, c.req.param("id")) });
  });
}
