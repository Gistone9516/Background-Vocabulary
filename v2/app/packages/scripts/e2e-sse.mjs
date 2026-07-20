// DeepSeek SSE 증분 파서 결정적 검증(네트워크 없음). 임의 청크 경계로 쪼갠 SSE를
// consumeSseStream에 흘려 완성된 Term만 순서대로 emit되는지 확인한다. 빌드 산출물(dist) 소비.
import { consumeSseStream } from "@vock/providers";

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

const encoder = new TextEncoder();
const full = JSON.stringify({
  terms: [
    { term: "안티와인드업", kind: "기법", priority: 1, why: "출력 제한 시 적분 축적을 막는다.", one_line: "적분 폭주 방지", tag: "몰라" },
    { term: "적분기 와인드업", kind: "현상", priority: 2, why: "포화에도 적분이 계속된다.", one_line: "오버슈트 유발", tag: "몰라" },
  ],
});
function sseData(content) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`;
}
// content를 7자씩 쪼개 각 delta로 흘린다(객체가 청크 중간에서 갈려도 완성 전엔 emit 안 됨을 검증).
const dataLines = [];
for (let i = 0; i < full.length; i += 7) dataLines.push(sseData(full.slice(i, i + 7)));
const wire = dataLines.join("") + "data: [DONE]\n";

// 바이트 스트림을 50바이트씩(줄 경계 무관) 흘려 lineBuffer 재조립도 함께 검증.
const body = new ReadableStream({
  start(c) {
    for (const part of wire.match(/[\s\S]{1,50}/g) ?? [wire]) c.enqueue(encoder.encode(part));
    c.close();
  },
});
const events = new ReadableStream({
  async start(c) {
    await consumeSseStream(body, c);
  },
});

const got = [];
const reader = events.getReader();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  got.push(value);
}

const terms = got.filter((e) => e.type === "term");
check("term 이벤트 2건", terms.length === 2, `got=${terms.length}`);
check("순서·내용 보존", terms[0]?.term?.term === "안티와인드업" && terms[1]?.term?.term === "적분기 와인드업");
check("Term 필드 온전", terms[0]?.term?.priority === 1 && terms[0]?.term?.tag === "몰라");
check("done 이벤트로 종료", got[got.length - 1]?.type === "done");

if (failures > 0) { console.error(`\nSSE 파서 테스트 실패: ${failures}건.`); process.exit(1); }
console.log("\nSSE 파서 테스트 통과: 임의 청크 경계에서 완성 Term만 순서대로 emit.");
