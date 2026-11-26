// WordPress post_content (Gutenberg or classic editor) → clean HTML that Payload's HTML → Lexical converter can read.
// Shared by all content types with a body (events, later news, pages, publications). The extract runs this; the
// import converts the result to Lexical (html-to-lexical.ts), because that needs the Payload config.
//
// - Gutenberg block comments are removed. Classic posts get WordPress's automatic paragraphs (wpautop).
// - Layout wrappers (columns, groups, figures, divs, spans) are flattened to their content.
// - Inline images become a placeholder paragraph `[[wp-image:<attachment id>]]` (+ the caption as a paragraph), which the
//   media step replaces with an upload node once the files are in Payload (03-events-plan §4.6).
// - Tables, buttons and videos are turned into paragraphs/links; product/newsletter blocks are dropped. All logged.

import { JSDOM } from 'jsdom'

export interface HtmlIssue {
  code: 'dropped-block' | 'flattened' | 'shortcode' | 'unresolved-image' | 'invalid-link'
  detail: string
}

export interface CleanHtml {
  /** null when nothing is left */
  html: string | null
  inlineImageWpIds: number[]
  issues: HtmlIssue[]
}

export interface CleanHtmlOptions {
  /** Attachment ID for an image URL (for classic images without a wp-image-<id> class). */
  attachmentIdForUrl?: (url: string) => number | null
}

export const imagePlaceholder = (id: number) => `[[wp-image:${id}]]`
export const IMAGE_PLACEHOLDER = /\[\[wp-image:(\d+)\]\]/g

const DROPPED_BLOCKS = ['acf/product', 'acf/newsletterform']
const BLOCK_TAGS = 'table|thead|tbody|tfoot|tr|td|th|div|p|ul|ol|li|h[1-6]|blockquote|figure|figcaption|hr|pre|section|video|iframe|form'
const BLOCK_START = new RegExp(`^<\\/?(?:${BLOCK_TAGS})[\\s/>]`, 'i')
/** Kept as they are; everything else is unwrapped (block wrappers) or turned into text. */
const KEEP_BLOCK = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE', 'HR'])
const INLINE = new Set(['A', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'SUB', 'SUP', 'CODE', 'BR', 'SPAN', 'SMALL', 'MARK'])
const KEEP_ATTRIBUTES: Record<string, string[]> = { A: ['href', 'target', 'rel'] }

/** WordPress's automatic paragraphs for classic-editor content: blank lines separate paragraphs, single newlines are <br>. */
export function wpautop(html: string): string {
  const spaced = html
    .replace(/\r\n?/g, '\n')
    .replace(new RegExp(`(<(?:${BLOCK_TAGS})[\\s/>])`, 'gi'), '\n\n$1')
    .replace(new RegExp(`(<\\/(?:${BLOCK_TAGS})>)`, 'gi'), '$1\n\n')
  return spaced
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      if (/^<p[\s>]/i.test(chunk)) return chunk.replace(/\n/g, '<br>\n')
      if (BLOCK_START.test(chunk)) return chunk
      return `<p>${chunk.replace(/\n/g, '<br>\n')}</p>`
    })
    .join('\n')
}

export function cleanWpHtml(raw: string | null | undefined, { attachmentIdForUrl }: CleanHtmlOptions = {}): CleanHtml {
  const issues: HtmlIssue[] = []
  const inlineImageWpIds: number[] = []
  if (!raw?.trim()) return { html: null, inlineImageWpIds, issues }

  const gutenberg = raw.includes('<!-- wp:')
  if (gutenberg) {
    for (const [, name] of raw.matchAll(/<!-- wp:([a-z0-9/-]+)/g)) {
      if (DROPPED_BLOCKS.includes(name)) issues.push({ code: 'dropped-block', detail: name })
    }
  }
  for (const [shortcode] of raw.matchAll(/\[[a-z][\w-]*(?:\s+[\w-]+=(?:"[^"]*"|'[^']*'|[^\s\]]+))+\s*\/?\]/g)) {
    issues.push({ code: 'shortcode', detail: shortcode })
  }

  const { document, Node } = new JSDOM(`<body>${gutenberg ? raw : wpautop(raw)}</body>`).window
  const body = document.body
  const el = (tag: string, text?: string) => {
    const node = document.createElement(tag)
    if (text !== undefined) node.textContent = text
    return node
  }
  const textOf = (node: Element) => (node.textContent ?? '').replace(/\s+/g, ' ').trim()

  // Comments (Gutenberg block markers, <!--more-->)
  const walker = document.createTreeWalker(body, 128 /* NodeFilter.SHOW_COMMENT */)
  const comments: Node[] = []
  while (walker.nextNode()) comments.push(walker.currentNode)
  comments.forEach((comment) => comment.parentNode?.removeChild(comment))

  // Images → placeholder paragraph (+ caption), at the place of their figure or paragraph
  for (const img of [...body.querySelectorAll('img')]) {
    const src = img.getAttribute('src') ?? ''
    const id = Number(/\bwp-image-(\d+)\b/.exec(img.getAttribute('class') ?? '')?.[1]) || (src ? attachmentIdForUrl?.(src) : null) || null
    const figure = img.closest('figure')
    const caption = figure?.querySelector('figcaption')
    const replacement = id ? [el('p', imagePlaceholder(id))] : []
    if (caption && textOf(caption)) replacement.push(el('p', textOf(caption)))
    if (id) inlineImageWpIds.push(id)
    else issues.push({ code: 'unresolved-image', detail: src || '(no src)' })

    // The block to replace: the image's own figure, or its paragraph/link if that holds nothing else.
    let target: Element = img
    if (figure && !figure.querySelector('figure')) target = figure
    else {
      for (let parent = img.parentElement; parent && parent !== body; parent = parent.parentElement) {
        if (textOf(parent) !== '' || parent.querySelectorAll('img').length > 1) break
        target = parent
      }
    }
    if (target === img && img.closest('p, li, h1, h2, h3, h4, h5, h6')) {
      // Inside a paragraph with text: the placeholder goes right after that paragraph.
      const block = img.closest('p, li, h1, h2, h3, h4, h5, h6')!
      block.after(...replacement)
      img.remove()
    } else {
      target.replaceWith(...replacement)
    }
  }

  // Tables → one paragraph per row, cells separated by " | "
  for (const table of [...body.querySelectorAll('table')]) {
    issues.push({ code: 'flattened', detail: 'table' })
    const rows = [...table.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('td, th')].map(textOf).filter(Boolean).join(' | '))
    table.replaceWith(...rows.filter(Boolean).map((row) => el('p', row)))
  }
  // Videos → link to the file
  for (const video of [...body.querySelectorAll('video')]) {
    issues.push({ code: 'flattened', detail: 'video' })
    const src = video.getAttribute('src') ?? video.querySelector('source')?.getAttribute('src')
    if (!src) {
      video.remove()
      continue
    }
    const link = el('a', src)
    link.setAttribute('href', src)
    const p = el('p')
    p.append(link)
    ;(video.closest('figure') ?? video).replaceWith(p)
  }
  if (body.querySelector('.wp-block-buttons, .wp-block-button')) issues.push({ code: 'flattened', detail: 'buttons' })
  body.querySelectorAll('iframe, script, style, form, input, button, noscript').forEach((node) => node.remove())

  // Links: fix the mangled forms editors left ("mailto: x", "http:/x", spaces), drop the ones that aren't URLs (text kept).
  for (const link of [...body.querySelectorAll('a')]) {
    const raw = link.getAttribute('href') ?? ''
    const href = raw
      .trim()
      .replace(/^(mailto|tel):\s+/i, '$1:')
      .replace(/^(https?):\/(?!\/)/i, '$1://')
      .replace(/^(https?:\/\/)\s+/i, '$1')
    if (!href || /\s/.test(href) || href === '#') {
      if (raw.trim() && raw.trim() !== '#') issues.push({ code: 'invalid-link', detail: raw })
      link.replaceWith(...link.childNodes)
    } else link.setAttribute('href', href)
  }

  // Unwrap layout elements, strip attributes, and collapse whitespace (incl. &nbsp;) to single spaces.
  const flatten = (parent: Element) => {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        child.textContent = (child.textContent ?? '').replace(/\s+/g, ' ') // HTML whitespace rules (\s includes &nbsp;); Lexical would keep every space
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove()
        continue
      }
      const node = child as Element
      flatten(node)
      const keep = KEEP_BLOCK.has(node.tagName) || node.tagName === 'LI' || (INLINE.has(node.tagName) && node.tagName !== 'SPAN')
      if (!keep) {
        node.replaceWith(...node.childNodes)
        continue
      }
      for (const { name } of [...node.attributes]) {
        if (!KEEP_ATTRIBUTES[node.tagName]?.includes(name)) node.removeAttribute(name)
      }
    }
  }
  flatten(body)

  // Top level: blocks only. Runs of inline content (from unwrapped divs/figures) become paragraphs.
  const blocks: Element[] = []
  let run: Node[] = []
  const endRun = () => {
    const meaningful = run.some((node) => (node.nodeType === Node.TEXT_NODE ? node.textContent?.trim() : (node as Element).tagName !== 'BR'))
    if (meaningful) {
      const p = el('p')
      p.append(...run)
      blocks.push(p)
    }
    run = []
  }
  const rebuiltLists = new Set<Element>()
  for (const node of [...body.childNodes]) {
    const tag = node.nodeType === Node.ELEMENT_NODE ? (node as Element).tagName : null
    if (tag && KEEP_BLOCK.has(tag)) {
      endRun()
      blocks.push(node as Element)
    } else if (tag === 'LI') {
      // A list item whose list was a wrapper we removed: give it a list again (consecutive items share one).
      endRun()
      let list = blocks[blocks.length - 1]
      if (!rebuiltLists.has(list)) {
        list = el('ul')
        rebuiltLists.add(list)
        blocks.push(list)
      }
      list.append(node)
    } else run.push(node)
  }
  endRun()

  // Drop empty blocks (<p></p>, <p><br></p>, <p> </p>) and trailing <br>s.
  const html = blocks
    .filter((block) => block.tagName === 'HR' || textOf(block) !== '')
    .map((block) => {
      const isBlank = (node: ChildNode | null) =>
        node?.nodeName === 'BR' || (node?.nodeType === Node.TEXT_NODE && !node.textContent?.trim())
      while (isBlank(block.lastChild)) block.lastChild!.remove()
      while (isBlank(block.firstChild)) block.firstChild!.remove()
      if (block.firstChild?.nodeType === Node.TEXT_NODE) block.firstChild.textContent = block.firstChild.textContent!.trimStart()
      if (block.lastChild?.nodeType === Node.TEXT_NODE) block.lastChild.textContent = block.lastChild.textContent!.trimEnd()
      // Whitespace between list items
      if (block.tagName === 'UL' || block.tagName === 'OL') {
        ;[...block.childNodes].forEach((node) => node.nodeType === Node.TEXT_NODE && !node.textContent?.trim() && node.remove())
      }
      return block.outerHTML
    })
    .join('\n')

  return { html: html || null, inlineImageWpIds: [...new Set(inlineImageWpIds)], issues }
}
