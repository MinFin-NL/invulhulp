/**
 * Verdiepingsgesprek prototype (docs/interviewmodus-socratisch-gesprek.md
 * §5.1): the "Wat kan helpen" panel, "Laat AI meekijken" and the "alleen open
 * vragen" filter. Off unless VITE_GAP_PROTOTYPE=true — its eval gate
 * (eval_prompts.py gap) has not passed yet.
 */
export const GAP_PROTOTYPE = import.meta.env.VITE_GAP_PROTOTYPE === 'true'
