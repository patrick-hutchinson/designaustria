// Shape of the JSON written by scripts/extract and read by scripts/import (.data/wp-extract/*.json).
// Field names match the Payload collections. Relationship fields hold **WordPress IDs**;
// the import translates them to Payload IDs through `legacyWpId`.

export type Visibility = 'public' | 'private'
export type ProfileStatus = 'publish' | 'pending' | 'draft' | 'private'

export interface ExtractedCategory {
  legacyWpId: number
  title: { de: string; en: string | null }
  slug: string | null
  /** WordPress term ID of the parent category */
  parent: number | null
}

export interface ExtractedUser {
  legacyWpId: number
  email: string
  roles: ('admin' | 'member')[]
  legacyPasswordHash: string | null
}

export interface ExtractedAddress {
  type: 'office' | 'private' | null
  visibility: Visibility
  street: string | null
  number: string | null
  zip: string | null
  city: string | null
  country: string | null
}

export interface ExtractedPhone {
  type: 'office' | 'mobile' | 'fax' | null
  number: string | null
  visibility: Visibility
}

export interface ExtractedLink {
  type: 'web' | 'instagram' | 'facebook' | 'behance' | 'linkedin' | 'x' | 'xing' | 'blog' | null
  url: string
}

export interface ExtractedPortfolioItem {
  name: string | null
  visibility: Visibility
  imageWpIds: number[]
}

export interface ExtractedDocument {
  type: 'dissertation' | 'thesis' | 'paper' | 'publication' | 'book' | 'misc' | null
  name: string | null
  fileWpId: number | null
}

export interface ExtractedContact {
  addresses: ExtractedAddress[]
  phones: ExtractedPhone[]
  links: ExtractedLink[]
  portfolio: ExtractedPortfolioItem[]
  documents: ExtractedDocument[]
}

export interface ExtractedOrganization extends ExtractedContact {
  legacyWpId: number
  name: string
  slug: string | null
  profileStatus: ProfileStatus
  memberNumber: string | null
  partnerStatus: ('partner' | 'premium' | 'education')[]
  about: string | null
  /** WordPress term IDs */
  categories: number[]
  legacy: { createdAt: string | null; logoWpId: number | null }
}

export interface ExtractedMember extends ExtractedContact {
  legacyWpId: number
  /** WordPress user ID */
  user: number | null
  slug: string | null
  profileStatus: ProfileStatus
  salutation: 'd' | 'f' | 'm' | 'i' | null
  title: string | null
  firstName: string | null
  lastName: string | null
  birthdate: string | null
  deathYear: number | null
  contactEmail: string | null
  contactEmailPublic: boolean
  companyName: string | null
  jobTitle: string | null
  employmentType: 'employed' | 'selfEmployed' | null
  about: string | null
  motto: string | null
  education: string | null
  additionalQualification: string | null
  otherFocus: string | null
  keywords: string | null
  /** WordPress term IDs */
  categories: number[]
  memberNumber: string | null
  tier: 'standard' | 'youngProfessional' | 'student' | 'retiree' | 'corporate' | 'education' | null
  honorary: 'member' | 'president' | null
  functions: ('staff' | 'board')[]
  boardTerms: string[]
  bildrecht: boolean
  newsletter: boolean
  billing: {
    paymentType: 'sepa' | null
    paymentFrequency: 'yearly' | 'quarterly' | null
    iban: string | null
    feeOverride: number | null
    feeNote: string | null
  }
  legacy: {
    createdAt: string | null
    displayOptIns: ('email' | 'frontpage')[]
    motivation: string | null
    activeFlag: boolean
    mergedFromWpIds: number[]
    avatarWpId: number | null
    studentProofWpId: number | null
  }
}

export interface ExtractedOrganizationMember {
  /** "<memberWpId>:<organizationWpId>" */
  legacyKey: string
  /** WordPress community post ID */
  organization: number
  /** WordPress member post ID (after merges) */
  member: number
  role: 'member' | 'admin'
}

export const EXTRACT_FILES = {
  categories: 'categories.json',
  users: 'users.json',
  organizations: 'organizations.json',
  members: 'members.json',
  organizationMembers: 'organization-members.json',
  report: '_report.json',
} as const
