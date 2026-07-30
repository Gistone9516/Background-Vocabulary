// AWS Secrets Manager에서 런타임 시크릿을 로드한다(콜드 스타트 1회). 시크릿은 절대 로그·클라 노출 금지.
// ★ 배포 게이트 코드 — 로컬 스모크 불가.

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

export interface VockSecrets {
  jwtSecretCurrent: string;
  jwtSecretPrev?: string;
  jwtKid: string;
  deepseekKey: string;
  tavilyKey: string;
  upstash: { url: string; token: string };
  google: {
    web: { clientId: string; clientSecret: string };
    desktop?: { clientId: string; clientSecret: string };
  };
  // clientCheck(NFR-305)의 데스크톱 표식(C4 S2). 바이너리에 빌드 시 주입되는 값과 대조한다.
  // **비밀이 아니다**(NFR-308 — 바이너리 속 값은 추출 가능) — 남용 억제 표식일 뿐이라 로테이션 부담도 그 수준으로 본다.
  desktopClientToken?: string;
}

export async function loadSecrets(secretId: string, region?: string): Promise<VockSecrets> {
  const client = new SecretsManagerClient(region ? { region } : {});
  const out = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!out.SecretString) throw new Error("Secrets Manager: SecretString이 비어 있음");
  return JSON.parse(out.SecretString) as VockSecrets;
}
