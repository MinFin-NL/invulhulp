<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--sm" style="padding-top: 48px; padding-bottom: 48px;">
    <div class="rvo-layout-column rvo-layout-gap--xl">

      <div>
        <h1 class="rvo-heading rvo-heading--2xl" style="color: #154273; margin-bottom: 8px;">
          AI Impact Assessment
        </h1>
        <p class="rvo-text rvo-text--lg" style="color: #555; margin: 0;">
          Versie 2.0 — Ministerie van Infrastructuur en Waterstaat
        </p>
      </div>

      <div class="rvo-alert rvo-alert--info" style="border-radius: 4px;">
        <div class="rvo-alert__content">
          <strong>Let op:</strong> Dit is een digitale hulptool bij het invullen van het AI Impact Assessment.
          Het invullen van dit formulier vervangt niet het advies van juridische, privacy- of AI-experts.
          Raadpleeg bij twijfel altijd de relevante deskundigen binnen IenW.
        </div>
      </div>

      <div class="rvo-layout-column rvo-layout-gap--md">
        <h2 class="rvo-heading rvo-heading--xl" style="color: #154273;">Over dit instrument</h2>
        <p class="rvo-text">
          Het AI Impact Assessment (AIIA) helpt medewerkers van IenW om op een gestructureerde manier
          te beoordelen of het verantwoord is een AI-systeem in te zetten, en hoe dit systeem
          verantwoord geïmplementeerd en gebruikt kan worden.
        </p>
        <p class="rvo-text">Het assessment bestaat uit twee delen:</p>
        <ul class="rvo-ul">
          <li><strong>Deel A – Afweging:</strong> Is het verantwoord dit AI-systeem in te zetten?</li>
          <li><strong>Deel B – Implementatie:</strong> Hoe wordt het systeem verantwoord geïmplementeerd?</li>
        </ul>
        <p class="rvo-text">
          Daarnaast bevat het een <strong>risicoclassificatie</strong> op basis van de EU AI-verordening,
          die bepaalt welke wettelijke verplichtingen gelden.
        </p>
      </div>

      <div class="rvo-layout-column rvo-layout-gap--sm">
        <h2 class="rvo-heading rvo-heading--xl" style="color: #154273;">Kleurcodering vragen</h2>
        <div class="rvo-layout-row rvo-layout-gap--md" style="flex-wrap: wrap;">
          <div class="rvo-layout-row rvo-layout-gap--sm" style="align-items: center;">
            <div style="width: 16px; height: 16px; background: #0070bb; border-radius: 2px; flex-shrink: 0;"></div>
            <span class="rvo-text"><strong>Blauw – verplicht:</strong> moet altijd worden ingevuld</span>
          </div>
          <div class="rvo-layout-row rvo-layout-gap--sm" style="align-items: center;">
            <div style="width: 16px; height: 16px; background: #39870c; border-radius: 2px; flex-shrink: 0;"></div>
            <span class="rvo-text"><strong>Groen – aanvullend:</strong> invullen indien van toepassing</span>
          </div>
        </div>
      </div>

      <div>
        <button @click="$emit('start')" class="rvo-button rvo-button--primary" style="font-size: 1.1rem; padding: 12px 32px;">
          Starten met het assessment
        </button>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
defineEmits<{ start: [] }>()
</script>
