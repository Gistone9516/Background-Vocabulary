// 프롬프트 빌더 배럴. 본문은 core에만 존재한다(SoT §8, 프롬프트 자산 경계).
// 공통 블록(blocks)은 빌더 내부 구현이므로 재노출하지 않는다.
export { buildPrompt1 } from "./classify.js";
export { buildPrompt2 } from "./narrow.js";
export { buildPrompt3 } from "./recommend.js";
export { buildPreview } from "./preview.js";
export { buildRelate } from "./relate.js";
export { buildPrompt4 } from "./summarize.js";
export { buildPrompt5 } from "./detail.js";
