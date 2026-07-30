// 랜딩 정적 사이트 설정.
//
// output: "static" 이 핵심이다. 랜딩의 목적은 검색 노출이 아니라 **AI 크롤러가 읽을 수 있는
// 원본 HTML**이고(ADR-002: "GPTBot·ClaudeBot 등 AI 크롤러는 JS를 실행하지 않고 원본 HTML만 파싱"),
// 서버 렌더나 하이브리드로 바꾸면 그 목적이 사라진다(L-1).
//
// 통합(integrations)은 비어 있다. @astrojs/react를 넣는 순간 아일랜드가 기본값이 되고,
// 아일랜드는 JS를 딸려온다. 실제로 상호작용이 필요한 자리가 생기면 그때 그 자리만 추가한다.
//
// 앱 SPA는 /app 에 있다(L-7). 랜딩은 루트이므로 base 를 지정하지 않는다 — 지정하면 두 곳이
// 경로를 각자 알게 되어 어긋난다.

import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  integrations: [],
  build: {
    // 산출물 자산 폴더 이름을 고정한다. 배포에서 앱 SPA와 같은 버킷을 쓰므로(L-7)
    // 자산 경로가 우연히 겹치지 않게 이름을 명시해 둔다.
    assets: "_landing",
  },
});
