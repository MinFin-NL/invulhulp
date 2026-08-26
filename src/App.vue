<template>
  <div class="invulhulp-app">
    <!-- Also gate while booting: the form must not mount until loadFromServer
         finished, or its disconnectAll() tears down the collab sockets the
         freshly mounted editors just opened (1-second connect/close churn). -->
    <div v-if="auth.status === 'loading' || (auth.status === 'authenticated' && booting)" class="invulhulp-auth-gate">
      <p>Bezig met laden…</p>
    </div>

    <div v-else-if="auth.status === 'anonymous'" class="findocs-landing">
      <!-- Hero -->
      <section class="findocs-hero">
        <div class="findocs-hero__aurora" aria-hidden="true" />
        <div class="findocs-hero__inner">
          <div class="findocs-brand">
            <img class="findocs-brand__emblem" :src="rijkslogoUrl" alt="" />
            <span class="findocs-brand__org">Ministerie van Financiën</span>
          </div>

          <h1 class="findocs-hero__title">Fin<span class="findocs-hero__title-accent">Docs</span></h1>
          <p class="findocs-hero__tagline">De slimme invulhulp voor IV-projecten, privacy en AI-impact assessments</p>
          <p class="findocs-hero__lead">
            Upload je achtergronddocumenten en laat FinDocs de formulieren — van intake tot DPIA —
            met AI voorinvullen, inclusief bronverwijzing. Jij houdt de regie: controleren, bijschaven, vaststellen.
          </p>

          <div class="findocs-hero__cta">
            <nldd-button
              class="findocs-cta-btn"
              variant="inherit-filled"
              size="lg"
              start-icon="arrow-right-in-bucket"
              text="Inloggen met SSO"
              @click="auth.login()"
            />
            <span class="findocs-hero__cta-note">Inloggen vereist · alleen voor medewerkers van het ministerie</span>
          </div>
        </div>
      </section>

      <!-- Feature highlights -->
      <section class="findocs-features" aria-label="Wat FinDocs voor je doet">
        <article v-for="f in features" :key="f.title" class="findocs-feature">
          <span class="findocs-feature__icon"><nldd-icon :name="f.icon" size="28" color="accent" /></span>
          <h2 class="findocs-feature__title">{{ f.title }}</h2>
          <p class="findocs-feature__desc">{{ f.desc }}</p>
        </article>
      </section>
    </div>

    <AssessmentForm v-else />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AssessmentForm from './components/AssessmentForm.vue'
import { useAssessmentStore } from './stores/assessmentStore'
import { useAuthStore } from './stores/authStore'
import { setLocalUser } from './collab/dossierTransport'
// The design system draws the Rijkslogo inside <nldd-top-navigation-bar>, but
// does not export the mark on its own, so the landing hero uses a local copy.
import rijkslogoUrl from './assets/rijkslogo.svg'

const auth = useAuthStore()
const booting = ref(true)

// Synchronously (before any child mounts) block ensureDossier's auto-create
// until loadFromServer runs — otherwise a child's onMounted creates a spurious
// empty dossier before shared/other-device dossiers arrive. Cleared in
// loadFromServer's finally.
useAssessmentStore().beginServerLoad()

const features = [
  {
    icon: 'folder',
    title: 'Brondocumenten',
    desc: 'Upload notulen, agenda’s en brainstorms in .docx, .xlsx, .pptx, .pdf, .txt of .md. FinDocs leest en indexeert ze automatisch.',
  },
  {
    icon: 'sparkles',
    title: 'AI-extractie',
    desc: 'Per vraag stelt de AI een antwoord voor op basis van jouw documenten, mét bronverwijzing. Geen blanco pagina meer.',
  },
  {
    icon: 'network-structure',
    title: 'Samenhangende fasen',
    desc: 'Van intake en business case tot PSA, BIO-quickscan en DPIA — de formulieren staan op volgorde van projectfase en delen antwoorden over de fasen heen.',
  },
]

onMounted(async () => {
  try {
    await auth.fetchMe()
    if (auth.status === 'authenticated') {
      if (auth.user) {
        setLocalUser({ sub: auth.user.sub, name: auth.user.name ?? auth.user.email ?? 'Gebruiker' })
      }
      const store = useAssessmentStore()
      // Server first: shared dossiers and other-device edits come in before
      // ensureDossier() would auto-create a spurious empty dossier.
      await store.loadFromServer()
      store.ensureDossier()
      store.syncDocumentsFromServer()
    }
  } catch (err) {
    // Never trap the user on the loading screen: a failed boot step still lets
    // the app render (offline / with local state).
    console.error('[boot] initialisatie mislukt:', err)
  } finally {
    booting.value = false
  }
})
</script>

<style scoped>
.invulhulp-auth-gate {
  max-inline-size: 32rem;
  margin: 6rem auto;
  padding: var(--primitives-space-32);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--primitives-space-16);
}

/* ===== FinDocs landing / login screen ===== */
.findocs-landing {
  min-block-size: 100vh;
  background: var(--semantics-surfaces-tinted-background-color);
}

/* --- Hero --- */
.findocs-hero {
  position: relative;
  overflow: hidden;
  background: var(--semantics-content-accent-color);
  color: var(--semantics-surfaces-base-background-color);
  padding-block: clamp(3rem, 9vw, 6rem) clamp(3.5rem, 10vw, 6.5rem);
  padding-inline: var(--primitives-space-32);
}

/* Flashy-but-tasteful drifting aurora using the app's AI-mode palette */
.findocs-hero__aurora {
  position: absolute;
  inset: -40% -10% auto -10%;
  block-size: 160%;
  background:
    radial-gradient(40% 50% at 18% 30%, rgba(14, 165, 233, 0.55), transparent 70%),
    radial-gradient(45% 55% at 82% 25%, rgba(91, 33, 182, 0.55), transparent 70%),
    radial-gradient(50% 60% at 55% 80%, rgba(14, 165, 233, 0.35), transparent 70%);
  filter: blur(8px);
  opacity: 0.85;
  animation: findocs-aurora var(--invulhulp-loop-ambient) var(--invulhulp-ease-in-out) infinite alternate;
  pointer-events: none;
}

@keyframes findocs-aurora {
  0%   { transform: translate3d(-3%, -2%, 0) scale(1); }
  50%  { transform: translate3d(3%, 2%, 0) scale(1.08); }
  100% { transform: translate3d(-2%, 1%, 0) scale(1.04); }
}

@media (prefers-reduced-motion: reduce) {
  .findocs-hero__aurora { animation: none; }
}

.findocs-hero__inner {
  position: relative;
  z-index: 1;
  max-inline-size: 46rem;
  margin-inline: auto;
  text-align: center;
}

.findocs-brand {
  display: inline-flex;
  align-items: center;
  gap: var(--primitives-space-12);
  padding: var(--primitives-space-4) var(--primitives-space-16);
  margin-block-end: var(--primitives-space-24);
  background: rgb(255 255 255 / 0.1);
  border: 1px solid rgb(255 255 255 / 0.18);
  border-radius: 999px;
}

/* The Rijkslogo is a 1:2 portrait mark — set the
   height and let the width follow, or it renders stretched. */
.findocs-brand__emblem {
  block-size: 2rem;
  inline-size: auto;
}

.findocs-brand__org {
  font-size: var(--primitives-font-size-90);
  font-weight: var(--primitives-font-weight-body-semi-bold);
  color: rgb(255 255 255 / 0.92);
  white-space: nowrap;
}

.findocs-hero__title {
  font-size: clamp(3rem, 11vw, 5.5rem);
  font-weight: var(--primitives-font-weight-body-bold);
  line-height: 1.02;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--semantics-surfaces-base-background-color);
}

.findocs-hero__title-accent {
  background: linear-gradient(110deg, #7dd3fc 0%, #a78bfa 45%, #7dd3fc 100%);
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  animation: findocs-shine var(--invulhulp-loop-sheen) var(--invulhulp-ease-linear) infinite;
}

@keyframes findocs-shine {
  to { background-position: 200% center; }
}

@media (prefers-reduced-motion: reduce) {
  .findocs-hero__title-accent { animation: none; }
}

.findocs-hero__tagline {
  margin: var(--primitives-space-16) auto 0;
  max-inline-size: 36rem;
  font-size: clamp(1.125rem, 2.4vw, 1.5rem);
  font-weight: var(--primitives-font-weight-body-semi-bold);
  color: rgb(255 255 255 / 0.95);
}

.findocs-hero__lead {
  margin: var(--primitives-space-16) auto 0;
  max-inline-size: 38rem;
  font-size: var(--primitives-font-size-100);
  line-height: var(--primitives-line-height-loose);
  color: rgb(255 255 255 / 0.8);
}

.findocs-hero__cta {
  margin-block-start: var(--primitives-space-40);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--primitives-space-12);
}

/* inherit-filled derives its colours from the surrounding text colour, which on
   the hero is white on the accent surface — exactly the contrast we want. The
   shadow sits on the host; the button's own box is inside its shadow root. */
.findocs-cta-btn {
  border-radius: var(--primitives-corner-radius-md);
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.25);
}

.findocs-hero__cta-note {
  font-size: var(--primitives-font-size-90);
  color: rgb(255 255 255 / 0.65);
}

/* --- Feature highlights --- */
.findocs-features {
  max-inline-size: 64rem;
  margin: clamp(-3rem, -6vw, -4rem) auto 0;
  padding-inline: var(--primitives-space-32);
  padding-block-end: var(--primitives-space-64);
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: var(--primitives-space-24);
}

.findocs-feature {
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
  padding: var(--primitives-space-32) var(--primitives-space-24);
  box-shadow: 0 1px 3px rgb(21 66 115 / 0.06), 0 10px 24px rgb(21 66 115 / 0.08);
  transition: transform var(--invulhulp-duration-fast), box-shadow var(--invulhulp-duration-fast);
}

.findocs-feature:hover {
  transform: translateY(-3px);
  box-shadow: 0 2px 6px rgb(21 66 115 / 0.1), 0 14px 30px rgb(21 66 115 / 0.12);
}

.findocs-feature__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 3rem;
  block-size: 3rem;
  margin-block-end: var(--primitives-space-16);
  background: var(--semantics-surfaces-tinted-background-color);
  border-radius: var(--primitives-corner-radius-sm);
}

.findocs-feature__title {
  font-size: var(--primitives-font-size-200);
  font-weight: var(--primitives-font-weight-body-bold);
  color: var(--semantics-content-accent-color);
  margin: 0 0 var(--primitives-space-8);
}

.findocs-feature__desc {
  font-size: var(--primitives-font-size-90);
  line-height: var(--primitives-line-height-snug);
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
}
</style>
