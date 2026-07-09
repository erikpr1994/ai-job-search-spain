import { describe, test, expect } from "bun:test"
import {
  parseJobCards,
  parseHitCount,
  provinceCode,
  idFromUrl,
  detailUrl,
  parseDate,
  decodeHtmlEntities,
} from "../src/helpers"

// Minimal search-card markup mirroring Tecnoempleo's real structure:
// each result opens with `<a name="rf-<id>">`, has an <h3> title anchor, a
// company link with a `title="Ofertas de Empleo <name>"` attribute, and a
// mobile summary span carrying `<b>Location</b> (Modality) - DD/MM/YYYY`.
function card(
  id: string,
  title: string,
  company: string,
  summary: string,
): string {
  return `<a name="rf-${id}" id="rf-${id}"></a>
  <div class="p-3 border rounded" onclick="location.href='https://www.tecnoempleo.com/some-slug/react/rf-${id}'">
    <h3 class="fs-5 mb-2">
      <a href="https://www.tecnoempleo.com/some-slug/react/rf-${id}" class="font-weight-bold" title="${title}">${title}</a>
    </h3>
    <a title="Ofertas de Empleo ${company}" href="https://www.tecnoempleo.com/acme-trabajo" class="text-primary link-muted">${company}</a>
    <span class="d-block d-lg-none text-gray-800">${summary}</span>
  </div>`
}

describe("parseJobCards", () => {
  test("parses id, title, company, location, modality, date, url", () => {
    const html = card(
      "d97516df323a73b22543",
      "Senior Fullstack Engineer - React, Node.js",
      "zooplus SE",
      "<b>Madrid</b> (Híbrido) - 08/07/2026",
    )
    const [c] = parseJobCards(html)
    expect(c.id).toBe("d97516df323a73b22543")
    expect(c.title).toBe("Senior Fullstack Engineer - React, Node.js")
    expect(c.company).toBe("zooplus SE")
    expect(c.location).toBe("Madrid")
    expect(c.modality).toBe("Híbrido")
    expect(c.date).toBe("08/07/2026")
    expect(c.url).toContain("rf-d97516df323a73b22543")
  })

  test("treats '100% remoto' as modality, not a location", () => {
    const html = card("aaaa1111bbbb2222cccc", "Frontend React", "Grupo Digital", "<b>100% remoto</b> - 02/07/2026")
    const [c] = parseJobCards(html)
    expect(c.location).toBeNull()
    expect(c.modality).toBe("100% remoto")
    expect(c.date).toBe("02/07/2026")
  })

  test("decodes HTML entities in title and company", () => {
    const html = card("ffff0000ffff0000ffff", "Programador/a Frontend &#40;React&#41;", "N&#xF8;rrebro ApS", "<b>Sevilla</b> (Presencial) - 01/07/2026")
    const [c] = parseJobCards(html)
    expect(c.title).toBe("Programador/a Frontend (React)")
    expect(c.company).toBe("Nørrebro ApS")
  })

  test("one malformed card does not break the rest", () => {
    const good = card("1111222233334444aaaa", "React Dev", "Acme", "<b>Madrid</b> (Híbrido) - 08/07/2026")
    const broken = `<a name="rf-nothexvalid"></a><div>garbage without a title</div>`
    const cards = parseJobCards(good + broken)
    expect(cards.length).toBe(1)
    expect(cards[0].title).toBe("React Dev")
  })
})

describe("parseHitCount", () => {
  test("reads total from the results heading", () => {
    expect(parseHitCount('<h1 class="h4">121 Ofertas Trabajo de React</h1>')).toBe(121)
  })
  test("normalizes dot-thousands notation", () => {
    expect(parseHitCount('<h1>1.234 Ofertas Trabajo de Java</h1>')).toBe(1234)
  })
  test("returns 0 when absent", () => {
    expect(parseHitCount("<h1>No hay ofertas</h1>")).toBe(0)
  })
})

describe("provinceCode", () => {
  test("maps a province name to its pr code", () => {
    expect(provinceCode("Madrid")).toBe("263")
    expect(provinceCode("Barcelona")).toBe("240")
  })
  test("is accent- and case-insensitive", () => {
    expect(provinceCode("malaga")).toBe("264")
    expect(provinceCode("MÁLAGA")).toBe("264")
  })
  test("accepts synonyms", () => {
    expect(provinceCode("Vizcaya")).toBe("241")
    expect(provinceCode("Gerona")).toBe("252")
  })
  test("passes a raw numeric code through", () => {
    expect(provinceCode("263")).toBe("263")
  })
  test("returns null for unknown input", () => {
    expect(provinceCode("Lisboa")).toBeNull()
  })
})

describe("idFromUrl / detailUrl", () => {
  test("extracts id from a full detail URL", () => {
    expect(idFromUrl("https://www.tecnoempleo.com/some-slug/react/rf-d97516df323a73b22543")).toBe(
      "d97516df323a73b22543",
    )
  })
  test("extracts id from an rf- prefixed value", () => {
    expect(idFromUrl("rf-d97516df323a73b22543")).toBe("d97516df323a73b22543")
  })
  test("accepts a bare hex id", () => {
    expect(idFromUrl("d97516df323a73b22543")).toBe("d97516df323a73b22543")
  })
  test("rejects garbage", () => {
    expect(idFromUrl("not-an-id")).toBeNull()
  })
  test("detailUrl reconstructs a resolvable canonical URL", () => {
    expect(detailUrl("d97516df323a73b22543")).toBe(
      "https://www.tecnoempleo.com/oferta/detalle/rf-d97516df323a73b22543",
    )
  })
})

describe("parseDate", () => {
  test("parses DD/MM/YYYY", () => {
    expect(parseDate("08/07/2026")).toBe(Date.UTC(2026, 6, 8))
  })
  test("parses YYYY-MM-DD", () => {
    expect(parseDate("2026-07-08")).toBe(Date.UTC(2026, 6, 8))
  })
  test("returns null for null/garbage", () => {
    expect(parseDate(null)).toBeNull()
    expect(parseDate("soon")).toBeNull()
  })
})

describe("decodeHtmlEntities", () => {
  test("decodes hex, decimal, and named Spanish entities", () => {
    expect(decodeHtmlEntities("Sm&#xF8;rrebr&#248;d")).toBe("Smørrebrød")
    expect(decodeHtmlEntities("Espa&ntilde;a &amp; M&aacute;s")).toBe("España & Más")
  })
})
