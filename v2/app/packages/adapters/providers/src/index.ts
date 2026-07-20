// @vock/providers 공개 표면. 외부 공급자 어댑터(웹표준 fetch, 런타임 무관 — local·aws 공유).
// C2.2: Google OAuth. C2.4에서 DeepSeek·Tavily·Upstash 추가.
export { RealGoogleOAuthClient } from "./google-oauth.js";
export type { GoogleCredentials, GoogleOAuthConfig } from "./google-oauth.js";
