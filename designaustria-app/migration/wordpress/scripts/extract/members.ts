// Member profiles (CPT `member`) and their organisation links (ACF da_member_community / _admin).

import type { ExtractedMember, ExtractedOrganizationMember } from '../../lib/extract-types'
import { parseId, parseIdList, parseStringList } from '../../lib/ids'
import {
  cleanText,
  mapDisplayOptIn,
  mapEmploymentType,
  mapPaymentFrequency,
  mapPaymentType,
  mapProfileStatus,
  mapSalutation,
  memberNumber,
  parseBool,
  parseDate,
  parseNumber,
  parseYear,
  wpPostDate,
} from '../../lib/mappers'
import { applyMerges, type MergeConfig } from '../../lib/merges'
import type { PostWithMeta } from '../../lib/mysql'
import type { Report } from '../../lib/report'
import { splitMemberStatus } from '../../lib/status'
import { extractContact } from './contact'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface RawLink {
  member: number
  organization: number
  admin: boolean
}

export function extractMembers(
  posts: PostWithMeta[],
  { organizationIds, userIds, merges }: { organizationIds: Set<number>; userIds: Set<number>; merges: MergeConfig },
  report: Report,
): { members: ExtractedMember[]; organizationMembers: ExtractedOrganizationMember[]; mergeWarnings: string[] } {
  // 1. Organisation links, read before the members because the tier rule depends on them.
  const rawLinks: RawLink[] = []
  for (const { post, meta } of posts) {
    const memberOf = parseIdList(meta.da_member_community)
    const adminOf = parseIdList(meta.da_member_community_admin)
    for (const organization of new Set([...memberOf, ...adminOf])) {
      if (!organizationIds.has(organization)) {
        report.warn('link.missing-organization', `member ${post.ID}`, `linked to organisation ${organization}, which isn't migrated; link dropped`)
        continue
      }
      rawLinks.push({ member: post.ID, organization, admin: adminOf.includes(organization) })
    }
  }
  const linkedMembers = new Set(rawLinks.map((link) => link.member))

  // 2. Profiles
  const members: ExtractedMember[] = []
  for (const { post, meta } of posts) {
    const ref = `member ${post.ID}`
    const profileStatus = mapProfileStatus(post.post_status).value
    if (!profileStatus) {
      report.warn('member.skipped-status', ref, `post_status "${post.post_status}" is not migrated`)
      continue
    }

    let user = parseId(meta.da_member_user)
    if (user && !userIds.has(user)) {
      report.warn('member.dangling-user', ref, `linked to user ${user}, which doesn't exist; link dropped`)
      user = null
    }

    let contactEmail = cleanText(meta.da_member_email)?.toLowerCase() ?? null
    if (contactEmail && !EMAIL.test(contactEmail)) {
      report.warn('member.invalid-email', ref, `invalid contact email "${contactEmail}"; dropped`)
      contactEmail = null
    }

    const status = splitMemberStatus(parseStringList(meta.da_member_status), { hasOrganizationLink: linkedMembers.has(post.ID) })
    status.warnings.forEach((warning) => report.warn('member.status', ref, warning))

    const firstName = cleanText(meta.da_member_firstname)
    const lastName = cleanText(meta.da_member_lastname)
    if (!firstName && !lastName) report.warn('member.no-name', ref, 'no first or last name')

    members.push({
      legacyWpId: post.ID,
      user,
      slug: post.post_name || null,
      profileStatus,
      salutation: report.mapped(ref, mapSalutation(meta.da_member_gender)),
      title: cleanText(meta.da_member_title),
      firstName,
      lastName,
      birthdate: report.mapped(ref, parseDate(meta.da_member_birthdate)),
      deathYear: report.mapped(ref, parseYear(meta.da_member_deathyear)),
      contactEmail,
      contactEmailPublic: parseBool(meta.da_member_email_public),
      companyName: cleanText(meta.da_member_identity),
      jobTitle: cleanText(meta.da_member_job),
      employmentType: report.mapped(ref, mapEmploymentType(meta.da_member_job_type)),
      about: cleanText(meta.da_member_about),
      motto: cleanText(meta.da_member_motto),
      education: cleanText(meta.da_member_education),
      additionalQualification: cleanText(meta.da_member_addition),
      otherFocus: cleanText(meta.da_member_owncat),
      keywords: cleanText(meta.da_member_keywords),
      categories: parseIdList(meta.da_category),
      memberNumber: memberNumber(meta.da_member_id),
      tier: status.tier,
      honorary: status.honorary,
      functions: status.functions,
      boardTerms: parseStringList(meta.da_member_board),
      bildrecht: status.bildrecht,
      newsletter: status.newsletter,
      billing: {
        paymentType: report.mapped(ref, mapPaymentType(meta.da_member_payment_type)),
        paymentFrequency: report.mapped(ref, mapPaymentFrequency(meta.da_member_payment_frequency)),
        iban: cleanText(meta.da_member_iban)?.replace(/\s+/g, '') ?? null,
        feeOverride: parseNumber(meta.da_member_fee),
        feeNote: cleanText(meta.da_member_fee_description),
      },
      ...extractContact(meta, ref, report),
      legacy: {
        createdAt: wpPostDate(post.post_date_gmt, post.post_date),
        displayOptIns: parseStringList(meta.da_member_display).flatMap((value) => {
          const mapped = report.mapped(ref, mapDisplayOptIn(value))
          return mapped ? [mapped] : []
        }),
        motivation: parseStringList(meta.da_member_motivation).join(', ') || null,
        activeFlag: status.activeFlag,
        mergedFromWpIds: [],
        avatarWpId: parseId(meta.da_member_avatar),
        studentProofWpId: parseId(meta.da_member_cert),
      },
    })
  }

  // 3. Duplicates (config/merges.json)
  const merged = applyMerges(members, merges)
  const keptIds = new Set(merged.records.map((member) => member.legacyWpId))
  const mergedInto = new Map<number, number>()
  for (const member of merged.records) member.legacy.mergedFromWpIds.forEach((id) => mergedInto.set(id, member.legacyWpId))

  // 4. Links on merged-away profiles move to the kept profile; admin wins when a pair occurs twice.
  const pairs = new Map<string, ExtractedOrganizationMember>()
  for (const link of rawLinks) {
    const member = mergedInto.get(link.member) ?? link.member
    if (!keptIds.has(member)) continue // profile not migrated (status)
    const legacyKey = `${member}:${link.organization}`
    const existing = pairs.get(legacyKey)
    pairs.set(legacyKey, {
      legacyKey,
      organization: link.organization,
      member,
      role: link.admin || existing?.role === 'admin' ? 'admin' : 'member',
    })
  }
  const organizationMembers = [...pairs.values()].sort((a, b) => a.member - b.member || a.organization - b.organization)

  return {
    members: merged.records.sort((a, b) => a.legacyWpId - b.legacyWpId),
    organizationMembers,
    mergeWarnings: merged.warnings,
  }
}
