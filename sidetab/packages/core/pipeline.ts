// 파이프라인 오케스트레이터. 정본은 구현계획 9장.
// 런타임 전용 바인딩 없음. LlmClient, SearchProvider, CacheStore 인터페이스에만 의존한다.
// 프롬프트 빌더는 @sidetab/shared의 prompts 네임스페이스에서 가져온다.
// 사용량 카운트와 게이팅은 어댑터(workers)에서 처리한다(userId 전략 미결, Tier3 보류).

import type {
  Prompt1In,
  Prompt1Out,
  Prompt2In,
  Prompt2Out,
  Prompt4In,
  Prompt4Out,
  Prompt5In,
  Prompt5Out,
  StreamEvent,
} from "@sidetab/shared";
import { prompts } from "@sidetab/shared";

import type {
  PipelineDeps,
  Pipeline,
  CreatePipeline,
  RecommendInput,
} from "@sidetab/shared";

import { classifyRouting } from "./locale/index.js";
import { runRag } from "./rag/index.js";

// 모델 식별자 상수. 이 파일 외부에서 문자열을 직접 쓰지 않는다.
const MODEL_FLASH = "deepseek-v4-flash";
const MODEL_PRO   = "deepseek-v4-pro";

// 출처 표시용 site를 URL 호스트에서 파생한다(웹표준 URL, 이식 안전). 실패 시 빈 문자열.
function siteFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export const createPipeline: CreatePipeline = (deps: PipelineDeps): Pipeline => {
  return {
    // 프롬프트1: 자유 문장에서 도메인과 작업유형을 분류하고 첫 분기를 만든다.
    async classify(input: Prompt1In): Promise<Prompt1Out> {
      const messages = prompts.buildPrompt1(input.raw_input, input.context_object);
      return deps.llm.complete<Prompt1Out>({
        model: MODEL_FLASH,
        messages,
      });
    },

    // 프롬프트2: 누적 선택에서 다음 분기를 만든다.
    async nextBranch(input: Prompt2In): Promise<Prompt2Out> {
      const messages = prompts.buildPrompt2(input);
      return deps.llm.complete<Prompt2Out>({
        model: MODEL_FLASH,
        messages,
      });
    },

    // 프롬프트3: RAG를 먼저 실행한 뒤 term 단위 스트리밍으로 추천 어휘를 내보낸다.
    // 고위험 도메인은 LLM을 호출하지 않고 즉시 error 이벤트로 스트림을 닫는다.
    // hard_domain이 true이면 flash 사용자라도 pro 모델을 쓴다(구현계획 6장 모델 라우팅).
    recommendStream(input: RecommendInput, signal?: AbortSignal): ReadableStream<StreamEvent> {
      // ReadableStream을 동기로 반환하되 내부 비동기 흐름을 start 안에서 처리한다.
      return new ReadableStream<StreamEvent>({
        async start(controller) {
          try {
            // 1. 로케일 라우팅 분류
            const routing = classifyRouting({
              domain: input.domain,
              search_locale: input.locale,
              domain_risk: input.domain_risk, // LLM 판정 고위험을 정적맵 미스 시 반영(판단대기 #2)
            });

            // 2. 고위험 게이트: 분류 결과가 high이면 즉시 거부하고 닫는다.
            if (routing.risk === "high") {
              controller.enqueue({
                type: "error",
                code: "HIGH_RISK_REFUSED",
                message: "고위험 도메인은 안전상 직접 다루지 않습니다",
              });
              controller.close();
              return;
            }

            // 3. RAG 실행. 검색 실패 시 limited=true로 계속 진행한다(구현계획 7장).
            const { grounding, limited } = await runRag(deps, {
              domainKey: routing.domainKey,
              topic: input.topic,
              locale: routing.locale,
            });

            // limited일 때 grounding에 근거 제한 안내를 덧붙인다.
            // 이 안내는 LLM 프롬프트에 포함돼 why/notes 필드에 반영된다.
            const groundingText = limited
              ? grounding
                ? `[근거 제한: 캐시 폴백 사용]\n${grounding}`
                : "[근거 제한: 검색 실패, 근거 없이 진행]"
              : grounding;

            // 4. 모델 선택: hard_domain이면 pro, 그 외 flash.
            const model = routing.hardDomain ? MODEL_PRO : MODEL_FLASH;

            // 5. 프롬프트3 빌드 후 스트리밍 호출.
            // exactOptionalPropertyTypes 때문에 undefined인 선택 필드는 객체에 넣지 않는다.
            const prompt3Base = {
              area: input.area,
              job_type: input.job_type,
              grounding: groundingText,
            };
            const prompt3Input = {
              ...prompt3Base,
              ...(input.user_condition !== undefined && { user_condition: input.user_condition }),
              ...(input.context_object !== undefined && { context_object: input.context_object }),
              ...(input.gap_type !== undefined && { gap_type: input.gap_type }),
              ...(input.exclude !== undefined && { exclude: input.exclude }),
            };
            const messages = prompts.buildPrompt3(prompt3Input);

            const upstream = deps.llm.streamTerms({ model, messages }, signal);
            const reader = upstream.getReader();

            // 업스트림 StreamEvent를 그대로 하위 컨트롤러에 전달한다.
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value !== undefined) {
                controller.enqueue(value);
                // done 이벤트를 받으면 스트림을 닫는다.
                if (value.type === "done") {
                  controller.close();
                  return;
                }
                // error 이벤트를 받으면 스트림을 닫는다.
                if (value.type === "error") {
                  controller.close();
                  return;
                }
              }
            }

            // 업스트림이 done 이벤트 없이 끝난 경우 여기서 닫는다.
            controller.close();
          } catch (err) {
            // 예상치 못한 예외: error 이벤트로 전달하고 닫는다.
            const message = err instanceof Error ? err.message : String(err);
            controller.enqueue({
              type: "error",
              code: "PIPELINE_ERROR",
              message,
            });
            controller.close();
          }
        },
      });
    },

    // 프롬프트4: 태깅 결과를 받아 메인 AI에 넘길 정리 텍스트를 만든다.
    async summarize(input: Prompt4In): Promise<Prompt4Out> {
      const messages = prompts.buildPrompt4(input);
      return deps.llm.complete<Prompt4Out>({
        model: MODEL_FLASH,
        messages,
      });
    },

    // 프롬프트5: 단어 상세. 자세히 클릭 시에만 호출한다(on-demand, lazy).
    // 출처(D2): 이 어휘로 경량 검색해 candidateSources를 만든다(en만; ko는 throw되어 빈 출처 폴백).
    async detail(input: Prompt5In): Promise<Prompt5Out> {
      let grounding = "";
      let candidateSources: { title: string; url: string }[] = [];
      try {
        const docs = await deps.search.search({
          query: `${input.term} ${input.topic}`,
          locale: input.locale,
          depth: "basic",
          maxResults: 3,
          rawContent: false,
        });
        grounding = docs
          .map((d) => (d.content.trim() ? `## ${d.title}\n${d.content}` : ""))
          .filter(Boolean)
          .join("\n\n");
        candidateSources = docs.map((d) => ({ title: d.title, url: d.url }));
      } catch {
        // ko throw 또는 검색 실패: 출처 없이 진행(빈 배열이면 프론트가 "확인된 출처 없음" 표시).
      }

      const messages = prompts.buildPrompt5({
        term: input.term,
        kind: input.kind,
        area: input.area,
        job_type: input.job_type,
        grounding,
        candidateSources,
        ...(input.deepen !== undefined && { deepen: input.deepen }),
      });

      const out = await deps.llm.complete<Prompt5Out>({
        model: MODEL_FLASH,
        messages,
      });

      // LLM은 candidateSources에서 title과 url만 골랐다. site는 URL 호스트로 코드가 채운다.
      out.sources = (out.sources ?? []).map((s) => ({
        title: s.title,
        url: s.url,
        site: siteFromUrl(s.url),
      }));
      return out;
    },
  };
};
