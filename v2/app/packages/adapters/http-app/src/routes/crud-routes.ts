// 영속 CRUD 라우트(SoT §3-3). 전부 로그인 필수·자기 소유 행만.
// user_id는 주입된 리졸버로 얻는다(인증 구성 시 JWT sub, 미구성 DEV 시 x-user-id).

import type { Hono } from "hono";
import type { Repositories, SessionRec, AssetTerm, KnowledgeState, Project } from "@vock/shared";
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

  // ── 지식 상태 ─────────────────────────────────────────
  app.put("/knowledge", async (c) => {
    const userId = await resolveUserId(c);
    if (!userId) return c.json({ error: "UNAUTHENTICATED" }, 401);
    const body = (await c.req.json()) as Body;
    const now = Date.now();
    const states: KnowledgeState[] = ((body.states as Body[]) ?? []).map((s) => ({
      user_id: userId,
      term_norm: s.term_norm as string,
      tag: s.tag as KnowledgeState["tag"],
      updated_at: now,
    }));
    await repos.knowledge.upsertBatch(states);
    return c.json({ upserted: states.length });
  });
}
