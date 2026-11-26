// Clean HTML (from wp-html.ts) → Lexical JSON for richText fields. Runs in the import, because the converter needs the
// sanitized Payload config (which editor features, and so which nodes, exist).

import { convertHTMLToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import { JSDOM } from 'jsdom'
import type { SanitizedConfig } from 'payload'

export type HtmlToLexical = (html: string | null | undefined) => ReturnType<typeof convertHTMLToLexical> | null

/** A converter for the default editor (`editor: lexicalEditor()` in payload.config.ts). */
export async function createHtmlToLexical(config: SanitizedConfig): Promise<HtmlToLexical> {
  const editorConfig = await editorConfigFactory.default({ config })
  return (html) => (html ? convertHTMLToLexical({ editorConfig, html, JSDOM }) : null)
}
