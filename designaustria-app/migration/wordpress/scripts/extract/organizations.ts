// Organisations: CPT `community`.

import type { ExtractedOrganization } from '../../lib/extract-types'
import { parseId, parseIdList, parseStringList } from '../../lib/ids'
import { cleanText, mapPartnerStatus, mapProfileStatus, memberNumber, wpPostDate } from '../../lib/mappers'
import type { PostWithMeta } from '../../lib/mysql'
import type { Report } from '../../lib/report'
import { extractContact } from './contact'

export function extractOrganizations(posts: PostWithMeta[], report: Report): ExtractedOrganization[] {
  const organizations: ExtractedOrganization[] = []
  for (const { post, meta } of posts) {
    const ref = `organization ${post.ID}`
    const profileStatus = mapProfileStatus(post.post_status).value
    if (!profileStatus) {
      report.warn('organization.skipped-status', ref, `post_status "${post.post_status}" is not migrated`)
      continue
    }

    let name = cleanText(meta.da_community_name) ?? cleanText(post.post_title)
    if (!name) {
      name = `Organisation ${post.ID}`
      report.warn('organization.no-name', ref, `no name; using "${name}"`)
    }

    const partnerStatus = parseStringList(meta.da_community_status).flatMap((value) => {
      if (value === 'active') return [] // legacy value, meaning unknown (also on members), not a partner level
      const mapped = report.mapped(ref, mapPartnerStatus(value))
      return mapped ? [mapped] : []
    })

    organizations.push({
      legacyWpId: post.ID,
      name,
      slug: post.post_name || null,
      profileStatus,
      memberNumber: memberNumber(meta.da_community_id),
      partnerStatus,
      about: cleanText(meta.da_community_about),
      categories: parseIdList(meta.da_category),
      ...extractContact(meta, ref, report),
      legacy: {
        createdAt: wpPostDate(post.post_date_gmt, post.post_date),
        logoWpId: parseId(meta.da_community_logo),
      },
    })
  }
  return organizations
}
