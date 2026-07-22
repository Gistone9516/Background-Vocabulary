// @vock/ui-shared 공개 표면. 화면과 셸, 문구를 노출한다.
// 스타일은 패키지 exports의 ./styles.css 로 별도 임포트한다(번들러가 처리).
export { AppShell } from "./app/AppShell.js";
export type { AppShellProps } from "./app/AppShell.js";
export { EntryScreen } from "./screens/EntryScreen.js";
export type { EntryScreenProps } from "./screens/EntryScreen.js";
export { tr } from "./i18n/strings.js";
export { EXAMPLES, pickRandom } from "./i18n/examples.js";
