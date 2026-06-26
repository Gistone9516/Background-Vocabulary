// DEV 전용 mock. 실 백엔드 없이 5화면 렌더를 검증하려고 쓴다(import.meta.env.DEV).
// 프로덕션 경로는 api.ts가 실제 워커로 fetch한다. 이 데이터는 대표 표본일 뿐 정본 아님.
import type {
  Prompt1In, Prompt1Out, Prompt2In, Prompt2Out,
  Prompt4In, Prompt4Out, Prompt5In, Prompt5Out,
  RecommendInput, StreamEvent, Term,
} from "@sidetab/shared";

const HIGHRISK = /(의료|진단|병원|처방|법률|소송|변호|판결|고소|세무신고|증상|치료)/;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// 대표 어휘 3종(딥러닝). 카드 + 상세(Prompt5) 필드를 한 곳에 담아 mock에서 쪼개 쓴다.
const SEED: (Term & { _detail: Prompt5Out })[] = [
  {
    term: "과적합", kind: "개념", group: "일반화", priority: 1, tag: "몰라",
    one_line: "모델이 학습 데이터에만 맞춰져 새 데이터에서 성능이 떨어지는 현상",
    why: "학습 점수는 좋은데 실전이 나쁜 핵심 증상이라 1순위",
    context_note: "졸업작품처럼 데이터가 적을수록 과적합은 더 자주, 더 심하게 나타나요.",
    _detail: {
      what: "시험 문제를 이해하지 않고 통째로 외운 학생과 같아요. 외운 문제는 잘 풀지만 처음 보는 문제엔 약하죠.",
      whymine: "졸작 모델이 학습 땐 잘 되는데 제출용 테스트에선 틀린다면 거의 이 문제예요.",
      how: "훈련 점수와 검증 점수를 같이 보세요. 둘의 격차가 벌어지면 과적합이에요. 대응은 정규화, 데이터 늘리기, 조기 종료예요.",
      misc: "정확도가 높다고 좋은 모델이 아니에요. 그게 훈련 정확도라면 과적합의 신호일 수 있어요.",
      related: ["정규화", "검증셋"],
      sources: [
        { title: "과적합 (Overfitting)", site: "ko.wikipedia.org", url: "https://ko.wikipedia.org/wiki/과적합" },
        { title: "Neural Networks Part 3", site: "cs231n.github.io", url: "https://cs231n.github.io/neural-networks-3/" },
      ],
    },
  },
  {
    term: "정규화", kind: "방법론", group: "일반화", priority: 2, tag: "몰라",
    one_line: "모델이 너무 복잡해지지 않게 제약을 걸어 과적합을 막는 기법",
    why: "과적합을 직접 누르는 가장 기본 도구라 2순위",
    _detail: {
      what: "모델에게 정답에만 집착하지 말라고 거는 브레이크예요.",
      whymine: "과적합이 의심되면 가장 먼저 꺼내는 카드예요. 드롭아웃 한 줄로도 시작할 수 있어요.",
      how: "L2(weight decay), 드롭아웃, 데이터 증강이 대표적이에요.",
      related: ["과적합", "드롭아웃"],
      sources: [{ title: "정칙화 (Regularization)", site: "ko.wikipedia.org", url: "https://ko.wikipedia.org/wiki/정칙화" }],
    },
  },
  {
    term: "learning rate", kind: "지표", group: "학습 설정", priority: 3, tag: "몰라",
    one_line: "한 번 학습할 때 가중치를 얼마나 크게 갱신할지 정하는 값",
    why: "학습이 되느냐 마느냐를 가장 크게 좌우해 3순위",
    direction: "손실이 발산하면 낮추고, 너무 더디면 올려요. 클수록 빠르지만 불안정해요.",
    _detail: {
      what: "산을 내려갈 때 한 걸음의 보폭이에요.",
      whymine: "손실이 줄지 않거나 NaN으로 터지면 십중팔구 이 값 문제예요.",
      how: "1e-3에서 시작해 10배씩 올리고 내리며 손실 곡선을 보세요.",
      related: ["배치 크기", "에폭"],
      sources: [{ title: "Setting up the learning rate", site: "cs231n.github.io", url: "https://cs231n.github.io/neural-networks-3/" }],
    },
  },
];

const QUESTIONS = [
  { question: "지금 무엇을 하려고 하세요?", choices: [{ label: "만든 게 잘 됐는지 판단" }, { label: "새 분야 개념부터 잡기" }, { label: "특정 단계에서 막힘" }] },
  { question: "지금 가장 막막한 건?", choices: [{ label: "만든 게 자꾸 틀린다" }, { label: "뭘 손봐야 할지 모르겠다" }, { label: "평가를 어떻게 하는지" }] },
  { question: "어느 정도까지 파고들까요?", choices: [{ label: "핵심만 빠르게" }, { label: "실무에 쓸 만큼" }, { label: "기초부터 탄탄히" }] },
];

export async function classify(input: Prompt1In): Promise<Prompt1Out> {
  await delay(600);
  const risk = HIGHRISK.test(input.raw_input) ? "high" : "low";
  return {
    domain: "딥러닝", job_type: ["문제해결"], condition_required: false,
    search_locale: "en", domain_risk: risk,
    question: QUESTIONS[0].question, choices: QUESTIONS[0].choices,
  };
}

export async function nextBranch(input: Prompt2In): Promise<Prompt2Out> {
  await delay(600);
  const i = Math.min(input.history.length, QUESTIONS.length - 1);
  const enough = input.history.length >= 3;
  return {
    question: QUESTIONS[i].question, choices: QUESTIONS[i].choices,
    enough, confidence: Math.min(0.95, 0.3 + input.history.length * 0.2),
  };
}

export async function streamRecommend(
  input: RecommendInput,
  onEvent: (ev: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  if (input.domain_risk === "high") {
    onEvent({ type: "error", code: "HIGH_RISK_REFUSED", message: "고위험 도메인은 안전상 직접 다루지 않습니다" });
    return;
  }
  const exclude = new Set(input.exclude ?? []);
  const list = SEED.filter((t) => !exclude.has(t.term));
  for (const t of list) {
    if (signal.aborted) return;
    await delay(450);
    const { _detail, ...term } = t;
    onEvent({ type: "term", term: term as Term });
  }
  onEvent({ type: "done" });
}

export async function detail(input: Prompt5In): Promise<Prompt5Out> {
  await delay(500);
  const hit = SEED.find((t) => t.term === input.term);
  if (hit) return hit._detail;
  return {
    what: `${input.term}에 대한 개념 설명입니다.`, whymine: "이 상황에서 왜 중요한지 설명입니다.",
    how: "어떻게 적용하는지 설명입니다.", related: [], sources: [],
  };
}

export async function summarize(input: Prompt4In): Promise<Prompt4Out> {
  await delay(700);
  const dir = (input.user_condition ?? "").trim();
  const intro = `나는 ${input.area} 분야에서 작업을 진행하고 있어.${dir ? ` 특히 이런 방향으로 봐줘: ${dir}.` : ""} 아래 핵심 어휘들을 내 프로젝트 맥락에 맞춰 이해하려고 해.`;
  const lines = input.vocab.map((v) => `- ${v.term}: 이 프로젝트에서 ${v.term}가 어떤 의미인지 한 줄로 풀어 설명해줘.`).join("\n");
  const ask = "이 개념들이 내 프로젝트에 구체적으로 어떻게 적용되는지, 우선순위를 매겨 예시와 함께 알려줘. 그리고 내가 다음으로 물어보면 좋을 질문 2~3개도 제안해줘.";
  return {
    area: input.area, task_intent: "이 분야를 이해하고 활용",
    ...(dir ? { user_condition: dir } : {}),
    context_sentence: "", vocab: input.vocab,
    paste_text: `${intro}\n\n[핵심 어휘]\n${lines}\n\n[요청]\n${ask}`,
  };
}
