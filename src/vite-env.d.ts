/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev-only: bypass the Keycloak login gate. Set via .env.development. */
  readonly VITE_AUTH_BYPASS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
