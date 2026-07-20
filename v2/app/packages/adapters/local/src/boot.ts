// 로컬 부트. @hono/node-server로 http-app을 기동한다.
// 부트만 계층별로 다르고, 앱 조립(라우트)은 http-app이 공유한다(SoT §0-2).

import { serve } from "@hono/node-server";
import { createApp } from "@vock/http-app";
import type { PipelineDeps } from "@vock/shared";
import { buildMockDeps } from "./deps.js";

type ServeReturn = ReturnType<typeof serve>;

export interface BootOptions {
  port?: number; // 0이면 임의 포트(테스트용). 미지정 시 8787.
  deps?: PipelineDeps; // 미지정 시 mock 계층.
}

export interface BootHandle {
  server: ServeReturn;
  port: number;
}

export async function bootLocal(opts: BootOptions = {}): Promise<BootHandle> {
  const app = createApp(opts.deps ?? buildMockDeps());
  const requestedPort = opts.port ?? 8787;
  return await new Promise<BootHandle>((resolve) => {
    const server = serve({ fetch: app.fetch, port: requestedPort }, (info) => {
      resolve({ server, port: info.port });
    });
  });
}
