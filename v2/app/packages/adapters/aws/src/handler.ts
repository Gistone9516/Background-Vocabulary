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

// C4 S2: 허용 오리진(콤마 구분). CORS와 clientCheck의 웹 표식이 같은 목록을 쓴다 —
// 두 env로 가르면 하나만 갱신한 배포가 조용히 반쪽이 된다.
// 데스크톱 웹뷰 오리진은 후보가 갈려(DS2-2: tauri.localhost http/https, tauri://localhost)
// S5 패키징 스모크에서 실측으로 좁힌다. 값 예: "https://vock.example,https://tauri.localhost"
const allowedOrigins = (process.env.VOCK_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = createApp({
  ...buildAwsDeps({
    dataApi: { resourceArn: env("DB_RESOURCE_ARN"), secretArn: env("DB_SECRET_ARN"), database: env("DB_NAME") },
    ...(process.env.AWS_REGION ? { region: process.env.AWS_REGION } : {}),
    secrets,
  }),
  // 브리핑 발견(2026-07-30): 이 배선이 어디에도 없어 /config에 client_id가 실리지 않았고,
  // 실 로그인 버튼이 뜰 수 없는 상태였다. e2e는 mock 주입이라 통과해 왔다.
  googleClientId: secrets.google.web.clientId,
  ...(allowedOrigins.length > 0 ? { corsOrigins: allowedOrigins } : {}),
  // clientCheck는 명시적으로 켠다(VOCK_CLIENT_CHECK=1). 미설정 = skip — 로컬과 같은 기본값이라
  // "프로덕션에서 깜빡 끔"이 가능한 구조지만, 반대(기본 on)는 오리진 목록 없이 켜져 전면 403이 된다.
  ...(process.env.VOCK_CLIENT_CHECK === "1"
    ? {
        clientCheck: {
          allowedOrigins,
          ...(secrets.desktopClientToken ? { desktopToken: secrets.desktopClientToken } : {}),
        },
      }
    : {}),
});

// 타입 명시(composite declaration emit이 hono 내부 타입을 이름지을 수 있도록).
export const handler: ReturnType<typeof streamHandle> = streamHandle(app);
