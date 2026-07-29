// 좁히기 종료 판정. 순수 함수만 있고 상태도 부수효과도 없다.
// v1은 이 판정이 한 줄 표현식으로 컴포넌트 안에 박혀 있어서 검증할 수 없었다.

import type { AnswerTurn, DoneReason, NarrowConfig, NarrowCtx, Question } from "./types.js";

// 질문으로 쓸 수 있는 형태인지. 형태가 깨진 응답을 그리면 렌더 중에 죽는다.
export function isUsableQuestion(out: unknown): out is Question {
  if (!out || typeof out !== "object") return false;
  const q = out as Question;
  return typeof q.question === "string" && q.question.length > 0 && Array.isArray(q.choices) && q.choices.length > 0;
}

// 실제 답변 턴 수. "어려워요"는 난이도 신호라 세지 않는다(스펙 D-2).
// 예산을 쓴 턴 수. 되돌려서 버린 턴도 예산은 이미 썼으므로 함께 센다(스펙 B-11).
// "어려워요"는 답이 아니라 난이도 신호라 세지 않는다(스펙 D-2).
export function realAnswers(answers: AnswerTurn[]): number {
  let n = 0;
  for (const a of answers) if (a.kind === "picks" || a.kind === "discarded") n += 1;
  return n;
}

// 남은 질문 수. 저장하지 않고 매번 계산한다(스펙 D-4).
// 불변식: realAnswers + turnsLeft = narrowMax. 저장하지 않으므로 깨질 수 없다.
export function turnsLeft(ctx: NarrowCtx, narrowMax: number): number {
  return Math.max(0, narrowMax - realAnswers(ctx.answers));
}

export type Decision = { done: true; reason: DoneReason } | { done: false };

// 판정 순서에 의미가 있다.
// enough를 먼저 보는 이유는 free에서 narrowMin과 narrowMax가 같은 값일 수 있기 때문이다.
// 그때 둘 다 참이 되는데, 실제로 충분히 좁혀진 것이므로 "다 썼다"보다 "충분하다"가 정확하고
// 불필요한 상위 티어 안내도 뜨지 않는다.
export function decideNext(args: { answers: AnswerTurn[]; out: unknown; cfg: NarrowConfig }): Decision {
  const n = realAnswers(args.answers);
  const usable = isUsableQuestion(args.out);
  const enough = usable && (args.out as { enough?: unknown }).enough === true;

  if (enough && n >= args.cfg.narrowMin) return { done: true, reason: "enough" };
  if (n >= args.cfg.narrowMax) return { done: true, reason: "exhausted" };
  if (!usable) return { done: true, reason: "malformed" };
  return { done: false };
}
