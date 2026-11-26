import type { ExtractedContact } from '../../../lib/extract-types'

/** Contact fields shared by organizations and members. */
export const contactData = (record: ExtractedContact) => ({
  addresses: record.addresses,
  phones: record.phones,
  links: record.links,
  portfolio: record.portfolio,
  documents: record.documents,
})
