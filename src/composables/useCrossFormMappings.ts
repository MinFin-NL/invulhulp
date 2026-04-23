import { ref } from 'vue'
import { loadCrossFormMappings } from '../services/formLoader'
import type { CrossFormMapping } from '../models/Assessment'

const _mappings = ref<CrossFormMapping[]>([])
let _loaded = false

export function useCrossFormMappings() {
  if (!_loaded) {
    _loaded = true
    loadCrossFormMappings().then((m) => {
      _mappings.value = m
    })
  }
  return _mappings
}
