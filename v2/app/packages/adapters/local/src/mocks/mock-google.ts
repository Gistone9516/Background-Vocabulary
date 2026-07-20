// 목 Google OAuth(local 테스트). 실 Google 크레덴셜 없이 로그인 흐름을 검증한다.
// code가 "fail"이면 교환 실패를 흉내낸다(에러 경로 테스트).

import type { GoogleOAuthClient, GoogleIdentity } from "@vock/shared";

export class MockGoogleOAuthClient implements GoogleOAuthClient {
  constructor(private readonly identity: GoogleIdentity) {}

  async exchange(args: { code: string; codeVerifier: string; redirectUri: string; platform: "web" | "desktop" }): Promise<GoogleIdentity> {
    if (args.code === "fail") throw new Error("mock_google_fail");
    return this.identity;
  }
}
