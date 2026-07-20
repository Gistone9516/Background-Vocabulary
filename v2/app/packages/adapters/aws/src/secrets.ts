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
}

export async function loadSecrets(secretId: string, region?: string): Promise<VockSecrets> {
  const client = new SecretsManagerClient(region ? { region } : {});
  const out = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!out.SecretString) throw new Error("Secrets Manager: SecretString이 비어 있음");
  return JSON.parse(out.SecretString) as VockSecrets;
}
