// Repeaters shared by members and communities: da_address, da_number, da_online, da_portfolio, da_documents.

import type { ExtractedContact } from '../../lib/extract-types'
import { parseId, parseIdList } from '../../lib/ids'
import {
  cleanText,
  mapAddressType,
  mapDocumentType,
  mapLinkType,
  mapPhoneType,
  mapVisibility,
  normalizeCountry,
  normalizeUrl,
} from '../../lib/mappers'
import { isEmptyRow, readRepeater, type Meta } from '../../lib/repeater'
import type { Report } from '../../lib/report'

export function extractContact(meta: Meta, ref: string, report: Report): ExtractedContact {
  const addresses = readRepeater(meta, 'da_address')
    .filter((row) => !isEmptyRow({ ...row, da_address_show: '', da_address_type: '' }))
    .map((row) => ({
      type: report.mapped(ref, mapAddressType(row.da_address_type)),
      // ACF had no default: an unanswered "show" is treated as not public.
      visibility: report.mapped(ref, mapVisibility(row.da_address_show)) ?? 'private',
      street: cleanText(row.da_address_street),
      number: cleanText(row.da_address_number),
      zip: cleanText(row.da_address_zip),
      city: cleanText(row.da_address_place),
      country: report.mapped(ref, normalizeCountry(row.da_address_country)),
    }))

  const phones = readRepeater(meta, 'da_number')
    .map((row) => ({
      type: report.mapped(ref, mapPhoneType(row.da_number_type)),
      number: cleanText(row.da_number_number),
      visibility: report.mapped(ref, mapVisibility(row.da_number_show)) ?? 'private',
    }))
    .filter((phone) => phone.number)

  const links = readRepeater(meta, 'da_online').flatMap((row) => {
    const url = report.mapped(ref, normalizeUrl(row.da_online_link))
    if (!url) return []
    return [{ type: report.mapped(ref, mapLinkType(row.da_online_type)), url }]
  })

  const portfolio = readRepeater(meta, 'da_portfolio')
    .map((row) => ({
      name: cleanText(row.da_portfolio_name),
      // ACF default for this field was the first choice, "public".
      visibility: report.mapped(ref, mapVisibility(row.da_portfolio_show)) ?? 'public',
      imageWpIds: parseIdList(row.da_portfolio_gallery),
    }))
    .filter((item) => item.name || item.imageWpIds.length)

  const documents = readRepeater(meta, 'da_documents')
    .map((row) => ({
      type: report.mapped(ref, mapDocumentType(row.da_document_type)),
      name: cleanText(row.da_document_name),
      fileWpId: parseId(row.da_document),
    }))
    .filter((doc) => doc.name || doc.fileWpId)

  return { addresses, phones, links, portfolio, documents }
}
