// 목 LLM 어댑터(mock 계층). 실제 네트워크 없이 파이프라인 관통을 검증한다.
// complete는 프롬프트 포맷 지시의 고유 토큰으로 어떤 프롬프트인지 판별해 해당 픽스처를 돌려준다.
// streamTerms는 샘플 term을 순서대로 흘리고 done으로 닫는다(취소 신호를 존중).
// 실 LLM 클라이언트(DeepSeek wire·SSE 증분 파서)는 공급자 특수성이라 C2 어댑터에서 구현한다.

import type {
  LlmClient,
  LlmRequest,
  StreamEvent,
  Prompt1Out,
  Prompt2Out,
  Prompt4Out,
  Prompt5Out,
  PreviewOut,
  RelateOut,
} from "@vock/shared";
import { SAMPLE_TERMS } from "@vock/shared";

const CLASSIFY: Prompt1Out = {
  domain: "pid_control",
  job_type: ["이해학습"],
  condition_required: false,
  question: "어느 쪽을 먼저 이해하고 싶으세요?",
  choices: [
    { label: "제어기가 흔들리는 이유" },
    { label: "출력이 한계에 걸릴 때의 문제" },
    { label: "튜닝 감각 잡기" },
  ],
  search_locale: "en",
  domain_risk: "low",
};

const NEXT: Prompt2Out = {
  question: "구체적으로 어떤 상황을 다루나요?",
  choices: [
    { label: "적분 제어가 과하게 쌓이는 경우" },
    { label: "응답이 느려지는 경우" },
  ],
  enough: true,
  confidence: 0.82,
};

const PREVIEW: PreviewOut = {
  basic: { term: "피드백", line: "출력을 다시 입력으로 되먹여 오차를 줄이는 기본 얼개예요." },
  inter: { term: "적분 와인드업", line: "출력이 한계에 걸려도 적분이 계속 쌓여 반응이 둔해지는 현상이에요." },
  adv: { term: "백캘큘레이션 안티와인드업", line: "쌓인 적분을 되돌려 한계 이후의 폭주를 잡는 기법이에요." },
};

const RELATE: RelateOut = {
  relevant: false,
  question: "",
  choices: [],
  related_terms: [],
};

const SUMMARIZE: Prompt4Out = {
  area: "PID 제어",
  task_intent: "PID 제어의 배경 개념을 이해하려 한다",
  context_sentence: "출력 포화 상황에서 적분 제어의 거동을 배경지식으로 정리한다.",
  vocab: [
    { term: "안티와인드업", tag: "몰라" },
    { term: "적분기 와인드업", tag: "몰라" },
  ],
  paste_text:
    "나는 PID 제어의 배경 개념을 이해하려 한다.\n안티와인드업: 출력 제한 시 적분 축적을 막는 기법\n적분기 와인드업: 출력 포화에도 적분이 계속되는 현상\n이 개념들이 내 상황에 어떻게 적용되는지 우선순위와 예시로 설명해 줘.",
};

const DETAIL: Prompt5Out = {
  what: "출력이 한계에 걸렸을 때 적분값이 계속 쌓이는 것을 막는 안전장치예요.",
  whymine: "출력 제한이 있는 시스템을 다룬다면 이걸 모르면 오버슈트를 잡기 어려워요.",
  how: "출력이 포화됐는지 먼저 감지해요\n포화 동안 적분 누적을 멈추거나 되돌려요\n한계에서 벗어나면 정상 적분으로 복귀해요",
  related: ["적분기 와인드업", "포화"],
  sources: [],
};

// 시스템 프롬프트의 출력 포맷 지시에 등장하는 고유 토큰으로 프롬프트 종류를 판별한다.
function pickFixture(sys: string): unknown {
  if (sys.includes('"condition_required"')) return CLASSIFY;
  if (sys.includes('"enough"')) return NEXT;
  if (sys.includes('"relevant"')) return RELATE;
  if (sys.includes('"inter"')) return PREVIEW;
  if (sys.includes('"paste_text"')) return SUMMARIZE;
  if (sys.includes('"whymine"')) return DETAIL;
  throw new Error("MockLlmClient: 알 수 없는 프롬프트 형식(픽스처 매칭 실패)");
}

export class MockLlmClient implements LlmClient {
  async complete<T>(req: LlmRequest): Promise<T> {
    const sys = req.messages.map((m) => m.content).join("\n");
    return pickFixture(sys) as T;
  }

  streamTerms(_req: LlmRequest, signal?: AbortSignal): ReadableStream<StreamEvent> {
    return new ReadableStream<StreamEvent>({
      start(controller) {
        if (signal?.aborted) {
          controller.close();
          return;
        }
        for (const term of SAMPLE_TERMS) {
          if (signal?.aborted) break;
          controller.enqueue({ type: "term", term });
        }
        controller.enqueue({ type: "done" });
        controller.close();
      },
    });
  }
}
