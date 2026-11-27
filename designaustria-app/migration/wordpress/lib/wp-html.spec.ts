import { describe, expect, it } from 'vitest'

import { cleanWpHtml, wpautop } from './wp-html'

describe('wpautop', () => {
  it('turns blank lines into paragraphs and single newlines into <br>', () => {
    expect(wpautop('Eins\nzwei\n\nDrei')).toBe('<p>Eins<br>\nzwei</p>\n<p>Drei</p>')
  })
  it('leaves existing blocks alone', () => {
    expect(wpautop('<p>A</p>\n<ul>\n<li>x</li>\n</ul>\nB')).toBe('<p>A</p>\n<ul>\n<li>x</li>\n</ul>\n<p>B</p>')
  })
})

describe('cleanWpHtml', () => {
  it('removes Gutenberg comments, empty paragraphs and attributes', () => {
    const raw = `<!-- wp:paragraph -->\n<p class="x"><strong>Die&nbsp;Ausstellung</strong></p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p><br></p>\n<!-- /wp:paragraph -->\n<!-- wp:spacer -->\n<div style="height:50px" class="wp-block-spacer"></div>\n<!-- /wp:spacer -->`
    expect(cleanWpHtml(raw).html).toBe('<p><strong>Die Ausstellung</strong></p>')
  })

  it('applies wpautop to classic content only', () => {
    expect(cleanWpHtml('Erster Absatz\n\nZweiter &amp; letzter').html).toBe('<p>Erster Absatz</p>\n<p>Zweiter &amp; letzter</p>')
  })

  it('keeps links, headings, lists and separators', () => {
    const raw = '<h2>Titel</h2><p>Mehr <a href="https://x.at" class="y" target="_blank">hier</a></p><hr class="wp-block-separator"/><ul><li>a</li></ul>'
    expect(cleanWpHtml(raw).html).toBe('<h2>Titel</h2>\n<p>Mehr <a href="https://x.at" target="_blank">hier</a></p>\n<hr>\n<ul><li>a</li></ul>')
  })

  it('replaces Gutenberg images and galleries with placeholders, in place, with captions', () => {
    const raw = `<!-- wp:paragraph --><p>Vorher</p><!-- /wp:paragraph -->
<!-- wp:gallery --><figure class="wp-block-gallery"><!-- wp:image {"id":41516} --><figure class="wp-block-image"><img src="a.png" class="wp-image-41516"/></figure><!-- /wp:image -->
<!-- wp:image {"id":41521} --><figure class="wp-block-image"><img src="b.png" class="wp-image-41521"/><figcaption>Logo B</figcaption></figure><!-- /wp:image --></figure><!-- /wp:gallery -->
<!-- wp:paragraph --><p>Nachher</p><!-- /wp:paragraph -->`
    const result = cleanWpHtml(raw)
    expect(result.html).toBe('<p>Vorher</p>\n<p>[[wp-image:41516]]</p>\n<p>[[wp-image:41521]]</p>\n<p>Logo B</p>\n<p>Nachher</p>')
    expect(result.inlineImageWpIds).toEqual([41516, 41521])
  })

  it('resolves classic images by URL and moves an image out of a paragraph with text', () => {
    const lookup = (url: string) => (url.endsWith('Lindinger_web-1.jpeg') ? 42 : null)
    const result = cleanWpHtml('<p>Text <img src="https://www.designaustria.at/wp-content/uploads/Lindinger_web-1.jpeg" alt=""> mehr</p>', {
      attachmentIdForUrl: lookup,
    })
    expect(result.html).toBe('<p>Text  mehr</p>\n<p>[[wp-image:42]]</p>')
  })

  it('drops unresolvable images and reports them', () => {
    const result = cleanWpHtml('<p><img src="/system/assets/5585/original/logo.jpg" /></p><p>Text</p>')
    expect(result.html).toBe('<p>Text</p>')
    expect(result.issues).toEqual([{ code: 'unresolved-image', detail: '/system/assets/5585/original/logo.jpg' }])
  })

  it('flattens columns, buttons, tables and videos, and reports them', () => {
    const raw = `<!-- wp:columns --><div class="wp-block-columns"><div class="wp-block-column"><p>Links</p></div><div class="wp-block-column"><figure class="wp-block-video"><video controls src="https://x.at/v.mp4"></video></figure></div></div><!-- /wp:columns -->
<!-- wp:buttons --><div class="wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link" href="https://x.at/s">Mehr</a></div></div><!-- /wp:buttons -->
<!-- wp:table --><figure class="wp-block-table"><table><tbody><tr><td>Mo</td><td>10–18</td></tr></tbody></table></figure><!-- /wp:table -->`
    const result = cleanWpHtml(raw)
    expect(result.html).toBe('<p>Links</p>\n<p><a href="https://x.at/v.mp4">https://x.at/v.mp4</a></p>\n<p><a href="https://x.at/s">Mehr</a></p>\n<p>Mo | 10–18</p>')
    expect(result.issues.map((issue) => issue.detail).sort()).toEqual(['buttons', 'table', 'video'])
  })

  it('turns an embedded player into a link to its source', () => {
    const raw = '<p>Video:</p>\n<div style="padding:56% 0 0 0;position:relative;"><iframe style="position: absolute;" src="https://player.vimeo.com/video/705714750?h=21dfe78a80" frameborder="0" allowfullscreen="allowfullscreen"></iframe></div>'
    const result = cleanWpHtml(raw)
    expect(result.html).toBe(
      '<p>Video:</p>\n<p><a href="https://player.vimeo.com/video/705714750?h=21dfe78a80">https://player.vimeo.com/video/705714750?h=21dfe78a80</a></p>',
    )
    expect(result.issues).toEqual([{ code: 'flattened', detail: 'iframe' }])
  })

  it('reports dropped blocks and shortcodes, keeping shortcode text', () => {
    const result = cleanWpHtml('<!-- wp:acf/product {"id":"block_1"} /-->\n<!-- wp:shortcode -->\n[modula id="35842"]\n<!-- /wp:shortcode -->\n<!-- wp:paragraph --><p>[ding] plus</p><!-- /wp:paragraph -->')
    expect(result.issues).toEqual([
      { code: 'dropped-block', detail: 'acf/product' },
      { code: 'shortcode', detail: '[modula id="35842"]' },
    ])
    expect(result.html).toBe('<p>[modula id="35842"]</p>\n<p>[ding] plus</p>')
  })

  it('fixes mangled links and drops ones that are not URLs', () => {
    const result = cleanWpHtml('<p><a href="mailto: service@designaustria.at">Mail</a> <a href="https://x.at/a ">X</a> <a href="»Walk of Fame«">Walk</a></p>')
    expect(result.html).toBe('<p><a href="mailto:service@designaustria.at">Mail</a> <a href="https://x.at/a">X</a> Walk</p>')
    expect(result.issues).toEqual([{ code: 'invalid-link', detail: '»Walk of Fame«' }])
  })

  it('returns null for empty content', () => {
    expect(cleanWpHtml('').html).toBeNull()
    expect(cleanWpHtml('<!-- wp:paragraph --><p></p><!-- /wp:paragraph -->').html).toBeNull()
  })
})
