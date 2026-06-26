<template>
  <div class="utrecht-document rvo-theme">
    <div v-if="auth.status === 'loading'" class="invulhulp-auth-gate">
      <p>Bezig met laden…</p>
    </div>

    <div v-else-if="auth.status === 'anonymous'" class="findocs-landing">
      <!-- Hero -->
      <section class="findocs-hero">
        <div class="findocs-hero__aurora" aria-hidden="true" />
        <div class="findocs-hero__inner">
          <div class="findocs-brand">
            <img class="findocs-brand__emblem" :src="emblemUrl" alt="" />
            <span class="findocs-brand__org">Ministerie van Financiën</span>
          </div>

          <h1 class="findocs-hero__title">Fin<span class="findocs-hero__title-accent">Docs</span></h1>
          <p class="findocs-hero__tagline">De slimme invulhulp voor IV-projecten, privacy en AI-impact assessments</p>
          <p class="findocs-hero__lead">
            Upload je achtergronddocumenten en laat FinDocs de formulieren — van intake tot DPIA —
            met AI voorinvullen, inclusief bronverwijzing. Jij houdt de regie: controleren, bijschaven, vaststellen.
          </p>

          <div class="findocs-hero__cta">
            <button class="rvo-button rvo-button--primary findocs-cta-btn" @click="auth.login()">
              <span class="findocs-cta-btn__icon" aria-hidden="true" />
              Inloggen met SSO
            </button>
            <span class="findocs-hero__cta-note">Inloggen vereist · alleen voor medewerkers van het ministerie</span>
          </div>
        </div>
      </section>

      <!-- Feature highlights -->
      <section class="findocs-features" aria-label="Wat FinDocs voor je doet">
        <article v-for="f in features" :key="f.title" class="findocs-feature">
          <span class="findocs-feature__icon"><img :src="f.icon" alt="" /></span>
          <h2 class="findocs-feature__title">{{ f.title }}</h2>
          <p class="findocs-feature__desc">{{ f.desc }}</p>
        </article>
      </section>
    </div>

    <AssessmentForm v-else />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import AssessmentForm from './components/AssessmentForm.vue'
import { useAssessmentStore } from './stores/assessmentStore'
import { useAuthStore } from './stores/authStore'
import emblemUrl from '@nl-rvo/assets/images/emblem.svg'
import brondocIcon from '@nl-rvo/assets/icons/op-kantoor/map-vol-documenten.svg'
import aiIcon from '@nl-rvo/assets/icons/computer-en-internet/digitalisering.svg'
import samenhangIcon from '@nl-rvo/assets/icons/op-kantoor/documenten-met-elkaar-verbonden.svg'

const auth = useAuthStore()

const features = [
  {
    icon: brondocIcon,
    title: 'Brondocumenten',
    desc: 'Upload notulen, agenda’s en brainstorms in .docx, .xlsx, .pptx, .txt of .md. FinDocs leest en indexeert ze automatisch.',
  },
  {
    icon: aiIcon,
    title: 'AI-extractie',
    desc: 'Per vraag stelt de AI een antwoord voor op basis van jouw documenten, mét bronverwijzing. Geen blanco pagina meer.',
  },
  {
    icon: samenhangIcon,
    title: 'Samenhangende sporen',
    desc: 'Van intake en business case tot PSA, BIO-quickscan en DPIA — formulieren delen antwoorden over de sporen heen.',
  },
]

onMounted(async () => {
  await auth.fetchMe()
  if (auth.status === 'authenticated') {
    useAssessmentStore().ensureDossier()
  }
})
</script>

<style scoped>
.invulhulp-auth-gate {
  max-inline-size: 32rem;
  margin: 6rem auto;
  padding: var(--rvo-space-xl);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--rvo-space-md);
}

/* ===== FinDocs landing / login screen ===== */
.findocs-landing {
  min-block-size: 100vh;
  background: var(--rvo-color-lichtblauw-150);
}

/* --- Hero --- */
.findocs-hero {
  position: relative;
  overflow: hidden;
  background: var(--rvo-color-lintblauw);
  color: var(--rvo-color-wit);
  padding-block: clamp(3rem, 9vw, 6rem) clamp(3.5rem, 10vw, 6.5rem);
  padding-inline: var(--rvo-space-xl);
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
  animation: findocs-aurora 16s ease-in-out infinite alternate;
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
  gap: var(--rvo-space-sm);
  padding: var(--rvo-space-2xs) var(--rvo-space-md);
  margin-block-end: var(--rvo-space-lg);
  background: rgb(255 255 255 / 0.1);
  border: 1px solid rgb(255 255 255 / 0.18);
  border-radius: 999px;
}

.findocs-brand__emblem {
  inline-size: 1.5rem;
  block-size: 1.5rem;
}

.findocs-brand__org {
  font-size: var(--rvo-font-size-sm);
  font-weight: var(--rvo-font-weight-semibold);
  color: rgb(255 255 255 / 0.92);
  white-space: nowrap;
}

.findocs-hero__title {
  font-size: clamp(3rem, 11vw, 5.5rem);
  font-weight: var(--rvo-font-weight-bold);
  line-height: 1.02;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--rvo-color-wit);
}

.findocs-hero__title-accent {
  background: linear-gradient(110deg, #7dd3fc 0%, #a78bfa 45%, #7dd3fc 100%);
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  animation: findocs-shine 6s linear infinite;
}

@keyframes findocs-shine {
  to { background-position: 200% center; }
}

@media (prefers-reduced-motion: reduce) {
  .findocs-hero__title-accent { animation: none; }
}

.findocs-hero__tagline {
  margin: var(--rvo-space-md) auto 0;
  max-inline-size: 36rem;
  font-size: clamp(1.125rem, 2.4vw, 1.5rem);
  font-weight: var(--rvo-font-weight-semibold);
  color: rgb(255 255 255 / 0.95);
}

.findocs-hero__lead {
  margin: var(--rvo-space-md) auto 0;
  max-inline-size: 38rem;
  font-size: var(--rvo-font-size-md);
  line-height: var(--rvo-line-height-lg);
  color: rgb(255 255 255 / 0.8);
}

.findocs-hero__cta {
  margin-block-start: var(--rvo-space-2xl);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--rvo-space-sm);
}

.findocs-cta-btn {
  gap: var(--rvo-space-sm);
  font-size: var(--rvo-font-size-lg);
  padding-inline: var(--rvo-space-2xl);
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.25);
}

.findocs-cta-btn__icon {
  display: inline-block;
  inline-size: 1.25rem;
  block-size: 1.25rem;
  flex-shrink: 0;
  background-color: currentColor;
  /* Static stylesheet url() so Vite resolves/encodes the NLDS icon correctly
     in production; a runtime `url(${dataUri})` renders as a white square. */
  -webkit-mask: url('@nl-rvo/assets/icons/functioneel/inloggen.svg') center / contain no-repeat;
  mask: url('@nl-rvo/assets/icons/functioneel/inloggen.svg') center / contain no-repeat;
}

.findocs-hero__cta-note {
  font-size: var(--rvo-font-size-sm);
  color: rgb(255 255 255 / 0.65);
}

/* --- Feature highlights --- */
.findocs-features {
  max-inline-size: 64rem;
  margin: clamp(-3rem, -6vw, -4rem) auto 0;
  padding-inline: var(--rvo-space-xl);
  padding-block-end: var(--rvo-space-4xl);
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: var(--rvo-space-lg);
}

.findocs-feature {
  background: var(--rvo-color-wit);
  border: 1px solid var(--rvo-color-lichtblauw-300);
  border-radius: var(--rvo-border-radius-md);
  padding: var(--rvo-space-xl) var(--rvo-space-lg);
  box-shadow: 0 1px 3px rgb(21 66 115 / 0.06), 0 10px 24px rgb(21 66 115 / 0.08);
  transition: transform 0.15s, box-shadow 0.15s;
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
  margin-block-end: var(--rvo-space-md);
  background: var(--rvo-color-lichtblauw-150);
  border-radius: var(--rvo-border-radius-sm);
}

.findocs-feature__icon img {
  inline-size: 1.75rem;
  block-size: 1.75rem;
}

.findocs-feature__title {
  font-size: var(--rvo-font-size-lg);
  font-weight: var(--rvo-font-weight-bold);
  color: var(--rvo-color-lintblauw);
  margin: 0 0 var(--rvo-space-xs);
}

.findocs-feature__desc {
  font-size: var(--rvo-font-size-sm);
  line-height: var(--rvo-line-height-md);
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
}
</style>
