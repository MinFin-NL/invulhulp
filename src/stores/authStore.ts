import { defineStore } from 'pinia'

export interface AuthUser {
  sub: string
  name: string | null
  email: string | null
}

type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

// Dev bypass: when the frontend is started in dev mode (.env.development sets
// VITE_AUTH_BYPASS=true) the login gate is skipped and a fixed local user is
// assumed. Production builds never see this flag. Mirrors auth.py's DEV_USER.
export const AUTH_BYPASS = import.meta.env.VITE_AUTH_BYPASS === 'true'
const DEV_USER: AuthUser = { sub: 'dev', name: 'Ontwikkelaar (dev)', email: 'dev@localhost' }

/**
 * Mirror of the BFF session. The SPA never holds a token — it only asks the
 * backend "who am I?" (/api/auth/me) and bounces to /api/auth/login when the
 * answer is "nobody". Not persisted: the HttpOnly session cookie is the source
 * of truth.
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as AuthUser | null,
    status: 'loading' as AuthStatus,
  }),
  actions: {
    async fetchMe() {
      if (AUTH_BYPASS) {
        this.user = DEV_USER
        this.status = 'authenticated'
        return
      }
      try {
        const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
        if (res.ok) {
          this.user = (await res.json()) as AuthUser
          this.status = 'authenticated'
        } else {
          this.user = null
          this.status = 'anonymous'
        }
      } catch {
        this.user = null
        this.status = 'anonymous'
      }
    },
    login() {
      if (AUTH_BYPASS) return
      window.location.href = '/api/auth/login'
    },
    logout() {
      if (AUTH_BYPASS) return
      window.location.href = '/api/auth/logout'
    },
  },
})
