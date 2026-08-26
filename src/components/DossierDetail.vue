<template>
  <div class="portal-page">
    <div class="rvo-max-width-layout rvo-max-width-layout--lg rvo-max-width-layout-inline-padding--sm">

      <!-- Dossier page header -->
      <section class="dossier-header" aria-labelledby="dossier-title">
        <button
          type="button"
          class="invulhulp-linkbutton dossier-header__back"
          @click="store.goToDossierList()"
        >
          ‹ Alle dossiers
        </button>
        <div class="dossier-header__row">
          <div class="dossier-header__title-group">
            <nldd-icon class="dossier-header__icon" name="folder" size="32" color="accent" />
            <nldd-title size="1"><h1 class="dossier-header__name" id="dossier-title">
              {{ store.activeDossier.name }}
            </h1></nldd-title>
          </div>
          <div class="dossier-actions">
            <nldd-button
              variant="neutral-transparent"
              size="sm"
              class="dossier-actions__share"
              v-if="store.isOwner"
              @click="openShareDialog"
            >
              <span slot="text">
<nldd-icon class="dossier-actions__share-icon" name="square-arrow-up" size="16" />
              Delen
              </span>
            </nldd-button>
            <nldd-button
              variant="neutral-transparent"
              size="sm"
              text="Hernoemen"
              v-if="store.canEdit"
              @click="openRenameDialog"
            />
            <nldd-button
              variant="secondary"
              size="sm"
              text="Verwijderen"
              v-if="store.isOwner"
              @click="openDeleteDialog"
            />
          </div>
        </div>
        <nldd-text size="sm" color="inherit" class="dossier-header__desc">
          Dit dossier groepeert de brondocumenten en formulierantwoorden voor één project of systeem.
        </nldd-text>
        <nldd-banner
          variant="accent"
          size="sm"
          v-if="store.readOnly"
          :text="`Gedeeld door ${store.activeDossier.ownerName ?? 'een collega'} — u heeft leesrechten.`"
        />
        <nldd-banner
          variant="critical"
          size="sm"
          v-if="shareError"
          role="alert"
          :text="shareError"
        />
      </section>

      <!-- Eerste bezoek aan een leeg dossier: één scherm, één handeling. De
           fasetijdlijn eronder is een prima overzicht, maar wie hier voor het
           eerst komt heeft nog niets om te overzien — en las nergens waaróm hij
           documenten zou uploaden. De belofte staat nu op de plek waar hij
           wordt ingelost. -->
      <section v-if="isFirstRun" class="first-run" aria-labelledby="first-run-title">
        <nldd-text size="xs" color="inherit" class="first-run__eyebrow">Stap 1 van 2</nldd-text>
        <nldd-title size="2"><h2 class="first-run__title" id="first-run-title">
          Begin met je brondocumenten
        </h2></nldd-title>
        <nldd-text color="inherit" class="first-run__lead">
          Upload wat er al ligt: notulen, een projectplan, een brainstorm of een architectuurschets.
          FinDocs leest ze en vult daarna de formulieren van dit dossier voor je in — elk antwoord met
          een verwijzing naar de passage waar het vandaan komt. Jij controleert, past aan en stelt vast.
        </nldd-text>

        <label
          class="first-run__dropzone"
          :class="{
            'first-run__dropzone--over': isDragOver,
            'first-run__dropzone--busy': isUploading,
          }"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop"
        >
          <input
            type="file"
            :accept="UPLOAD_ACCEPT"
            multiple
            :disabled="isUploading"
            class="invulhulp-visually-hidden"
            @change="onFilesSelected"
          />
          <nldd-icon class="first-run__dropzone-icon" name="arrow-up-out-bucket" size="40" color="accent" />
          <span class="invulhulp-heading--md first-run__dropzone-title">
            {{ isUploading ? 'Bezig met inlezen…' : 'Sleep je documenten hierheen' }}
          </span>
          <span class="invulhulp-text--sm first-run__dropzone-hint">
            of klik om ze te kiezen — .docx, .pdf, .xlsx, .pptx, .txt of .md
          </span>
        </label>

        <!-- Alleen de statussen die hier kunnen voorkomen: zodra er één document
             staat is dit scherm weg, dus de succesmelding hoort in de gewone
             documentenkaart. -->
        <div class="docs-alerts" role="status" aria-live="polite">
          <nldd-banner
            variant="accent"
            size="sm"
            v-if="isUploading"
            :text="uploadingLabel"
          />
          <nldd-banner
            variant="critical"
            size="sm"
            v-if="uploadError"
            :text="uploadError"
          />
        </div>

        <button
          type="button"
          class="invulhulp-linkbutton first-run__skip"
          @click="showFullDossier = true"
        >
          Ik heb geen documenten — laat me de formulieren zelf invullen
        </button>
      </section>

      <template v-else>
      <!-- Eén volgende stap, bovenaan. De pagina eronder is een compleet
           overzicht van de hele levenscyclus — prima om te verkennen, maar wie
           terugkomt wil doorwerken en moet daarvoor niet eerst vijf fasen
           afspeuren naar de kaart met "Bezig". -->
      <section v-if="nextStep" class="next-step" aria-labelledby="next-step-title">
        <div class="next-step__body">
          <nldd-text size="xs" color="inherit" class="next-step__eyebrow">{{ nextStep.eyebrow }}</nldd-text>
          <nldd-title size="2"><h2 class="next-step__title" id="next-step-title">
            {{ nextStep.form.title }}
          </h2></nldd-title>
          <nldd-text color="inherit" size="sm" class="next-step__reason">{{ nextStep.reason }}</nldd-text>
        </div>
        <nldd-button
          class="next-step__btn"
          :text="nextStep.cta"
          :variant="primaryAction === 'resume' ? 'primary' : 'secondary'"
          @click="$emit('open', nextStep.form.id)"
        />
      </section>

      <!-- Alles wat van toepassing is, is af. Dat is een mijlpaal: benoem hem,
           in plaats van de band stilletjes te laten verdwijnen. -->
      <nldd-banner
        variant="success"
        size="sm"
        class="next-step__done"
        v-else-if="allFormsDone"
        text="Alle formulieren die voor dit dossier gelden zijn afgerond."
      />

      <!-- Phase rail: the whole lifecycle in one row, as a table of contents
           for the timeline below. Each circle fills from the bottom with the
           share of that phase's forms that are afgerond. -->
      <nav class="phase-rail" aria-label="Fasen in dit dossier">
        <ol class="phase-rail__list">
          <li
            v-for="group in railGroups"
            :key="group.track"
            class="phase-rail__item"
          >
            <button
              type="button"
              class="phase-rail__step"
              :aria-label="phaseRailLabel(group)"
              @click="goToPhase(group)"
            >
              <span
                class="phase-rail__circle"
                :class="[
                  `phase-rail__circle--${markerState(group)}`,
                  { 'phase-rail__circle--minor': !group.isPhase },
                ]"
                :style="{ '--phase-fill': phaseFill(group) }"
              >
                <nldd-icon class="phase-rail__icon" :name="trackIcon(group.track)" size="20" />
              </span>
              <span class="phase-rail__label">{{ group.label }}</span>
              <span class="phase-rail__count">
                {{ trackCount(group).total > 0
                  ? `${trackCount(group).done}/${trackCount(group).total}`
                  : '—' }}
              </span>
            </button>
          </li>
        </ol>
      </nav>

      <!-- Brondocumenten upload -->
      <section class="portal-card" aria-labelledby="docs-title">
        <div class="portal-card__header">
          <div class="docs-title-row">
            <nldd-title size="2"><h2 class="portal-card__title" id="docs-title">Brondocumenten</h2></nldd-title>
            <nldd-tag v-if="store.documents.length > 0" size="sm" color="accent" aria-live="polite">
              {{ store.documents.length }} {{ store.documents.length === 1 ? 'document' : 'documenten' }} beschikbaar
            </nldd-tag>
            <nldd-button
              variant="secondary"
              size="sm"
              class="docs-graph-btn"
              :text="showGraph ? 'Verberg entiteitengrafiek' : 'Toon entiteitengrafiek'"
              v-if="hasAnyOntology"
              :aria-pressed="showGraph"
              aria-controls="entity-graph-region"
              @click="showGraph = !showGraph"
            />
          </div>
          <nldd-text size="sm" color="inherit" class="portal-card__desc">
            Upload achtergronddocumenten (notulen, brainstorms, agenda's) in .txt, .md, .docx, .xlsx, .pptx of .pdf formaat.
            Bij het invullen van een formulier kun je per vraag automatisch een antwoord laten extraheren uit deze documenten.
          </nldd-text>
        </div>

        <div v-if="store.canEdit" class="docs-controls">
          <!-- A <label> around the file input can't be an nldd-button: the
               real <button> lives in the component's shadow root, so the label
               would never reach it. The button drives the hidden input instead. -->
          <input
            ref="fileInputEl"
            type="file"
            :accept="UPLOAD_ACCEPT"
            multiple
            :disabled="isUploading"
            class="invulhulp-visually-hidden"
            @change="onFilesSelected"
          />
          <nldd-button
            class="docs-upload-btn"
            :variant="primaryAction === 'upload' ? 'primary' : 'secondary'"
            start-icon="arrow-up-out-bucket"
            :text="isUploading ? 'Bezig met inlezen…' : 'Document(en) uploaden'"
            :loading="isUploading"
            @click="fileInputEl?.click()"
          />

          <details class="rvo-expandable-content rvo-expandable-content--subtle docs-info-details">
            <summary class="rvo-expandable-content__summary invulhulp-text--sm">
              <nldd-icon class="docs-info-icon" name="info-circle" size="16" />
              Ondersteunde bestandstypen
            </summary>
            <div class="rvo-expandable-content__details">
              <ul class="invulhulp-text--sm docs-info-list">
                <li><strong>.txt / .md</strong> — platte tekst, volledig gebruikt</li>
                <li><strong>.docx</strong> — Word-document, tekst en opmaak worden gelezen</li>
                <li><strong>.xlsx</strong> — Excel-spreadsheet, celinhoud per blad</li>
                <li><strong>.pptx</strong> — PowerPoint-presentatie, alleen de tekst uit de dia's wordt gelezen (geen afbeeldingen of grafieken)</li>
                <li><strong>.pdf</strong> — alleen tekst-PDF's (bijv. geëxporteerd uit Word); gescande PDF's met alleen afbeeldingen worden geweigerd</li>
              </ul>
            </div>
          </details>
        </div>

        <!-- Live status alerts -->
        <div class="docs-alerts" role="status" aria-live="polite">
          <nldd-banner
            variant="accent"
            size="sm"
            v-if="isUploading"
            :text="uploadingLabel"
          />
                    <nldd-banner
                      variant="success"
                      size="sm"
                      v-if="successMessage"
                    >
              <div><strong>Toegevoegd:</strong> {{ successMessage }}</div>
          </nldd-banner>
          <nldd-banner
            variant="critical"
            size="sm"
            v-if="uploadError"
            :text="uploadError"
          />
        </div>

        <EntityGraph
          v-if="showGraph"
          id="entity-graph-region"
          :documents="store.documents"
          @close="showGraph = false"
        />

        <ul v-if="store.documents.length > 0" class="docs-list">
          <li
            v-for="doc in store.documents"
            :key="doc.id"
            class="docs-item"
            :class="{ 'docs-item--new': recentlyAddedIds.has(doc.id) }"
          >
            <div class="docs-item__row">
              <div class="docs-item__info">
                <nldd-icon class="docs-item__check" name="check-mark-circle" size="16" color="success" />
                <div class="docs-item__text">
                  <span class="docs-item__name">{{ doc.name }}</span>
                  <span class="docs-item__meta invulhulp-text--sm">
                    {{ formatSize(doc.content.length) }}
                    <template v-if="doc.indexing"> · indexeren…</template>
                    <template v-else-if="doc.indexError"> · indexering mislukt</template>
                    <template v-else-if="doc.chunkCount"> · {{ doc.chunkCount }} fragmenten</template>
                  </span>
                </div>
              </div>
              <button
                v-if="store.canEdit"
                type="button"
                class="invulhulp-linkbutton docs-item__remove"
                @click="store.removeDocument(doc.id)"
              >
                Verwijderen
              </button>
            </div>
            <DocumentOntology v-if="!doc.indexing && doc.ontology" :ontology="doc.ontology" />
            <nldd-text color="inherit" size="sm" class="docs-item__error" v-else-if="doc.indexError">{{ doc.indexError }}</nldd-text>
          </li>
        </ul>
        <nldd-text color="inherit" size="sm" class="docs-empty" v-else-if="!isUploading">Nog geen documenten geüpload.</nldd-text>
      </section>

      <!-- Dossier-brede AI-vulling. Het hele punt van de tool is één knop, niet
           twaalf losse toggles op twaalf kaarten. Alleen nog lege formulieren
           komen in de rij: AI Modus overschrijft velden, dus werk dat er al
           staat blijft hier buiten schot — daarvoor is de toggle op de kaart. -->
      <section
        v-if="store.canEdit && (dossierAiRun || bulkFillForms.length > 0)"
        class="bulk-ai"
        aria-labelledby="bulk-ai-title"
      >
        <div class="bulk-ai__body">
          <nldd-title size="2"><h2 class="bulk-ai__title" id="bulk-ai-title">
            Vul dit dossier in met AI
          </h2></nldd-title>
          <nldd-text color="inherit" size="sm" class="bulk-ai__desc" role="status" aria-live="polite">
            <template v-if="dossierAiRun">
              Formulier {{ dossierAiRun.current + 1 }} van {{ dossierAiRun.formIds.length }}: {{ runningFormTitle }}<template
                v-if="runningProgress"
              > · {{ runningProgress.filled }}/{{ runningProgress.total }} velden</template>
            </template>
            <template v-else-if="readyDocIds.length > 0">
              {{ bulkFillForms.length }}
              {{ bulkFillForms.length === 1 ? 'formulier is' : 'formulieren zijn' }} nog leeg.
              AI Modus vult ze één voor één in op basis van je {{ readyDocIds.length }}
              brondocument{{ readyDocIds.length === 1 ? '' : 'en' }}. Je controleert daarna elk antwoord —
              met bronverwijzing per vraag.
            </template>
            <template v-else>
              Upload eerst een brondocument hierboven; daarna kan AI Modus deze
              {{ bulkFillForms.length }} lege
              {{ bulkFillForms.length === 1 ? 'formulier' : 'formulieren' }} in één keer invullen.
            </template>
          </nldd-text>
          <div v-if="dossierAiRun" class="bulk-ai__bar" aria-hidden="true">
            <div class="bulk-ai__bar-fill" :style="{ inlineSize: `${bulkAiPct}%` }" />
          </div>
        </div>
        <nldd-button
          variant="secondary"
          class="bulk-ai__btn"
          text="Stop"
          v-if="dossierAiRun"
          @click="cancelDossierAiMode()"
        />
        <nldd-button
          class="bulk-ai__btn"
          v-else
          :variant="primaryAction === 'bulk-ai' ? 'primary' : 'secondary'"
          :disabled="readyDocIds.length === 0"
          @click="startDossierAiMode(bulkFillForms.map((f) => f.id))"
        >
          <span slot="text">
<span class="bulk-ai__spark" aria-hidden="true">✦</span>
          {{ bulkFillForms.length === 1 ? 'Vul 1 formulier in' : `Vul ${bulkFillForms.length} formulieren in` }}
          </span>
        </nldd-button>
      </section>

      <!-- Toepassingsscan: which of the forms below actually apply here. -->
      <ToepassingsscanTile
        :run="store.toepassingsscanRun"
        :kenmerken="store.kenmerken"
        :counts="scanCounts"
        @open="scanModal?.open()"
      />

      <!-- Intake en aanbieding gaan aan de fasering vooraf. Ze horen erbij, maar
           als eigen tijdlijnsectie kostten ze een half scherm voor één kaart —
           dus staan ze samen in één platte band boven de spine. -->
      <section
        v-if="preludeForms.length > 0"
        id="fase-vooraf"
        class="prelude"
        aria-labelledby="prelude-title"
      >
        <div class="prelude__header">
          <nldd-title size="2"><h2 class="prelude__title" id="prelude-title">Vooraf</h2></nldd-title>
          <nldd-text color="inherit" size="sm" class="prelude__meta">
            Nog geen projectfase<template v-if="preludeCount.total > 0">
              · {{ preludeCount.done }}/{{ preludeCount.total }} afgerond</template>
          </nldd-text>
        </div>
        <div class="card-row">
          <template v-for="(form, idx) in preludeForms" :key="form.id">
            <div class="card-chain-item">
              <div v-if="idx > 0" class="card-connector" aria-hidden="true">→</div>
              <FormCard v-bind="cardProps(form)" @open="$emit('open', $event)" v-on="cardHandlers" />
            </div>
          </template>
        </div>
      </section>

      <!-- Lifecycle timeline: one phase per step, always expanded. The spine is
           the point of the page — it is what makes the forms read as phases of
           a process rather than as three unrelated lists. -->
      <ol class="track-timeline">
      <li
        v-for="group in timelineGroups"
        :key="group.track"
        :id="`fase-${group.track}`"
        class="track-phase"
        :aria-labelledby="`track-${group.track}-title`"
      >
        <div
          class="track-phase__marker"
          :class="`track-phase__marker--${markerState(group)}`"
          aria-hidden="true"
        >
          <svg v-if="markerState(group) === 'done'" class="track-phase__check" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" focusable="false"><path fill="currentColor" d="m41.262 6.164c-1.133-.836-2.707-.676-3.641.367l-15.879 17.77-9.547-8.27a2.7 2.7 0 0 0 -3.516-.027 2.71 2.71 0 0 0 -.586 3.469l11.563 19.301a2.72 2.72 0 0 0 2.316 1.316c.957 0 1.836-.492 2.328-1.301l17.66-29.043c.727-1.195.426-2.75-.699-3.582zm0 0"/></svg>
          <template v-else-if="group.phaseNumber > 0">{{ group.phaseNumber }}</template>
        </div>

        <div class="track-phase__body">
          <div class="track-header">
            <p v-if="group.phaseNumber > 0" class="track-eyebrow">
              Fase {{ group.phaseNumber }} van {{ group.phaseCount }}
            </p>
            <div class="track-title-row">
              <nldd-title size="2"><h2 class="track-title" :id="`track-${group.track}-title`">{{ group.label }}</h2></nldd-title>
              <span v-if="trackCount(group).total > 0" class="invulhulp-text--sm track-count">
                {{ trackCount(group).done }}/{{ trackCount(group).total }} afgerond
              </span>
            </div>
            <nldd-text size="sm" color="inherit" class="track-desc">{{ group.description }}</nldd-text>
          </div>

          <nldd-text color="inherit" size="sm" class="track-empty" v-if="group.forms.length === 0">
            {{ group.emptyHint }}
          </nldd-text>

          <div v-else-if="applicableForms(group).length > 0" class="card-row">
            <!-- Connector + card travel as one unit, so a wrapping row never
                 strands a lone glyph at the end of the line above. -->
            <template v-for="(form, idx) in applicableForms(group)" :key="form.id">
            <div class="card-chain-item">
            <div v-if="idx > 0" class="card-connector" aria-hidden="true">
              {{ connectorGlyph({ track: group.track, forms: applicableForms(group) }, idx) }}
            </div>
            <!-- The beslishulp host form is rendered as a pair: its card keeps
                 every affordance the others have, with the beslishulp tile fused
                 to its leading edge. -->
            <FormCard v-bind="cardProps(form)" @open="$emit('open', $event)" v-on="cardHandlers">
              <template v-if="form.id === BESLISHULP_HOST_FORM_ID" #lead>
                <BeslishulpTile :run="store.beslishulpRun" @open="beslishulpModal?.open()" />
              </template>
            </FormCard>
            </div>
            </template>
          </div>

          <!-- Not applicable, collapsed but never hidden: a decision nobody can
               find is worse than a form nobody fills in (docs §5.6). Opening a
               form from here still works — the scan advises, the user decides. -->
          <details v-if="nvtForms(group).length > 0" class="rvo-expandable-content rvo-expandable-content--subtle nvt-group">
            <summary class="rvo-expandable-content__summary invulhulp-text--sm">
              Niet van toepassing in dit dossier ({{ nvtForms(group).length }})
            </summary>
            <div class="rvo-expandable-content__details">
              <ul class="rvo-item-list nvt-list">
                <li v-for="form in nvtForms(group)" :key="form.id" class="rvo-item-list__item nvt-item">
                  <div class="nvt-item__text">
                    <span class="nvt-item__title">{{ form.title }}</span>
                    <span class="invulhulp-text--sm invulhulp-text--subtle">{{ verdictFor(form.id).reason }}</span>
                  </div>
                  <nldd-button
                    variant="neutral-transparent"
                    size="sm"
                    text="Toch openen"
                    @click="$emit('open', form.id)"
                  />
                </li>
              </ul>
              <nldd-text size="sm" color="secondary" class="nvt-note">
                Advies van de toepassingsscan, geen juridisch oordeel. Al ingevulde antwoorden
                blijven bewaard.
              </nldd-text>
            </div>
          </details>
        </div>
      </li>
      </ol>
      </template>

    </div>

    <ConfirmDialog
      ref="aiModeErrorDialog"
      title="Documenten niet bereikbaar"
      message="De brondocumenten zijn niet meer beschikbaar in de index. Verwijder de documenten en upload ze opnieuw om AI Modus te gebruiken."
      confirm-label="Sluiten"
      cancel-label=""
      @confirm="onAiModeErrorDismissed"
      @cancel="onAiModeErrorDismissed"
    />
    <ConfirmDialog
      ref="renameDialog"
      title="Dossier hernoemen"
      kind="prompt"
      input-label="Nieuwe naam"
      confirm-label="Opslaan"
      @confirm="onRenameConfirmed"
    />
    <ConfirmDialog
      ref="deleteDialog"
      title="Dossier definitief verwijderen"
      :message="deleteMessage"
      :confirm-phrase="store.activeDossier?.name"
      confirm-label="Dossier verwijderen"
      cancel-label="Annuleren"
      variant="warning"
      @confirm="onDeleteConfirmed"
    >
      <template #danger>
        <ul class="rvo-item-list">
          <li v-for="line in deleteImpact" :key="line" class="rvo-item-list__item">{{ line }}</li>
        </ul>
      </template>
    </ConfirmDialog>
    <ShareDialog
      v-if="store.activeDossierId"
      ref="shareDialog"
      :dossier-id="store.activeDossierId"
    />
    <BeslishulpModal ref="beslishulpModal" />
    <ToepassingsscanModal ref="scanModal" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { loadFormRegistry, type FormIndexEntry } from '../services/formLoader'
import { useAssessmentStore } from '../stores/assessmentStore'
import { useAiMode } from '../composables/useAiMode'
import { useFormProgress } from '../composables/useFormProgress'
import type { FormProgress } from '../utils/formProgress'
import { groupFormsByTrack, connectorGlyph, trackIcon, type TrackGroup } from '../utils/tracks'
import DocumentOntology from './DocumentOntology.vue'
import EntityGraph from './EntityGraph.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import ShareDialog from './ShareDialog.vue'
import FormCard from './FormCard.vue'
import BeslishulpModal from './BeslishulpModal.vue'
import BeslishulpTile from './BeslishulpTile.vue'
import ToepassingsscanModal from './ToepassingsscanModal.vue'
import ToepassingsscanTile from './ToepassingsscanTile.vue'
import { evaluateApplicability, type ApplicabilityVerdict } from '../utils/toepassingsscan'
import { BESLISHULP_HOST_FORM_ID, isOutOfScope, riskLevelFor, verdictLevelLabel } from '../utils/beslishulp'
import { fetchDossier, saveDossier } from '../services/dossierService'
import { PdfNoTextError } from '../services/llmService'

defineEmits<{ open: [id: string] }>()

const store = useAssessmentStore()
const forms = ref<FormIndexEntry[]>([])
// Eén lijst voor beide upload-inputs (de eerste-keer-dropzone en de gewone
// documentenkaart), zodat ze niet uit elkaar kunnen lopen.
const UPLOAD_ACCEPT =
  '.txt,.md,.docx,.xlsx,.pptx,.pdf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation'

const uploadError = ref('')
const isDragOver = ref(false)
// De ontsnappingsroute uit het eerste-keer-scherm: wie geen documenten heeft,
// moet gewoon aan de formulieren kunnen. Sessiegebonden — zodra er een document
// staat komt het scherm sowieso niet meer terug.
const showFullDossier = ref(false)
const successMessage = ref('')
const isUploading = ref(false)
// Drives the visually hidden file input behind the upload button.
const fileInputEl = ref<HTMLInputElement | null>(null)
const uploadingLabel = ref('')
const recentlyAddedIds = ref<Set<string>>(new Set())
const showGraph = ref(false)
const hasAnyOntology = computed(() => store.documents.some(d => !!d.ontology))

const { aiModeActive, aiModeProgress, aiModeDone, aiModeTotal, aiModeError, aiModePhase, readyDocIds, startAiMode, cancelAiMode, dismissAiModeDone, dismissAiModeError, hasSmoothingUndo, undoSmoothing, dossierAiRun, startDossierAiMode, cancelDossierAiMode } = useAiMode()
const { progressFor, trackSummary } = useFormProgress()

const renameDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const deleteDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const shareDialog = ref<InstanceType<typeof ShareDialog> | null>(null)
const shareError = ref('')
const aiModeErrorDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const aiModeErrorFormId = ref<string | null>(null)
const beslishulpModal = ref<InstanceType<typeof BeslishulpModal> | null>(null)
const scanModal = ref<InstanceType<typeof ToepassingsscanModal> | null>(null)

// ---- Toepassingsscan ------------------------------------------------------
// One verdict per form, recomputed whenever the scan (or the beslishulp, which
// feeds one of the kenmerken) changes. `store.kenmerken` is null until a scan
// has been run — every verdict is then 'onbepaald' and the page looks exactly
// as it did before the scan existed.
const ALWAYS: ApplicabilityVerdict = { status: 'altijd', reason: '', kenmerken: [] }

const verdicts = computed(
  () => new Map(forms.value.map((f) => [f.id, evaluateApplicability(f.applicability, store.kenmerken)])),
)

function verdictFor(formId: string): ApplicabilityVerdict {
  return verdicts.value.get(formId) ?? ALWAYS
}

function applicableForms(group: TrackGroup): FormIndexEntry[] {
  return group.forms.filter((f) => verdictFor(f.id).status !== 'nvt')
}

function nvtForms(group: TrackGroup): FormIndexEntry[] {
  return group.forms.filter((f) => verdictFor(f.id).status === 'nvt')
}

const nvtFormIds = computed(
  () => new Set(forms.value.filter((f) => verdictFor(f.id).status === 'nvt').map((f) => f.id)),
)

const scanCounts = computed(() => {
  const counts = { verplicht: 0, mogelijk: 0, nvt: 0 }
  for (const form of forms.value) {
    const status = verdictFor(form.id).status
    if (status === 'verplicht' || status === 'mogelijk' || status === 'nvt') counts[status]++
  }
  return counts
})

// Verdict echoed as a tag on the EU AI Act card. Level only — the tile beside
// it already spells out the roles, and the tag has one line to work with.
const verdictLabel = computed(() =>
  store.beslishulpRun
    ? verdictLevelLabel(new Set(store.beslishulpRun.labels), store.beslishulpRun.conclusionId)
    : '',
)
const verdictTone = computed(() => {
  const run = store.beslishulpRun
  if (!run) return 'neutral'
  if (isOutOfScope(new Set(run.labels), run.conclusionId)) return 'info'
  switch (riskLevelFor(new Set(run.labels))) {
    case 'onaanvaardbaar': return 'error'
    case 'hoog': return 'warning'
    case 'beperkt': return 'info'
    default: return 'success'
  }
})

watch(aiModeError, (errors) => {
  const formId = Object.keys(errors)[0]
  if (formId && !aiModeErrorFormId.value) {
    aiModeErrorFormId.value = formId
    aiModeErrorDialog.value?.open()
  }
}, { deep: true })

const deleteMessage = computed(() => {
  const current = store.activeDossierId ? store.dossiers[store.activeDossierId] : null
  if (!current) return ''
  return `U staat op het punt het dossier "${current.name}" en alle bijbehorende gegevens te verwijderen.`
})

/** Wat er concreet weg is na het verwijderen — zodat de bevestiging over dit
 *  dossier gaat en niet over "een dossier". */
const deleteImpact = computed(() => {
  const current = store.activeDossierId ? store.dossiers[store.activeDossierId] : null
  if (!current) return []
  const docs = current.documents.length
  const filled = Object.values(current.forms).filter(
    (f) => Object.values(f.answers ?? {}).some((a) => a),
  ).length
  return [
    `${docs} ${docs === 1 ? 'brondocument' : 'brondocumenten'}, inclusief de zoekindex en geüploade afbeeldingen`,
    `Alle ingevulde antwoorden${filled ? ` (${filled} ${filled === 1 ? 'formulier' : 'formulieren'})` : ''} en de bewerkgeschiedenis`,
    'De toegang van iedereen met wie dit dossier is gedeeld',
  ]
})


onMounted(async () => {
  store.ensureDossier()
  // Registry incl. placeholders: dit overzicht toont ook wat er nog niet is.
  forms.value = await loadFormRegistry()
})

function onAiModeErrorDismissed() {
  if (aiModeErrorFormId.value) {
    dismissAiModeError(aiModeErrorFormId.value)
    aiModeErrorFormId.value = null
  }
}

// ---- Eerste keer ------------------------------------------------------------
// Alleen een dossier waar nog niets in zit krijgt het onboardingscherm. Wie al
// met de hand antwoorden heeft ingevuld werkt bewust zonder documenten — die
// mag zijn tijdlijn niet kwijtraken. Lezers evenmin: zij kunnen niet uploaden.
const dossierIsEmpty = computed(() =>
  Object.values(store.activeDossier?.forms ?? {}).every((f) =>
    Object.values(f.answers ?? {}).every((v) =>
      Array.isArray(v) ? v.length === 0 : typeof v !== 'string' || v.trim() === '',
    ),
  ),
)

const isFirstRun = computed(
  () =>
    store.canEdit &&
    !showFullDossier.value &&
    store.documents.length === 0 &&
    dossierIsEmpty.value,
)

// ---- Eén volgende stap ------------------------------------------------------
// De formulieren die hier meetellen: gebouwd, en niet weggestreept door de
// toepassingsscan. In registratievolgorde, wat de fasevolgorde van de tijdlijn
// is — de "volgende" stap is dus ook echt de eerstvolgende in het proces.
const liveForms = computed(() =>
  forms.value.filter((f) => !f.placeholder && verdictFor(f.id).status !== 'nvt'),
)

const allFormsDone = computed(
  () => liveForms.value.length > 0 && liveForms.value.every((f) => statusFor(f.id)?.status === 'afgerond'),
)

interface NextStep {
  form: FormIndexEntry
  /** 'start' betekent: er loopt nog niets, de gebruiker begint pas. */
  kind: 'resume' | 'finish' | 'start'
  eyebrow: string
  reason: string
  cta: string
}

/** Het ene formulier waar de gebruiker verder moet: eerst waar hij middenin
 *  zit, dan wat is doorgeklikt maar niet ingevuld, dan het eerste verplichte
 *  dat nog niet af is. Null zodra alles af is (of er niets te doen valt). */
const nextStep = computed<NextStep | null>(() => {
  const withStatus = liveForms.value.map((form) => ({ form, progress: statusFor(form.id) }))

  const busy = withStatus.find((f) => f.progress?.status === 'bezig')
  if (busy) {
    return {
      form: busy.form,
      kind: 'resume',
      eyebrow: 'Verder waar je gebleven bent',
      reason: `${busy.progress!.completed} van ${busy.progress!.total} onderdelen doorlopen.`,
      cta: 'Verder',
    }
  }

  const incomplete = withStatus.find((f) => f.progress?.status === 'onvolledig')
  if (incomplete) {
    const open = incomplete.progress!.missingMandatory
    return {
      form: incomplete.form,
      kind: 'finish',
      eyebrow: 'Bijna klaar',
      reason: `Helemaal doorlopen, maar er ${open === 1 ? 'staat nog 1 verplichte vraag' : `staan nog ${open} verplichte vragen`} open.`,
      cta: 'Afmaken',
    }
  }

  const notStarted = withStatus.filter((f) => f.progress?.status !== 'afgerond')
  if (notStarted.length === 0) return null
  // Verplicht volgens de toepassingsscan gaat voor; anders gewoon de eerste in
  // de fasevolgorde.
  const required = notStarted.find((f) => verdictFor(f.form.id).status === 'verplicht')
  const target = required ?? notStarted[0]
  return {
    form: target.form,
    kind: 'start',
    eyebrow: 'Begin hier',
    reason: verdictFor(target.form.id).reason || target.form.shortDescription || 'Nog niet gestart.',
    cta: 'Openen',
  }
})

/** Welke van de drie acties op deze pagina de primaire knop krijgt. Precies
 *  één, altijd: zonder documenten is uploaden de enige zinvolle stap, met lege
 *  formulieren is dat de AI-vulling, en zodra er werk loopt is dat doorwerken. */
const primaryAction = computed<'upload' | 'bulk-ai' | 'resume'>(() => {
  if (readyDocIds.value.length === 0) return 'upload'
  const step = nextStep.value
  if (step && step.kind !== 'start') return 'resume'
  if (bulkFillForms.value.length > 0) return 'bulk-ai'
  return 'resume'
})

// ---- Dossier-brede AI-vulling ---------------------------------------------
// De rij: echte formulieren (geen placeholders), niet weggestreept door de
// toepassingsscan, en nog helemaal leeg. Dat laatste is de veiligheidsgrens —
// AI Modus overschrijft antwoorden, en een knop die twaalf formulieren tegelijk
// raakt mag nooit werk overschrijven dat iemand al gedaan heeft.
const bulkFillForms = computed(() =>
  forms.value.filter(
    (f) =>
      !f.placeholder &&
      verdictFor(f.id).status !== 'nvt' &&
      statusFor(f.id)?.status === 'niet-gestart',
  ),
)

const runningFormTitle = computed(() => {
  const formId = dossierAiRun.value?.formId
  if (!formId) return ''
  return forms.value.find((f) => f.id === formId)?.title ?? formId
})

const runningProgress = computed(() => {
  const formId = dossierAiRun.value?.formId
  return formId ? aiModeProgress.value[formId] ?? null : null
})

// Voortgang over de hele rij: afgeronde formulieren plus het deel van het
// formulier dat nu loopt, zodat de balk ook binnen één lang formulier beweegt.
const bulkAiPct = computed(() => {
  const run = dossierAiRun.value
  if (!run || run.formIds.length === 0) return 0
  const p = runningProgress.value
  const within = p && p.total > 0 ? p.filled / p.total : 0
  return Math.round(((run.current + within) / run.formIds.length) * 100)
})

function statusFor(formId: string): FormProgress | null {
  if (!store.activeDossierId) return null
  const dossier = store.dossiers[store.activeDossierId]
  return dossier ? progressFor(dossier, formId) : null
}

function openRenameDialog() {
  if (!store.activeDossierId) return
  const current = store.dossiers[store.activeDossierId]
  if (!current) return
  renameDialog.value?.open(current.name)
}

function openDeleteDialog() {
  if (!store.activeDossierId) return
  deleteDialog.value?.open()
}

async function openShareDialog() {
  const id = store.activeDossierId
  const dossier = id ? store.dossiers[id] : null
  if (!id || !dossier) return
  shareError.value = ''
  let grants
  try {
    grants = (await fetchDossier(id)).grants
  } catch {
    // Not on the server yet (never synced) — push it now so it can be shared.
    try {
      const saved = await saveDossier({
        id,
        name: dossier.name,
        createdAt: dossier.createdAt,
        updatedAt: dossier.updatedAt,
        sessionId: dossier.sessionId,
        activeFormId: dossier.activeFormId,
        forms: dossier.forms,
      })
      dossier.myRole = saved.myRole
      grants = saved.grants
    } catch (e) {
      // Sharing needs the server; tell the user why it won't open.
      shareError.value = e instanceof TypeError
        ? 'Delen lukt niet: geen verbinding met de server.'
        : `Delen lukt niet: ${e instanceof Error ? e.message : String(e)}`
      return
    }
  }
  shareDialog.value?.open(grants)
}

function onRenameConfirmed(name: string) {
  if (!store.activeDossierId) return
  const trimmed = name.trim()
  if (!trimmed) return
  store.renameDossier(store.activeDossierId, trimmed)
}

async function onDeleteConfirmed() {
  if (!store.activeDossierId) return
  shareError.value = ''
  try {
    await store.deleteDossier(store.activeDossierId)
  } catch (e) {
    // De server weigerde (bijv. geen eigenaar meer): het dossier blijft staan,
    // dus blijf hier en zeg waarom in plaats van stil terug te navigeren.
    shareError.value = `Verwijderen lukt niet: ${e instanceof Error ? e.message : String(e)}`
    return
  }
  // Never land unannounced in whichever dossier became active next
  store.goToDossierList()
}

async function extractPptxText(file: File): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const n = (s: string) => parseInt(s.match(/\d+/)?.[0] ?? '0', 10)
      return n(a) - n(b)
    })
  const parts: string[] = []
  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async('string')
    const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? []
    const slideText = matches
      .map((m) => m.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean)
      .join(' ')
    if (slideText) parts.push(slideText)
  }
  return parts.join('\n\n')
}

async function onFilesSelected(e: Event) {
  const target = e.target as HTMLInputElement
  await ingestFiles(target.files ? Array.from(target.files) : [])
  // Reset the input that fired, not the ref: the first-run dropzone and the
  // documents card each have their own, and only one is mounted at a time.
  target.value = ''
}

function onDragOver(e: DragEvent) {
  if (!store.canEdit || isUploading.value) return
  e.preventDefault()
  isDragOver.value = true
}

function onDragLeave() {
  isDragOver.value = false
}

async function onDrop(e: DragEvent) {
  if (!store.canEdit || isUploading.value) return
  e.preventDefault()
  isDragOver.value = false
  await ingestFiles(Array.from(e.dataTransfer?.files ?? []))
}

async function ingestFiles(files: File[]) {
  if (files.length === 0) return

  uploadError.value = ''
  successMessage.value = ''
  isUploading.value = true

  const addedNames: string[] = []
  const errors: string[] = []
  const previousIds = new Set(store.documents.map((d) => d.id))

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    uploadingLabel.value =
      files.length > 1
        ? `Inlezen van ${file.name} (${i + 1} van ${files.length})…`
        : `Inlezen van ${file.name}…`

    const ext = file.name.toLowerCase().split('.').pop() ?? ''
    if (!['txt', 'md', 'docx', 'xlsx', 'pptx', 'pdf'].includes(ext)) {
      errors.push(`${file.name}: alleen .txt, .md, .docx, .xlsx, .pptx en .pdf zijn toegestaan.`)
      continue
    }
    try {
      // PDFs go to the backend whole: server-side extraction keeps tables and
      // figures intact, which the browser text layer cannot do.
      if (ext === 'pdf') {
        await store.addPdfDocument(file)
        addedNames.push(file.name)
        continue
      }
      let text: string
      if (ext === 'docx') {
        const mammoth = await import('mammoth/mammoth.browser')
        const arrayBuffer = await file.arrayBuffer()
        const result = await mammoth.extractRawText({ arrayBuffer })
        text = result.value
      } else if (ext === 'xlsx') {
        const XLSX = await import('xlsx')
        const arrayBuffer = await file.arrayBuffer()
        const wb = XLSX.read(arrayBuffer, { type: 'array' })
        const parts: string[] = []
        for (const sheetName of wb.SheetNames) {
          const sheet = wb.Sheets[sheetName]
          const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
          if (csv.trim()) parts.push(`# ${sheetName}\n${csv}`)
        }
        text = parts.join('\n\n')
      } else if (ext === 'pptx') {
        text = await extractPptxText(file)
      } else {
        text = await file.text()
      }
      if (!text.trim()) {
        errors.push(`${file.name}: geen tekst gevonden.`)
        continue
      }
      // PDFs keep their own name — the backend extracts them as-is.
      const baseName = file.name.replace(/\.(docx|xlsx|pptx)$/i, '.txt')
      await store.addDocument(baseName, text)
      addedNames.push(file.name)
    } catch (err) {
      if (err instanceof PdfNoTextError) {
        errors.push(
          `${file.name}: dit is een gescande PDF (alleen afbeeldingen) — er kon geen tekst uit worden gehaald. Upload een tekst-PDF of het originele Word-bestand.`,
        )
      } else {
        errors.push(`${file.name}: kon bestand niet inlezen.`)
      }
    }
  }

  const newIds = store.documents.map((d) => d.id).filter((id) => !previousIds.has(id))
  recentlyAddedIds.value = new Set(newIds)
  setTimeout(() => {
    for (const id of newIds) recentlyAddedIds.value.delete(id)
    recentlyAddedIds.value = new Set(recentlyAddedIds.value)
  }, 3000)

  isUploading.value = false
  uploadingLabel.value = ''
  if (addedNames.length > 0) {
    successMessage.value = addedNames.join(', ')
    setTimeout(() => {
      successMessage.value = ''
    }, 4000)
  }
  if (errors.length > 0) {
    uploadError.value = errors.join(' ')
  }
}


function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

const trackGroups = computed(() => groupFormsByTrack(forms.value))

// Intake en aanbieding: geen fase, dus geen sectie op de spine. Ze komen samen
// in de "Vooraf"-band, in dezelfde volgorde als hun sporen (TRACK_META.order,
// en `order` daarbinnen).
const preludeGroups = computed(() =>
  trackGroups.value.filter((g) => !g.isPhase && g.track !== 'onbekend'),
)
const preludeForms = computed(() => preludeGroups.value.flatMap((g) => applicableForms(g)))

// De tijdlijn houdt de echte fasen — plus de `onbekend`-bak, want die is het
// zichtbare vangnet voor een typo in index.json.
const timelineGroups = computed(() =>
  trackGroups.value.filter((g) => g.isPhase || g.track === 'onbekend'),
)

const preludeCount = computed(() =>
  preludeGroups.value.reduce(
    (acc, g) => {
      const { done, total } = trackCount(g)
      return { done: acc.done + done, total: acc.total + total }
    },
    { done: 0, total: 0 },
  ),
)

/** Alles wat een kaart nodig heeft, op één plek berekend — de kaart in de band
 *  en de kaart in de tijdlijn krijgen zo gegarandeerd dezelfde affordances. */
function cardProps(form: FormIndexEntry) {
  return {
    form,
    status: statusFor(form.id),
    verdict: verdictFor(form.id),
    paired: form.id === BESLISHULP_HOST_FORM_ID,
    beslishulpVerdict:
      form.id === BESLISHULP_HOST_FORM_ID && store.beslishulpRun
        ? { label: verdictLabel.value, tone: verdictTone.value }
        : null,
    canEdit: store.canEdit,
    hasDocuments: readyDocIds.value.length > 0,
    aiActive: aiModeActive.value.has(form.id),
    aiDone: form.id in aiModeDone.value,
    aiDoneFilled: aiModeDone.value[form.id] ?? 0,
    aiDoneTotal: aiModeTotal.value[form.id] ?? 0,
    aiProgress: aiModeProgress.value[form.id] ?? null,
    aiPhase: aiModePhase.value[form.id] ?? null,
    canUndoSmoothing: hasSmoothingUndo(form.id),
  }
}

const cardHandlers = {
  activate: startAiMode,
  cancel: cancelAiMode,
  dismiss: dismissAiModeDone,
  undoSmoothing: undoSmoothing,
}

// Per-phase completion, recomputed whenever answers change so the timeline
// marker fills in as the user finishes forms in that phase.
// Forms the scan ruled out are left out of the count: otherwise a phase could
// never reach "afgerond" because of a form nobody is supposed to fill in.
const trackCounts = computed(() => {
  const dossier = store.activeDossierId ? store.dossiers[store.activeDossierId] : null
  return dossier ? trackSummary(dossier, nvtFormIds.value) : null
})

function trackCount(group: TrackGroup): { done: number; total: number } {
  if (group.track === 'onbekend') return { done: 0, total: 0 }
  // Placeholders zijn geen formulier: ze mogen de noemer niet optillen, anders
  // kan een fase nooit "afgerond" worden.
  const real = group.forms.filter((f) => !f.placeholder).length
  return trackCounts.value?.[group.track] ?? { done: 0, total: real }
}

// The rail is the lifecycle, so the `onbekend` bucket — which is a symptom of a
// typo in index.json, not a track — stays out of it. It is still rendered as a
// section in the timeline below. Intake en aanbieding staan er wél in: ze zijn
// geen fase, maar wel een stap die de gebruiker doorloopt.
const railGroups = computed(() => trackGroups.value.filter((g) => g.track !== 'onbekend'))

/** How full the rail circle is: the share of this phase's forms that are done.
 *  Any progress at all gets a visible sliver, so "started" never reads as
 *  "untouched" — one form out of nine is 11% and would otherwise vanish. */
function phaseFill(group: TrackGroup): string {
  const { done, total } = trackCount(group)
  if (total === 0 || done === 0) return '0%'
  if (done === total) return '100%'
  return `${Math.max(12, Math.round((done / total) * 100))}%`
}

function phaseRailLabel(group: TrackGroup): string {
  const { done, total } = trackCount(group)
  const progress = total === 0 ? 'nog geen formulieren beschikbaar' : `${done} van ${total} afgerond`
  const prefix = group.phaseNumber > 0 ? `Fase ${group.phaseNumber} van ${group.phaseCount}: ` : ''
  return `${prefix}${group.label} — ${progress}`
}

/** Intake en aanbieding hebben geen eigen sectie meer: beide railstappen
 *  landen op de gedeelde "Vooraf"-band. */
function goToPhase(group: TrackGroup) {
  const id = group.isPhase ? `fase-${group.track}` : 'fase-vooraf'
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Marker state on the spine: filled+check when the phase is finished, a solid
 *  dot while it is under way, an outline when nothing has been started, and a
 *  dashed outline for a phase that has no forms yet (`beheer`). */
function markerState(group: TrackGroup): 'done' | 'busy' | 'todo' | 'empty' {
  const { done, total } = trackCount(group)
  if (total === 0) return 'empty'
  if (done === total) return 'done'
  return done > 0 || applicableForms(group).some((f) => statusFor(f.id)?.status === 'bezig') ? 'busy' : 'todo'
}
</script>

<style scoped>
.portal-page {
  /* Shared by the phase rail and the timeline spine. lichtblauw-300 is
     invisible against the lichtblauw-150 page background — tint the page's own
     lintblauw down instead, as the card shadows do. */
  --track-line: rgb(21 66 115 / 0.22);
  padding: var(--primitives-space-48) 0 var(--primitives-space-64);
  background: var(--semantics-surfaces-tinted-background-color);
  min-height: 100%;
}

.dossier-header {
  margin-block-end: var(--primitives-space-40);
}

.dossier-header__back {
  display: inline-block;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  font: inherit;
  font-size: var(--primitives-font-size-90);
  color: var(--semantics-content-accent-color);
  text-decoration: underline;
  margin-block-end: var(--primitives-space-12);
}

.dossier-header__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--primitives-space-16);
  flex-wrap: wrap;
}

.dossier-header__title-group {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-12);
  min-inline-size: 0;
}

.dossier-header__icon {
  flex-shrink: 0;
}

.dossier-header__name {
  color: var(--semantics-content-accent-color);
  margin: 0;
  overflow-wrap: anywhere;
}

.dossier-header__desc {
  color: var(--invulhulp-color-text-subtle);
  margin: var(--primitives-space-4) 0 0;
}

.portal-card {
  position: relative;
  margin-block-end: var(--primitives-space-40);
  padding: var(--primitives-space-24) var(--primitives-space-32);
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
  box-shadow: 0 1px 3px rgb(21 66 115 / 0.06), 0 4px 12px rgb(21 66 115 / 0.04);
}

.portal-card::before {
  content: "";
  position: absolute;
  inset-block-start: 0;
  inset-inline: 0;
  block-size: 4px;
  background: var(--semantics-content-accent-color);
  border-start-start-radius: var(--primitives-corner-radius-md);
  border-start-end-radius: var(--primitives-corner-radius-md);
}

/* ===== Eerste keer: één scherm, één handeling ===== */
.first-run {
  margin-block-end: var(--primitives-space-40);
  padding: var(--primitives-space-40) var(--primitives-space-32);
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
  text-align: center;
}

.first-run__eyebrow {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.first-run__title {
  color: var(--semantics-content-accent-color);
  margin: var(--primitives-space-4) 0 var(--primitives-space-12);
}

.first-run__lead {
  color: var(--invulhulp-color-text-subtle);
  margin: 0 auto var(--primitives-space-32);
  max-inline-size: 40rem;
}

.first-run__dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--primitives-space-4);
  padding: var(--primitives-space-40) var(--primitives-space-24);
  border: 2px dashed var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
  background: var(--semantics-surfaces-tinted-background-color);
  cursor: pointer;
  transition: border-color var(--invulhulp-duration-fast), background var(--invulhulp-duration-fast);
}

.first-run__dropzone:hover,
.first-run__dropzone--over {
  border-color: var(--semantics-content-accent-color);
  background: var(--semantics-surfaces-base-background-color);
}

/* De input zit visueel verstopt in de label, dus de focusring hoort hier. */
.first-run__dropzone:focus-within {
  outline: 2px solid var(--semantics-content-accent-color);
  outline-offset: 2px;
}

.first-run__dropzone--busy {
  cursor: progress;
  opacity: 0.7;
}

/* Statische mask-url zodat Vite het NLDS-icoon in de productiebuild oplost —
   een runtime url()-binding wordt een wit vlak. */
.first-run__dropzone-icon {
  margin-block-end: var(--primitives-space-4);
}

.first-run__dropzone-title {
  color: var(--semantics-content-accent-color);
  margin: 0;
}

.first-run__dropzone-hint {
  color: var(--invulhulp-color-text-subtle);
}

.first-run__skip {
  margin-block-start: var(--primitives-space-24);
  background: none;
  border: none;
  font: inherit;
  cursor: pointer;
}

/* De ene volgende stap. Neutraal wit met een lintblauwe rand aan de leeskant:
   het moet opvallen zonder te concurreren met de AI-band eronder, die zijn
   eigen (paarse) huisstijl heeft. */
.next-step {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-24);
  flex-wrap: wrap;
  margin-block-end: var(--primitives-space-32);
  padding: var(--primitives-space-16) var(--primitives-space-32);
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-dividers-color);
  border-inline-start: 4px solid var(--semantics-content-accent-color);
  border-radius: var(--primitives-corner-radius-md);
}

.next-step__body {
  flex: 1;
  min-inline-size: 14rem;
}

.next-step__eyebrow {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.next-step__title {
  color: var(--semantics-content-accent-color);
  margin: var(--primitives-space-2) 0 var(--primitives-space-2);
}

.next-step__reason {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
  max-inline-size: 44rem;
}

.next-step__btn {
  flex-shrink: 0;
}

.next-step__done {
  margin-block-end: var(--primitives-space-32);
}

/* Dossier-brede AI-vulling. Draagt bewust de AI-Modus-huisstijl (blauw/paars,
   buiten het RVO-palet) die AiModeToggle en de bannier ook gebruiken — het is
   dezelfde functie, dus dezelfde taal. Spacing en radii blijven tokens. */
.bulk-ai {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-24);
  flex-wrap: wrap;
  margin-block-end: var(--primitives-space-40);
  padding: var(--primitives-space-24) var(--primitives-space-32);
  background: linear-gradient(135deg, rgba(15, 45, 92, 0.04), rgba(91, 33, 182, 0.06));
  border: 1px solid rgba(91, 33, 182, 0.2);
  border-radius: var(--primitives-corner-radius-md);
}

.bulk-ai__body {
  flex: 1;
  min-inline-size: 16rem;
}

.bulk-ai__title {
  color: var(--semantics-content-accent-color);
  margin: 0 0 var(--primitives-space-4);
}

.bulk-ai__desc {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
  max-inline-size: 44rem;
}

.bulk-ai__bar {
  margin-block-start: var(--primitives-space-12);
  block-size: var(--primitives-space-4);
  border-radius: var(--primitives-corner-radius-sm);
  background: rgba(15, 45, 92, 0.12);
  overflow: hidden;
}

.bulk-ai__bar-fill {
  block-size: 100%;
  border-radius: var(--primitives-corner-radius-sm);
  background: linear-gradient(90deg, #0f2d5c, #5b21b6, #0ea5e9);
  transition: inline-size var(--invulhulp-duration-slow) var(--invulhulp-ease);
}

.bulk-ai__btn {
  flex-shrink: 0;
}

.bulk-ai__spark {
  margin-inline-end: var(--primitives-space-4);
}

.portal-card__header {
  margin-block-end: var(--primitives-space-16);
}

.portal-card__title {
  color: var(--semantics-content-accent-color);
  margin: 0 0 var(--primitives-space-4);
}

.portal-card__desc {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
}

.portal-card__controls {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--primitives-space-16);
  flex-wrap: wrap;
}

.dossier-actions {
  display: flex;
  gap: var(--primitives-space-8);
  align-items: center;
}

.dossier-actions__share {
  display: inline-flex;
  align-items: center;
  gap: var(--primitives-space-2);
}

.dossier-actions__share-icon {
  flex-shrink: 0;
}

.docs-title-row {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-12);
  flex-wrap: wrap;
  margin-block-end: var(--primitives-space-4);
}

.docs-graph-btn {
  margin-inline-start: auto;
}

.docs-controls {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-12);
  margin-block-end: var(--primitives-space-12);
}

/* nldd-button carries its own busy affordance via the `loading` attribute. */

.docs-info-details {
  align-self: center;
  position: relative;
}

.docs-info-details :deep(.rvo-expandable-content__summary::after) {
  display: none;
}

.docs-info-details :deep(.rvo-expandable-content__details) {
  position: absolute;
  inset-block-start: calc(100% + var(--primitives-space-4));
  inset-inline-start: 0;
  z-index: 100;
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--primitives-corner-radius-sm);
  box-shadow: 0 4px 12px rgb(21 66 115 / 0.12);
  padding: var(--primitives-space-8) var(--primitives-space-12);
  min-inline-size: 280px;
  max-inline-size: 380px;
}

.docs-info-icon {
  inline-size: 16px;
  block-size: 16px;
  flex-shrink: 0;
  opacity: 0.7;
}

.docs-info-list {
  margin-block-start: var(--primitives-space-4);
  margin-block-end: 0;
}

.docs-alerts {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-8);
  margin-block-end: var(--primitives-space-12);
}

.docs-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-4);
}

.docs-item {
  display: flex;
  flex-direction: column;
  gap: var(--primitives-space-4);
  padding: var(--primitives-space-8) var(--primitives-space-12);
  background: var(--semantics-surfaces-tinted-background-color);
  border: 1px solid var(--invulhulp-color-border);
  border-radius: var(--primitives-corner-radius-sm);
  transition: background var(--invulhulp-duration-deliberate) var(--invulhulp-ease), border-color var(--invulhulp-duration-deliberate) var(--invulhulp-ease);
}

.docs-item__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--primitives-space-8);
}

.docs-item__error {
  margin: var(--primitives-space-4) 0 0;
  color: var(--semantics-content-critical-color);
}

.docs-item--new {
  background: var(--semantics-categories-success-tinted-background-color);
  border-color: var(--semantics-content-success-color);
  animation: doc-pulse var(--invulhulp-duration-highlight) var(--invulhulp-ease-out);
}

@keyframes doc-pulse {
  0% { background: var(--semantics-categories-success-tinted-highlight-border-color); }
  100% { background: var(--semantics-categories-success-tinted-background-color); }
}


.docs-item__info {
  display: flex;
  align-items: center;
  gap: var(--primitives-space-8);
}

.docs-item__check {
  inline-size: 20px;
  block-size: 20px;
  flex-shrink: 0;
  /* Tint the SVG to the RVO groen colour via a CSS filter */
  filter: invert(40%) sepia(80%) saturate(500%) hue-rotate(65deg) brightness(90%);
}

.docs-item__text {
  display: flex;
  flex-direction: column;
}

.docs-item__name {
  font-weight: var(--primitives-font-weight-body-semi-bold);
  color: var(--semantics-content-color);
  font-size: var(--primitives-font-size-90);
}

.docs-item__meta {
  color: var(--invulhulp-color-text-subtle);
}

.docs-item__remove {
  background: none;
  border: 0;
  color: var(--semantics-content-critical-color);
  cursor: pointer;
  font-size: var(--primitives-font-size-90);
  text-decoration: underline;
  padding: var(--primitives-space-4) var(--primitives-space-8);
}

.docs-empty {
  color: var(--semantics-content-secondary-color);
  font-style: italic;
  margin: 0;
}

/* ---- Phase rail ------------------------------------------------------- */

.phase-rail {
  margin-block-end: var(--primitives-space-40);
  padding: var(--primitives-space-24) var(--primitives-space-16);
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
  box-shadow: 0 1px 3px rgb(21 66 115 / 0.06), 0 4px 12px rgb(21 66 115 / 0.04);
  /* Six phases don't fit a phone; scroll the rail rather than the page. */
  overflow-x: auto;
}

.phase-rail__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: flex-start;
  min-inline-size: 34rem;
  --rail-circle-size: 2.75rem;
}

.phase-rail__item {
  flex: 1;
  position: relative;
}

/* Intake en aanbieding zijn aanloop, geen fase: alleen een kleiner rondje.
   Alle cellen houden dezelfde breedte — de verbindingslijn hieronder is
   `inline-size: 100%` van de eigen cel en loopt tot het midden van de volgende,
   wat alleen klopt zolang buren even breed zijn. */

/* Verkleinen met `transform`, niet met --rail-circle-size: de verbindingslijn
   loopt op de hoogte van het grote midden, dus het rondje moet zijn hoogte
   houden om erop uitgelijnd te blijven. */
.phase-rail__circle--minor {
  transform: scale(0.72);
}

/* The connector runs behind the circles, from this step's centre to the next. */
.phase-rail__item:not(:last-child)::after {
  content: "";
  position: absolute;
  inset-block-start: calc(var(--rail-circle-size) / 2 - 1px);
  inset-inline-start: 50%;
  inline-size: 100%;
  block-size: 2px;
  background: var(--track-line);
}

.phase-rail__step {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--primitives-space-4);
  inline-size: 100%;
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
  padding: var(--primitives-space-4) var(--primitives-space-2);
}

/* Hover lands on the circle and the label, never on the cell: a filled block
   would paint over the connector line running behind it. */
.phase-rail__step:hover .phase-rail__circle {
  border-color: var(--semantics-content-accent-color);
  box-shadow: 0 0 0 4px var(--semantics-dividers-color);
}

.phase-rail__step:hover .phase-rail__label {
  text-decoration: underline;
}

.phase-rail__step:focus-visible {
  outline: none;
}

.phase-rail__step:focus-visible .phase-rail__circle {
  outline: 2px solid var(--semantics-content-accent-color);
  outline-offset: 3px;
}

.phase-rail__step:focus-visible .phase-rail__label {
  text-decoration: underline;
}

/* The circle fills from the bottom up to --phase-fill. The wash is a light
   tint rather than full lintblauw so the icon stays legible at any level;
   only a completed phase goes solid (see --done below). */
.phase-rail__circle {
  inline-size: var(--rail-circle-size);
  block-size: var(--rail-circle-size);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 2px solid var(--track-line);
  color: var(--semantics-content-accent-color);
  transition: border-color var(--invulhulp-duration-fast), box-shadow var(--invulhulp-duration-fast);
  background:
    linear-gradient(
      to top,
      var(--semantics-categories-accent-tinted-content-color) 0 var(--phase-fill, 0%),
      var(--semantics-surfaces-base-background-color) var(--phase-fill, 0%) 100%
    );
}

.phase-rail__circle--busy {
  border-color: var(--semantics-content-accent-color);
}

.phase-rail__circle--done {
  border-color: var(--semantics-content-accent-color);
  background: var(--semantics-content-accent-color);
  color: var(--semantics-surfaces-base-background-color);
}

/* A phase with no forms yet (beheer) — deliberately visible, visibly unfillable. */
.phase-rail__circle--empty {
  border-style: dashed;
  border-color: var(--semantics-content-secondary-color);
  color: var(--semantics-content-secondary-color);
  background: var(--semantics-surfaces-base-background-color);
}

.phase-rail__icon {
  display: block;
  inline-size: 1.375rem;
  block-size: 1.375rem;
  background-color: currentColor;
}

.phase-rail__label {
  font-size: var(--primitives-font-size-70, 0.75rem);
  line-height: 1.3;
  font-weight: var(--primitives-font-weight-body-semi-bold);
  color: var(--semantics-content-accent-color);
  text-align: center;
  text-wrap: balance;
}

.phase-rail__count {
  font-size: var(--primitives-font-size-70, 0.75rem);
  color: var(--invulhulp-color-text-subtle);
}

/* ---- Vooraf-band ------------------------------------------------------ */

/* Platter dan .portal-card en zonder de blauwe kaartrand bovenaan: de band mag
   niet concurreren met de fasen eronder — hij gaat eraan vooraf. */
.prelude {
  margin-block-end: var(--primitives-space-40);
  /* Same inline padding as .portal-card, .bulk-ai en de toepassingsscan-tegel:
     alle koppen op deze pagina beginnen op dezelfde verticale lijn. */
  padding: var(--primitives-space-24) var(--primitives-space-32);
  background: var(--semantics-surfaces-base-background-color);
  border: 1px solid var(--semantics-dividers-color);
  border-radius: var(--primitives-corner-radius-md);
  /* Clear the sticky header when the fase rail scrolls here. */
  scroll-margin-block-start: calc(var(--invulhulp-header-height) + var(--primitives-space-24));
}

.prelude__header {
  display: flex;
  align-items: baseline;
  gap: var(--primitives-space-12);
  flex-wrap: wrap;
  margin-block-end: var(--primitives-space-12);
}

.prelude__title {
  color: var(--semantics-content-accent-color);
  margin: 0;
}

.prelude__meta {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
}

/* ---- Timeline --------------------------------------------------------- */

/* Vertical lifecycle timeline. The spine is drawn per phase (not once on the
   list) so it can stop cleanly at the last marker instead of trailing into the
   whitespace below the final card row. */
.track-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  --track-marker-size: 2.25rem;
  --track-gutter: 3.25rem;
}

.track-phase {
  position: relative;
  /* Clear the sticky header, or the fase rail scrolls a phase to right under it. */
  scroll-margin-block-start: calc(var(--invulhulp-header-height) + var(--primitives-space-24));
  padding-inline-start: var(--track-gutter);
  padding-block-end: var(--primitives-space-48);
}

.track-phase:last-child {
  padding-block-end: 0;
}

/* The connecting line: from just under this marker down to the next one. */
.track-phase::before {
  content: "";
  position: absolute;
  inset-block-start: var(--track-marker-size);
  inset-block-end: 0;
  inset-inline-start: calc(var(--track-marker-size) / 2 - 1px);
  inline-size: 2px;
  background: var(--track-line);
}

.track-phase:last-child::before {
  display: none;
}

.track-phase__marker {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  inline-size: var(--track-marker-size);
  block-size: var(--track-marker-size);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--primitives-font-size-90);
  font-weight: var(--primitives-font-weight-body-bold);
  box-sizing: border-box;
  background: var(--semantics-surfaces-base-background-color);
  color: var(--semantics-content-accent-color);
  border: 2px solid var(--track-line);
}

.track-phase__marker--todo {
  border-color: var(--track-line);
  color: var(--invulhulp-color-text-subtle);
}

.track-phase__marker--busy {
  border-color: var(--semantics-content-accent-color);
  color: var(--semantics-content-accent-color);
  box-shadow: inset 0 0 0 3px var(--semantics-surfaces-tinted-background-color);
}

.track-phase__marker--done {
  background: var(--semantics-content-accent-color);
  border-color: var(--semantics-content-accent-color);
  color: var(--semantics-surfaces-base-background-color);
}

/* A phase with no forms yet (beheer) — deliberately visible, visibly unfilled. */
.track-phase__marker--empty {
  border-style: dashed;
  border-color: var(--semantics-content-secondary-color);
  color: var(--semantics-content-secondary-color);
}

.track-phase__check {
  inline-size: 1rem;
  block-size: 1rem;
}

.track-eyebrow {
  margin: 0 0 var(--primitives-space-2);
  font-size: var(--primitives-font-size-70, 0.75rem);
  font-weight: var(--primitives-font-weight-body-semi-bold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--invulhulp-color-text-subtle);
}

.track-title-row {
  display: flex;
  align-items: baseline;
  gap: var(--primitives-space-12);
  flex-wrap: wrap;
}

.track-count {
  color: var(--invulhulp-color-text-subtle);
  white-space: nowrap;
}

.track-header {
  /* Reserve the marker's height so short headings still clear the spine. */
  min-block-size: var(--track-marker-size);
  margin-block-end: var(--primitives-space-16);
}

@media (max-width: 640px) {
  .track-timeline {
    --track-marker-size: 1.75rem;
    --track-gutter: 2.5rem;
  }
}

.track-title {
  color: var(--semantics-content-accent-color);
  margin: 0 0 var(--primitives-space-4);
}

.track-desc {
  color: var(--invulhulp-color-text-subtle);
  margin: 0;
}

.track-empty {
  color: var(--invulhulp-color-text-subtle);
  max-inline-size: 60ch;
  margin: 0;
  padding: var(--primitives-space-16);
  border: 1px dashed var(--semantics-content-secondary-color);
  border-radius: var(--primitives-corner-radius-md, 4px);
}

.card-row {
  display: flex;
  align-items: stretch;
  column-gap: 0;
  row-gap: var(--primitives-space-16);
  flex-wrap: wrap;
}

/* Connector + card as one unwrappable unit; each line stretches its own cards
   to equal height. */
.card-chain-item {
  display: flex;
  align-items: stretch;
}

.card-connector {
  display: flex;
  align-items: center;
  padding: 0 var(--primitives-space-8);
  color: var(--semantics-content-secondary-color);
  font-size: var(--primitives-font-size-100);
  flex-shrink: 0;
  align-self: center;
}

/* --- Niet van toepassing, per phase. Stock rvo-item-list rows; only the
   layout inside a row and the struck-through title are ours. --- */
.nvt-group {
  margin-block-start: var(--primitives-space-16);
  max-inline-size: 52rem;
}

.nvt-list {
  margin: 0;
}

.nvt-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--primitives-space-16);
}

.nvt-item__text {
  display: flex;
  flex-direction: column;
}

.nvt-item__title {
  font-weight: var(--primitives-font-weight-body-semi-bold);
  text-decoration: line-through;
  text-decoration-color: var(--semantics-content-secondary-color);
  color: var(--semantics-content-secondary-color);
}

.nvt-note {
  margin-block: var(--primitives-space-12) 0;
  max-inline-size: 68ch;
}

</style>
