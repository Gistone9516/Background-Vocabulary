// 진입 화면. v1 사이드패널의 마크업과 클래스를 그대로 옮겼다(디자인 변경 없음).
// 파일 첨부와 주간 잔여 안내는 pro 상태와 게이팅이 붙는 뒤 슬라이스에서 살린다.
// 제출은 주입된 콜백으로 넘긴다. 실제 classify 호출 연결은 S2에서 한다.

import { useMemo, useRef, useState } from "react";
import { tr } from "../i18n/strings.js";
import { EXAMPLES, pickRandom } from "../i18n/examples.js";

const FLOAT_NAMES = ["chipFloatA", "chipFloatB", "chipFloatC"];
const CHIP_COUNT = 8;
const MAX_INPUT_HEIGHT = 160;

interface Chip {
  text: string;
  name: string;
  dur: number;
  delay: number;
}

// 칩마다 부유 키프레임과 속도, 시작 위상을 달리해 그룹이 아니라 개별로 움직이게 한다(v1 동작).
function buildChips(seed: number): Chip[] {
  void seed;
  return pickRandom(EXAMPLES.ko, CHIP_COUNT).map((text) => ({
    text,
    name: FLOAT_NAMES[Math.floor(Math.random() * FLOAT_NAMES.length)]!,
    dur: 4.8 + Math.random() * 2.4,
    delay: Math.random() * 3,
  }));
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

export interface EntryScreenProps {
  onSubmit?: (input: string, condition: string) => void;
}

export function EntryScreen({ onSubmit }: EntryScreenProps) {
  const [input, setInput] = useState("");
  const [cond, setCond] = useState("");
  const [showCond, setShowCond] = useState(false);
  const [inputErr, setInputErr] = useState(false);
  const [chipSeed, setChipSeed] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const chips = useMemo(() => buildChips(chipSeed), [chipSeed]);

  // 입력 줄 수에 맞춰 높이를 늘리되 상한을 둔다.
  const grow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_INPUT_HEIGHT) + "px";
  };

  const submit = () => {
    const text = input.trim();
    if (!text) {
      setInputErr(true);
      return;
    }
    setInputErr(false);
    onSubmit?.(text, cond.trim());
  };

  const useChip = (text: string) => {
    setInput(text);
    setInputErr(false);
    taRef.current?.focus();
    requestAnimationFrame(grow);
  };

  return (
    <main className="scroll entryMain screenIn" style={{ position: "relative" }}>
      <div className="hero" style={{ transform: "translateY(-90px)" }}>
        <h1 className="heroTitle">{tr("entry_title")}</h1>
        <p className="heroSub">{tr("entry_sub")}</p>
        <div className="heroGlow">
          <div className="aurora" aria-hidden="true" />
          <div className={inputErr ? "composer err" : "composer"}>
            <textarea
              ref={taRef}
              className="composerInput"
              rows={1}
              aria-label={tr("entry_input_aria")}
              placeholder={tr("entry_input_ph")}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (inputErr) setInputErr(false);
                grow();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <div className="composerBar">
              <button className="condToggle" onClick={() => setShowCond(!showCond)}>
                {showCond ? tr("cond_close") : tr("cond_add")}
              </button>
              <button className="send" onClick={submit} aria-label={tr("next")}>
                →
              </button>
            </div>
          </div>
          {inputErr ? <div className="errmsg" style={{ textAlign: "center" }}>{tr("entry_err")}</div> : null}
          {showCond ? (
            <input
              className="field condField"
              aria-label={tr("cond_aria")}
              placeholder={tr("cond_ph")}
              value={cond}
              onChange={(e) => setCond(e.target.value)}
            />
          ) : null}
          <div className="suggest">
            {chips.map((c) => (
              <button
                key={c.text}
                className="sg"
                style={{ animationName: c.name, animationDuration: c.dur + "s", animationDelay: c.delay + "s" }}
                onClick={() => useChip(c.text)}
              >
                {c.text}
              </button>
            ))}
            <button className="shuffle" onClick={() => setChipSeed(chipSeed + 1)} aria-label={tr("shuffle")} title={tr("shuffle")}>
              <RefreshIcon />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
