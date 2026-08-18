// 진입 화면. v1 사이드패널의 마크업과 클래스를 그대로 옮겼다(디자인 변경 없음).
// 파일 첨부는 C4 S4에서 살렸다(FR-901) — 웹 표준(File·drop)만 쓰므로 웹·데스크톱 화면 한 벌이다.
// 잠금 여부(attachLocked)는 /config의 attachRequiresPro에서 온다. 판정은 서버가 같은 값으로 한다.
// 제출은 주입된 콜백으로 넘긴다.

import { useMemo, useRef, useState, type ReactNode } from "react";
import type { OutputLocale } from "@vock/shared";
import { EXAMPLES, pickRandom } from "../i18n/examples.js";
import { useOutputLocale, useTr } from "../i18n/locale.js";
import { toAttached, type AttachedFile } from "./attach.js";

// v1 App.tsx의 FILE_ACCEPT 계승 — isTextFile 정규식보다 좁은 것이 의도다(선택 대화상자 필터).
const FILE_ACCEPT = "text/*,.txt,.md,.markdown,.csv,.json,.yml,.yaml,.xml,.html,.log,.tex";

const FLOAT_NAMES = ["chipFloatA", "chipFloatB", "chipFloatC"];
const CHIP_COUNT = 8;

interface Chip {
  text: string;
  name: string;
  dur: number;
  delay: number;
}

// 칩마다 부유 키프레임과 속도, 시작 위상을 달리해 그룹이 아니라 개별로 움직이게 한다(v1 동작).
function buildChips(seed: number, locale: OutputLocale): Chip[] {
  void seed;
  // EXAMPLES는 로케일 전부를 담은 레코드라 폴백이 필요 없다. ?? EXAMPLES.ko를 붙이면 나중에
  // 로케일이 하나 늘었을 때 비어 있는 것을 조용히 한국어로 덮는다.
  return pickRandom(EXAMPLES[locale], CHIP_COUNT).map((text) => ({
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
  // 파일 첨부(FR-901). attachLocked = 잠금 표시(v1 감사 c-1-3 반영 — 잠긴 것이 보이는 게
  // 안 보이다가 페이월로 튀는 것보다 낫다). maxContextChars = /config 값(클라 절단은 UX,
  // 서버가 같은 값으로 다시 자른다 — DS4-2).
  attachLocked?: boolean;
  maxContextChars?: number;
  onSubmit?: (input: string, condition: string, context?: string) => void;
  // 예시칩 아래 트랙(C5-S3). PrimerScreen 의 mapPanel 과 같은 능력 모델이다 —
  // 화면은 자리만 주고 내용을 모른다. null 이면 그 자리가 뜨지 않는다.
  tracks?: ReactNode | null;
}

export function EntryScreen({ onSubmit, notice, attachLocked, maxContextChars, tracks }: EntryScreenProps) {
  const tr = useTr();
  const [input, setInput] = useState("");
  const [cond, setCond] = useState("");
  const [showCond, setShowCond] = useState(false);
  const [inputErr, setInputErr] = useState(false);
  const [chipSeed, setChipSeed] = useState(0);
  const [attached, setAttached] = useState<AttachedFile | null>(null);
  // 고지 한 줄: 텍스트 아님(texterr) / 잘림(truncated) / 잠김 안내(pro_note). 마지막 것만 남긴다.
  const [attachNote, setAttachNote] = useState<"attach_texterr" | "attach_truncated" | "attach_pro_note" | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const acceptFile = async (f: File) => {
    if (attachLocked) {
      setAttachNote("attach_pro_note");
      return;
    }
    // /config가 아직 안 왔으면 클라 절단(UX 고지)을 생략한다 — 하드닝은 서버가 같은 값으로 한다
    // (DS4-2). 여기 수치를 박으면 env를 바꾸는 순간 조용히 거짓이 된다(L-4와 같은 이유).
    const a = await toAttached(f, maxContextChars ?? Infinity);
    if (!a) {
      setAttachNote("attach_texterr");
      return;
    }
    setAttached(a);
    setAttachNote(a.truncated ? "attach_truncated" : null);
  };

  // locale이 deps에 없으면 언어를 바꿔도 칩이 그대로 남는다(v1도 [loc, chipSeed]였다).
  const { locale } = useOutputLocale();
  const chips = useMemo(() => buildChips(chipSeed, locale), [chipSeed, locale]);

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
    onSubmit?.(text, cond.trim(), attached?.text);
  };

  const useChip = (text: string) => {
    setInput(text);
    setInputErr(false);
    taRef.current?.focus();
    requestAnimationFrame(grow);
  };

  return (
    <main
      className="scroll entryMain screenIn"
      style={{ position: "relative" }}
      // HTML5 드롭(FR-901). 데스크톱 웹뷰도 같은 경로다 — tauri.conf가 dragDropEnabled:false로
      // 자체 가로채기를 껐다(DS4-5). 경로가 하나라 한쪽만 고치는 수정이 생길 수 없다.
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) void acceptFile(f);
      }}
    >
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
              {/* 첨부(FR-901). 잠겨도 버튼은 보인다 — 안 보이다가 페이월로 튀는 것이 v1 감사 지적이다. */}
              {attached ? (
                <button className="attach" onClick={() => { setAttached(null); setAttachNote(null); }} title={tr("attach_remove")}>
                  {attached.name} ✕
                </button>
              ) : (
                <button
                  className={attachLocked ? "attach locked" : "attach"}
                  onClick={() => (attachLocked ? setAttachNote("attach_pro_note") : fileRef.current?.click())}
                  title={attachLocked ? tr("attach") : tr("attach_short")}
                >
                  {attachLocked ? tr("attach") : tr("attach_short")}
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={FILE_ACCEPT}
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void acceptFile(f);
                  e.target.value = "";
                }}
              />
              <button className="send" onClick={submit} aria-label={tr("next")}>
                →
              </button>
            </div>
          </div>
          {inputErr ? <div className="errmsg" style={{ textAlign: "center" }}>{tr("entry_err")}</div> : null}
          {attachNote ? <div className="listnote" style={{ textAlign: "center" }}>{tr(attachNote)}</div> : null}
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
        {/* 하단 트랙(C5-S3 V-1). heroGlow 의 형제이고 hero 안이다 — 오로라 밖이면서
            hero{flex:1} 에 밀리지 않는 유일한 자리다. 무엇이 들어갈지는 이 화면이 모른다. */}
        {tracks ?? null}
      </div>
    </main>
  );
}
