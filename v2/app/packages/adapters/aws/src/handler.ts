// Lambda Function URL(RESPONSE_STREAM) 진입점. streamHandle이 /recommend SSE를 스트리밍 직렬화한다(§5).
// 콜드 스타트 1회 초기화(top-level await) 후 Lambda 컨테이너가 앱을 재사용한다.
// ★ 배포 게이트 코드 — 로컬 스모크 불가. Lambda 핸들러 경로 = dist/handler.handler.
// ★ Lambda 스트리밍은 클라 연결 끊김을 함수에 통지하지 않는다(§5) — 서버측 취소 보완은 스트림당 상한으로.

import { streamHandle } from "hono/aws-lambda";
import { createApp } from "@vock/http-app";
import { buildAwsDeps } from "./deps.js";
import { loadSecrets } from "./secrets.js";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 미설정`);
  return v;
}

const secrets = await loadSecrets(env("SECRET_ID"), process.env.AWS_REGION);
const app = createApp(
  buildAwsDeps({
    dataApi: { resourceArn: env("DB_RESOURCE_ARN"), secretArn: env("DB_SECRET_ARN"), database: env("DB_NAME") },
    ...(process.env.AWS_REGION ? { region: process.env.AWS_REGION } : {}),
    secrets,
  }),
);

// 타입 명시(composite declaration emit이 hono 내부 타입을 이름지을 수 있도록).
export const handler: ReturnType<typeof streamHandle> = streamHandle(app);
