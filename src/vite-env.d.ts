/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev-only: bypass the Keycloak login gate. Set via .env.development. */
  readonly VITE_AUTH_BYPASS?: string
}

/** package.json `version`, set by vite.config.ts `define`. */
declare const __APP_VERSION__: string

interface ImportMeta {
  readonly env: ImportMetaEnv
}
