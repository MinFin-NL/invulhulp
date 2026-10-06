import { ref } from 'vue'
import { getCachedForm, loadFormRegistry } from '../services/formLoader'

// The short names from index.json ("Intakeformulier"), for naming a form in a
// sentence; a form's own title is the long one ("Intakeformulier nieuwe
// IV-verzoeken"). Module-level, like the mappings: index.json is not cached, and
// every question can ask for a title.
const titles = ref(new Map<string, string>())
let loading: Promise<void> | null = null

/** Returns `title(formId)`: the short name once the registry is in, the form's
 *  own title or its id until then. Reactive, so a computed using it updates. */
export function useFormTitles(): (formId: string) => string {
  if (!loading) {
    loading = loadFormRegistry()
      .then((forms) => {
        titles.value = new Map(forms.map((f) => [f.id, f.title]))
      })
      .catch(() => {
        loading = null // try again on the next caller
      })
  }
  return (formId) => titles.value.get(formId) ?? getCachedForm(formId)?.title ?? formId
}
