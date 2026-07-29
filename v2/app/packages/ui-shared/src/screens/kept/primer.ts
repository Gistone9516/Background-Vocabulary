// 기본 정리. 담은 어휘로 메인 AI에 붙여넣을 한 덩어리를 만든다.
// 서버를 부르지 않는다. 무비용이고 즉시다(SoT 1절, 스펙 K-5).

import type { Term } from "@vock/shared";
import { tr } from "../../i18n/strings.js";

export interface BasicPrimerArgs {
  topic: string;
  condition?: string;
  kept: Term[];
}

// 담은 것이 없으면 빈 문자열이 아니라 안내를 돌려준다.
// 빈 값을 복사하게 두면 사용자가 무엇이 잘못됐는지 모른다.
export function buildBasicPrimer(args: BasicPrimerArgs): string {
  if (args.kept.length === 0) return tr("kept_none");

  // 분야(domain)는 정적 맵의 열거 키라 사람에게 보여줄 값이 아니다(RecommendInput 주석).
  // 하려는 일과 어휘 목록이 이미 맥락을 담고 있어 굳이 넣지 않는다.
  const lines: string[] = [];
  if (args.topic) lines.push(`하려는 일: ${args.topic}`);
  if (args.condition) lines.push(`조건: ${args.condition}`);
  lines.push("");
  lines.push("아래 어휘는 이미 알고 있다고 두고 답해 주세요.");
  lines.push("");
  for (const t of args.kept) {
    lines.push(`- ${t.term}: ${t.one_line}`);
  }
  return lines.join("\n");
}
