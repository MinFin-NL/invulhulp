<template>
  <footer class="invulhulp-footer" role="contentinfo" aria-label="Bèta-melding">
    <div
      class="rvo-max-width-layout rvo-max-width-layout--lg rvo-max-width-layout-inline-padding--sm invulhulp-footer__inner"
    >
      <div class="rvo-alert rvo-alert--warning rvo-alert--padding-sm invulhulp-footer__alert">
        <div class="rvo-alert__container">
          <p class="rvo-text rvo-text--sm invulhulp-footer__text">
            Dit is een bètaversie van dit hulpmiddel. Vragen of feedback?
            <a
              class="rvo-link"
              href="mailto:innovatiemanagamentfinancien@minfin.nl"
            >innovatiemanagamentfinancien@minfin.nl</a>
          </p>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.invulhulp-footer {
  position: fixed;
  inset-block-end: 0;
  inset-inline: 0;
  z-index: 100;
  pointer-events: none;
}

.invulhulp-footer__inner {
  pointer-events: auto;
  padding-block: 3px;
  padding-inline: var(--rvo-space-md);
}

.invulhulp-footer__alert {
  text-align: center;
}

.invulhulp-footer__text {
  margin: 0;
}
</style>
