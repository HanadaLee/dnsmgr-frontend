import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { isAxisNowRuleSubmitDisabled } from '@/lib/axisnow-rule-form'

const ready = {
  editing: false,
  saving: false,
  canSubmit: true,
  automationPending: false,
  automationLoaded: false,
  automationHasError: false,
}

describe('AxisNow rule submission', () => {
  it.each([
    { recordType: 'A', poolType: 'all_valid_eips', values: [] },
    { recordType: 'CNAME', poolType: 'domain', values: ['common.overseas.edge.cgslb.net', 'dsada.com'] },
  ])('allows new $recordType rules while the automation query is disabled', ({ recordType, poolType, values }) => {
    const client = new QueryClient()
    const queryFn = vi.fn(async () => ({ configured: false }))
    const observer = new QueryObserver(client, {
      queryKey: ['axisnow-rule-automation', recordType, undefined],
      queryFn,
      enabled: false,
    })
    const automation = observer.getCurrentResult()

    expect(automation.isPending).toBe(true)
    expect(automation.isFetching).toBe(false)
    expect(queryFn).not.toHaveBeenCalled()
    expect(isAxisNowRuleSubmitDisabled({
      ...ready,
      canSubmit: poolType === 'all_valid_eips' || values.length > 0,
      automationPending: automation.isPending,
      automationLoaded: Boolean(automation.data),
    })).toBe(false)
    client.clear()
  })

  it('waits for existing automation settings when editing', () => {
    expect(isAxisNowRuleSubmitDisabled({ ...ready, editing: true, automationPending: true })).toBe(true)
    expect(isAxisNowRuleSubmitDisabled({ ...ready, editing: true })).toBe(true)
  })

  it('allows edits once automation settings are loaded, even if not configured', () => {
    expect(isAxisNowRuleSubmitDisabled({ ...ready, editing: true, automationLoaded: true })).toBe(false)
  })

  it.each([
    { saving: true },
    { canSubmit: false },
    { automationHasError: true },
  ])('still blocks invalid or pending submissions: %j', (state) => {
    expect(isAxisNowRuleSubmitDisabled({ ...ready, ...state })).toBe(true)
    expect(isAxisNowRuleSubmitDisabled({ ...ready, editing: true, automationLoaded: true, ...state })).toBe(true)
  })
})
