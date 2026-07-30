/// <reference types="vite/client" />

// dev는 .env.development의 "/api"(vite 프록시, 명시), 프로덕션은 빌드가 주입을 강제한다(D-3).
interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
