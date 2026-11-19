// Splits the WordPress multi-checkbox `da_member_status` into separate Payload fields (plan §3.2).

export type Tier = 'standard' | 'youngProfessional' | 'student' | 'retiree' | 'corporate' | 'education'
export type Honorary = 'member' | 'president'
export type MemberFunction = 'staff' | 'board'

export interface MemberStatus {
  tier: Tier | null
  honorary: Honorary | null
  functions: MemberFunction[]
  bildrecht: boolean
  newsletter: boolean
  /** Old value "active" (no longer an ACF choice, meaning unknown). */
  activeFlag: boolean
  warnings: string[]
}

const TIERS: Record<string, Tier> = {
  standard: 'standard',
  yp: 'youngProfessional',
  student: 'student',
  retiree: 'retiree',
  community: 'corporate',
  institute: 'education',
}

const OTHER_VALUES = new Set(['honorary', 'president', 'team', 'board', 'bildrecht', 'newsletter', 'active'])

/**
 * @param values  da_member_status values in WordPress order
 * @param hasOrganizationLink  whether the member is linked to an organisation (decides ties involving "community")
 */
export function splitMemberStatus(values: string[], { hasOrganizationLink }: { hasOrganizationLink: boolean }): MemberStatus {
  const warnings: string[] = []
  const set = new Set(values)

  for (const value of set) {
    if (!(value in TIERS) && !OTHER_VALUES.has(value)) warnings.push(`unknown status value "${value}" dropped`)
  }

  const tierValues = values.filter((value) => value in TIERS)
  let tier: Tier | null = null
  if (tierValues.length === 1) {
    tier = TIERS[tierValues[0]]
  } else if (tierValues.length > 1) {
    // Rule: a corporate contact (status "community" + linked to an organisation) wins; otherwise the first value.
    tier = set.has('community') && hasOrganizationLink ? 'corporate' : TIERS[tierValues[0]]
    warnings.push(`several tiers (${tierValues.join(', ')}), kept "${tier}"`)
  }

  const functions: MemberFunction[] = []
  if (set.has('team')) functions.push('staff')
  if (set.has('board')) functions.push('board')

  return {
    tier,
    honorary: set.has('president') ? 'president' : set.has('honorary') ? 'member' : null,
    functions,
    bildrecht: set.has('bildrecht'),
    newsletter: set.has('newsletter'),
    activeFlag: set.has('active'),
    warnings,
  }
}
