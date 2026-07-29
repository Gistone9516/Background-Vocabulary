// 진입 화면. v1 사이드패널의 마크업과 클래스를 그대로 옮겼다(디자인 변경 없음).
// 파일 첨부와 주간 잔여 안내는 pro 상태와 게이팅이 붙는 뒤 슬라이스에서 살린다.
// 제출은 주입된 콜백으로 넘긴다. 실제 classify 호출 연결은 S2에서 한다.

import { useMemo, useRef, useState } from "react";
import { tr } from "../i18n/strings.js";
import { EXAMPLES, pickRandom } from "../i18n/examples.js";

const FLOAT_NAMES = ["chipFloatA", "chipFloatB", "chipFloatC"];
const CHIP_COUNT = 8;

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
  // 진입으로 되돌려 보낸 이유(주간 소진 등). 화면 바깥에 두면 여백을 못 받아 잘린다.
  notice?: string | null;
  onSubmit?: (input: string, condition: string) => void;
}

export function EntryScreen({ onSubmit, notice }: EntryScreenProps) {
  const [input, setInput] = useState("");
  const [cond, setCond] = useState("");
  const [showCond, setShowCond] = useState(false);
  const [inputErr, setInputErr] = useState(false);
  const [chipSeed, setChipSeed] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const chips = useMemo(() => buildChips(chipSeed), [chipSeed]);

  // 입력 줄 수에 맞춰 높이를 늘리되 상한을 둔다.
  // 상한은 CSS의 max-height를 그대로 읽어 쓴다. 여기에 숫자를 따로 적어 두면 CSS 값이 바뀌었을 때
  // 조용히 어긋나고 아무도 알아채지 못한다. 이제 상한도 화면 크기를 따라 함께 변한다.
  const grow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = parseFloat(getComputedStyle(el).maxHeight);
    el.style.height = Math.min(el.scrollHeight, Number.isFinite(max) ? max : el.scrollHeight) + "px";
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
      {notice ? <p className="listnote" style={{ textAlign: "center" }}>{notice}</p> : null}
      {/* 입력창은 불변 위치다. 위로는 제목 영역이 높이를 고정하고, 아래로는 칩이 몇 줄이든 흘러내린다.
          그래서 제목이나 부제가 길어져도, 아래 내용이 늘어나도 입력창은 같은 자리에 남는다.
          자리를 정하는 규칙은 shell.css의 .heroHead에 있다. */}
      <div className="hero">
        <div className="heroHead">
          <h1 className="heroTitle">{tr("entry_title")}</h1>
          <p className="heroSub">{tr("entry_sub")}</p>
        </div>
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
