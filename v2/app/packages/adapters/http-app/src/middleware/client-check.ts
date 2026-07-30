// clientCheck(NFR-305, C4 S2 DS2-3). 비용 경로에 "허용된 클라이언트 표식"을 요구한다.
//
// **이것은 크랙 방지가 아니라 남용 억제다(NFR-308).** 바이너리에 넣은 값은 비밀이 아니고,
// 웹의 Origin 헤더도 위조 가능하다. 이 검사의 목적은 아무 스크립트나 프로덕션 API를 긁는
// 비용을 올리는 것뿐이며, 권한의 실체(티어·한도)는 언제나 그 뒤의 게이팅과 서버 검증이 진다.
//
// 미설정(config 미주입) = 검사 자체가 안 붙는다 — C2.3 §0 "로컬 skip" 계약. e2e가 이 전제 위에 있다.
// 적용 순서: CORS → clientCheck → gating. 카운터를 깎기 전에 걸러야 남용이 캡을 소모하지 못한다.

import type { Hono } from "hono";
import { COST_PATHS } from "./gating.js";

export interface ClientCheckConfig {
  // 웹 표식: Origin 헤더 화이트리스트(프로덕션 CloudFront 오리진 + Tauri 웹뷰 오리진 후보).
  allowedOrigins: string[];
  // 데스크톱 표식: 빌드 시 주입되는 x-vock-client 값. 없으면 데스크톱 경로는 Origin으로만 판정.
  desktopToken?: string;
}

export function installClientCheck(app: Hono, cfg: ClientCheckConfig): void {
  const origins = new Set(cfg.allowedOrigins);
  for (const p of COST_PATHS) {
    app.use(p, async (c, next) => {
      const origin = c.req.header("origin");
      if (origin && origins.has(origin)) return next();
      if (cfg.desktopToken && c.req.header("x-vock-client") === cfg.desktopToken) return next();
      // Origin도 표식도 없는 요청(curl 등)이 정확히 이 검사의 대상이다.
      return c.json({ error: "CLIENT_CHECK", message: "허용되지 않은 클라이언트예요." }, 403);
    });
  }
}
