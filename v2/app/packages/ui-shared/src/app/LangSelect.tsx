// 언어 선택. v1 사이드패널 헤더의 네이티브 <select class="langsel">를 그대로 옮겼다(디자인 변경 없음).
// 목록은 OUTPUT_LOCALES에서 만든다. 여기에 배열을 다시 적으면 서버의 readLocale과 조용히 어긋난다.

import { OUTPUT_LOCALES, type OutputLocale } from "@vock/shared";
import { LOCALE_LABELS, useOutputLocale, useTr } from "../i18n/locale.js";

export function LangSelect() {
  const tr = useTr();
  const { locale, setLocale } = useOutputLocale();
  return (
    <select
      className="langsel"
      aria-label={tr("lang_label")}
      value={locale}
      onChange={(e) => setLocale(e.target.value as OutputLocale)}
    >
      {OUTPUT_LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
