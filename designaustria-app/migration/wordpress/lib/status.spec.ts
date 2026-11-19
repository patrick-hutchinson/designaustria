import { describe, expect, it } from 'vitest'

import { splitMemberStatus } from './status'

const split = (values: string[], hasOrganizationLink = false) => splitMemberStatus(values, { hasOrganizationLink })

describe('splitMemberStatus', () => {
  it('maps each tier', () => {
    expect(split(['standard']).tier).toBe('standard')
    expect(split(['yp']).tier).toBe('youngProfessional')
    expect(split(['student']).tier).toBe('student')
    expect(split(['retiree']).tier).toBe('retiree')
    expect(split(['community']).tier).toBe('corporate')
    expect(split(['institute']).tier).toBe('education')
  })

  it('separates add-ons, roles and flags from the tier', () => {
    expect(split(['standard', 'bildrecht'])).toMatchObject({ tier: 'standard', bildrecht: true, newsletter: false, warnings: [] })
    expect(split(['newsletter'])).toMatchObject({ tier: null, newsletter: true })
    expect(split(['community', 'board', 'bildrecht'])).toMatchObject({ tier: 'corporate', functions: ['board'], bildrecht: true })
    expect(split(['team'])).toMatchObject({ tier: null, functions: ['staff'] })
  })

  it('maps honorary and honorary president', () => {
    expect(split(['retiree', 'honorary']).honorary).toBe('member')
    expect(split(['honorary', 'president']).honorary).toBe('president')
    expect(split(['standard']).honorary).toBeNull()
  })

  it('keeps the old "active" value as a flag only', () => {
    expect(split(['active', 'newsletter', 'retiree'])).toMatchObject({ tier: 'retiree', activeFlag: true, newsletter: true, warnings: [] })
  })

  it('resolves two tiers: corporate wins when linked to an organisation', () => {
    const linked = split(['standard', 'community'], true)
    expect(linked.tier).toBe('corporate')
    expect(linked.warnings).toHaveLength(1)

    const notLinked = split(['standard', 'community'], false)
    expect(notLinked.tier).toBe('standard')
    expect(notLinked.warnings[0]).toMatch(/several tiers/)
  })

  it('reports unknown values', () => {
    const result = split(['standard', 'vip'])
    expect(result.tier).toBe('standard')
    expect(result.warnings).toEqual(['unknown status value "vip" dropped'])
  })

  it('handles no status', () => {
    expect(split([])).toEqual({
      tier: null,
      honorary: null,
      functions: [],
      bildrecht: false,
      newsletter: false,
      activeFlag: false,
      warnings: [],
    })
  })
})
