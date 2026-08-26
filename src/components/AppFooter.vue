<template>
  <footer class="invulhulp-footer" role="contentinfo" aria-label="Bèta-melding">
    <div
      class="rvo-max-width-layout rvo-max-width-layout--lg rvo-max-width-layout-inline-padding--sm invulhulp-footer__inner"
    >
            <nldd-banner
              variant="warning"
              size="sm"
              class="invulhulp-footer__alert"
            >
          <p class="rvo-text rvo-text--sm invulhulp-footer__text">
            Dit is een bètaversie van dit hulpmiddel. Vragen of feedback?
            <nldd-link
              href="mailto:innovatiemanagamentfinancien@minfin.nl">
            innovatiemanagamentfinancien@minfin.nl</nldd-link>
          </p>
      </nldd-banner>
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
  padding-inline: var(--primitives-space-16);
}

.invulhulp-footer__alert {
  text-align: center;
}

.invulhulp-footer__text {
  margin: 0;
}
</style>
