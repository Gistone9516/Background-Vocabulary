/// <reference types="vite/client" />

// 빌드 시 주입하는 값. 개발에서는 비워 두고 vite 프록시를 쓴다.
interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
