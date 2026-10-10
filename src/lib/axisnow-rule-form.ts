export function isAxisNowRuleSubmitDisabled(state: {
  editing: boolean
  saving: boolean
  canSubmit: boolean
  automationPending: boolean
  automationLoaded: boolean
  automationHasError: boolean
}) {
  // A disabled query is still pending when no data exists. Only edits need it.
  return state.saving || !state.canSubmit || state.automationHasError
    || (state.editing && (state.automationPending || !state.automationLoaded))
}
