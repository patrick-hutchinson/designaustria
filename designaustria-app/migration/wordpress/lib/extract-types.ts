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

/** A localized text: `de` is the document's own language, `en` comes from the Polylang partner (null = not translated). */
export interface Localized<T = string> {
  de: T | null
  en: T | null
}

export interface ExtractedEventPrice {
  kind: 'regular' | 'reduced' | 'members' | 'other'
  label: Localized
  amount: string | null
}

export interface ExtractedEvent {
  /** WordPress ID of the German post (of the English one for events that only exist in English) */
  legacyWpId: number
  title: Localized
  slug: Localized
  /** ISO timestamps in UTC */
  startsAt: string
  endsAt: string | null
  type: 'internal' | 'external'
  visibility: 'everywhere' | 'notOnHome' | 'hidden'
  /** WordPress term IDs (German terms) */
  categories: number[]
  venue: { name: Localized; street: string | null; zip: string | null; city: string | null; country: string | null }
  admission: { show: boolean; prices: ExtractedEventPrice[]; note: Localized }
  openingHours: { show: boolean; text: Localized }
  notes: Localized
  links: { url: string; label: string | null }[]
  badge: string | null
  /** Cleaned HTML (lib/wp-html.ts); the import converts it to Lexical. Inline images are `[[wp-image:<id>]]` paragraphs. */
  description: Localized
  legacy: {
    wpStatus: 'publish' | 'private'
    enWpId: number | null
    productWpId: number | null
    imageWpIds: number[]
    inlineImageWpIds: number[]
    documentWpIds: number[]
    rawPlace: string | null
    rawCosts: string | null
  }
}

/** A post (the news). */
export interface ExtractedPost {
  /** WordPress ID of the German post (of the English one for posts that only exist in English) */
  legacyWpId: number
  title: Localized
  slug: Localized
  /** ISO timestamp in UTC */
  publishedAt: string
  visibility: 'everywhere' | 'notOnHome' | 'hidden'
  /** WordPress term IDs (German terms) */
  categories: number[]
  tags: string[]
  badge: string | null
  excerpt: Localized
  /** Cleaned HTML (lib/wp-html.ts); the import converts it to Lexical. Inline images are `[[wp-image:<id>]]` paragraphs. */
  body: Localized
  legacy: {
    wpStatus: 'publish' | 'private'
    enWpId: number | null
    authorWpId: number | null
    thumbnailWpId: number | null
    imageWpIds: number[]
    inlineImageWpIds: number[]
    documentWpIds: number[]
  }
}

/** The `publicationDetails` block of a product (06-products-plan §3.1). */
export interface ExtractedPublicationDetails {
  blockType: 'publicationDetails'
  /** WordPress member post IDs, migrated members only */
  authors: number[]
  /** External authors and the names of member authors that aren't migrated */
  authorsText: string | null
  year: number | null
  publisher: string | null
  isbn: string | null
  pages: number | null
  format: string | null
}

/** A product (Payload `products`), for now made from a WordPress publication (06-products-plan). */
export interface ExtractedProduct {
  /** WordPress ID of the German post (of the English one for publications that only exist in English) */
  legacyWpId: number
  title: Localized
  subtitle: Localized
  slug: Localized
  /** ISO timestamp in UTC */
  publishedAt: string
  visibility: 'everywhere' | 'notOnHome' | 'hidden'
  /** WordPress term IDs (German terms), always including Publikationen or a subcategory */
  categories: number[]
  membersOnly: { content: boolean; documents: boolean }
  /** `WP-<WC product id>`, null = not for sale */
  shopSku: string | null
  /** Cleaned HTML (lib/wp-html.ts); the import converts it to Lexical. Inline images are `[[wp-image:<id>]]` paragraphs. */
  body: Localized
  /** Empty when the publication has none of the fields */
  details: ExtractedPublicationDetails[]
  legacy: {
    wpPostType: 'publication'
    wpStatus: 'publish' | 'private'
    enWpId: number | null
    wcProductWpId: number | null
    imageWpIds: number[]
    inlineImageWpIds: number[]
    documentWpIds: number[]
    /** All member authors in WordPress, including those not migrated */
    memberAuthorWpIds: number[]
  }
}

/** A shop product (Vendure Product with one ProductVariant), from a WC product (06-products-plan §3.2). */
export interface ExtractedShopProduct {
  /** WC product post ID */
  legacyWpId: number
  /** `WP-<legacyWpId>` */
  sku: string
  /** German name (soft hyphens removed); `en` only for English publications */
  name: Localized
  slug: string
  enabled: boolean
  /** Integer cents, incl. VAT */
  price: number
  /** Integer cents, incl. VAT; null = no member price */
  memberPrice: number | null
  /** Vendure tax category name */
  taxCategory: string
  /** false = unlimited stock */
  trackInventory: boolean
  stockOnHand: number
  /** Downloadable WC product (§4.6): its `_downloadable_files`, for the media step, and `_download_limit` (null = unlimited) */
  download: { files: { name: string | null; file: string }[]; limit: number | null } | null
  /** Payload products (legacyWpId) that show this shop product */
  productWpIds: number[]
}

/** An old URL that the pattern redirects don't cover (03-events-plan §4.7). Paths without trailing slash. */
export interface ExtractedRedirect {
  entity: 'event' | 'post' | 'product'
  legacyWpId: number
  locale: 'de' | 'en'
  /** e.g. /veranstaltung/old-slug, /neues/old-slug or /produkt/wc-slug */
  from: string
  /** e.g. /de/events/new-slug */
  to: string
  reason: 'old-slug' | 'slug-changed' | 'wc-product'
}

export const EXTRACT_FILES = {
  categories: 'categories.json',
  users: 'users.json',
  organizations: 'organizations.json',
  members: 'members.json',
  organizationMembers: 'organization-members.json',
  events: 'events.json',
  posts: 'posts.json',
  products: 'products.json',
  shopProducts: 'shop-products.json',
  redirects: 'redirects.json',
  report: '_report.json',
} as const
