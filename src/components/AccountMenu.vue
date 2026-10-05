<template>
  <!-- One account menu for both headers: under the menu-bar item on the dossier
       list, in the account button's popup slot inside a dossier. -->
  <nldd-menu accessible-label="Accountmenu">
    <!-- Op smalle schermen staat alleen het icoon in de balk; de kop laat dan
         alsnog zien met welk account je bent ingelogd. -->
    <nldd-container slot="header" padding-inline="16" padding-block="12">
      <nldd-identity :text="userLabel" :supporting-text="userSupportingText">
        <nldd-avatar
          slot="avatars"
          :name="userLabel"
          :initials="initials(userLabel)"
          decorative
        />
      </nldd-identity>
    </nldd-container>
    <nldd-menu-item
      v-if="auth.isAdmin"
      text="Gebruikersbeheer"
      icon="gear"
      @select="auth.userManagementOpen = true"
    />
    <nldd-menu-item
      text="Uitloggen"
      icon="arrow-right-out-bucket"
      @select="auth.logout()"
    />
  </nldd-menu>
</template>

<script setup lang="ts">
import { useAuthStore } from '../stores/authStore'
import { useAccountLabels } from '../composables/useAccountLabels'
import { initials } from '../utils/initials'

const auth = useAuthStore()
const { userLabel, userSupportingText } = useAccountLabels()
</script>
