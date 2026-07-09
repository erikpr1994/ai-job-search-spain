import { describe, test, expect } from "bun:test";
import {
  parseJobCards,
  parseJobDetail,
  jobageToSinceDate,
  extractOfferId,
} from "../src/helpers";

// Minimal offer-card markup modeled on the live InfoJobs search HTML.
// parseJobCards splits on id="job-title-<hex>" and needs, per card, the title
// span and (optionally) company/location/date. Entities are injected to exercise
// decoding.
function offerCard(
  hex: string,
  title: string,
  company = "Acme",
  location = "Madrid",
  date = "Hace 4d",
): string {
  return `<li class="ij-List-item ij-OfferList-offerCardItem">
    <div class="ij-OfferCardContent">
      <h2 id="job-title-${hex}" class="ij-OfferCardContent-description-title">
        <a class="ij-OfferCardContent-description-link sui-PrimitiveLinkBoxLink" href="//www.infojobs.net/madrid/${title}/of-i${hex}?applicationOrigin=search-new&amp;page=1" aria-label="${title}">
          <span class="ij-OfferCardContent-description-title-link">${title}</span>
        </a>
      </h2>
      <h3 id="job-company-${hex}" class="ij-OfferCardContent-description-subtitle">
        <a href="https://www.infojobs.net/acme/em-i${hex}">${company}</a>
      </h3>
      <ul class="ij-OfferCardContent-description-list">
        <li class="ij-OfferCardContent-description-list-item"><span class="ij-OfferCardContent-description-list-item-truncate">${location}</span></li>
        <li class="ij-OfferCardContent-description-list-item">Solo teletrabajo</li>
        <li class="ij-OfferCardContent-description-list-item"><span class="ij-FormatterSincedate ij-FormatterSincedate--primary" data-testid="sincedate-tag">${date}</span></li>
      </ul>
    </div>
  </li>`;
}

describe("parseJobCards", () => {
  test("parses id, title, company, location, modality, date and url", () => {
    const [card] = parseJobCards(offerCard("5729505a1a431da38968e4bb91f095", "Senior React Developer"));
    expect(card.id).toBe("5729505a1a431da38968e4bb91f095");
    expect(card.title).toBe("Senior React Developer");
    expect(card.company).toBe("Acme");
    expect(card.location).toBe("Madrid");
    expect(card.modality).toBe("Solo teletrabajo");
    expect(card.date).toBe("Hace 4d");
    expect(card.url).toBe(
      "https://www.infojobs.net/madrid/Senior React Developer/of-i5729505a1a431da38968e4bb91f095",
    );
  });

  test("parses multiple cards independently", () => {
    const html = offerCard("aaaa1111bbbb2222cccc3333dddd44", "Front End") + offerCard("eeee5555ffff6666aaaa7777bbbb88", "Back End");
    const cards = parseJobCards(html);
    expect(cards.length).toBe(2);
    expect(cards.map((c) => c.title)).toEqual(["Front End", "Back End"]);
  });

  test("skips markup without a job-title id (ad banners)", () => {
    const html = `<li class="ij-OfferList-banner"><div id="ad-inline_1"></div></li>` +
      offerCard("11112222333344445555666677", "Real Offer");
    const cards = parseJobCards(html);
    expect(cards.length).toBe(1);
    expect(cards[0].title).toBe("Real Offer");
  });

  test("decodes hexadecimal numeric entities in the title", () => {
    const [card] = parseJobCards(offerCard("aaaabbbbccccdddd1111222233", "Caf&#xE9; Manager"));
    expect(card.title).toBe("Café Manager");
  });

  test("decodes hex entities in the company subtitle", () => {
    const [card] = parseJobCards(
      offerCard("aaaabbbbccccdddd4444555566", "Engineer", "N&#xF8;rrebro ApS"),
    );
    expect(card.company).toBe("Nørrebro ApS");
  });

  test("null company/location/date when the markers are absent", () => {
    const bare = `<h2 id="job-title-abc123abc123abc123abc1" class="ij-OfferCardContent-description-title">
      <a class="ij-OfferCardContent-description-link" href="//www.infojobs.net/x/y/of-iabc123abc123abc123abc1" aria-label="Bare">
        <span class="ij-OfferCardContent-description-title-link">Bare</span></a></h2>`;
    const [card] = parseJobCards(bare);
    expect(card.title).toBe("Bare");
    expect(card.company).toBeNull();
    expect(card.location).toBeNull();
    expect(card.date).toBeNull();
  });
});

describe("parseJobDetail", () => {
  const detailHtml = `
    <div class="ij-Box ij-OfferDetailHeader-title"><h1 class="ij-BaseTypography ij-Heading ij-Heading-title1">Se&#xF1;or Engineer</h1></div>
    <div class="ij-Box ij-OfferDetailHeader-companyLogo-companyName"><a title="Más ofertas en BOYCOR" href="/boycor/em-ie771ecb" class="ij-Link">BOYCOR</a></div>
    <div class="ij-OfferDetailHeader-details"><div class="ij-OfferDetailHeader-detailsList">
      <div class="ij-Box ij-OfferDetailHeader-detailsList-item"><span class="sui-AtomIcon"></span><p class="ij-Text">Madrid (<a href="/ofertas-trabajo/madrid">Madrid</a>)</p></div>
      <div class="ij-Box ij-OfferDetailHeader-detailsList-item"><span class="sui-AtomIcon"></span><p class="ij-Text">Solo teletrabajo</p></div>
    </div></div>
    <article class="ij-Box"><h3 class="ij-Heading-title2">Descripción</h3><div class="ij-EnrichedTextArea-paragraph"><p>Buscamos <strong>React</strong> dev.</p><p>Remoto.</p></div></article>`;

  test("parses title, company, location, details and description", () => {
    const job = parseJobDetail(detailHtml, "e771ecb", "https://www.infojobs.net/x/y/of-ie771ecb");
    expect(job).not.toBeNull();
    expect(job!.title).toBe("Señor Engineer");
    expect(job!.company).toBe("BOYCOR");
    expect(job!.companyUrl).toBe("https://www.infojobs.net/boycor/em-ie771ecb");
    expect(job!.location).toBe("Madrid ( Madrid )");
    expect(job!.details.length).toBeGreaterThanOrEqual(2);
    expect(job!.description).toContain("React");
    expect(job!.description).toContain("Remoto");
  });

  test("returns null when no title resolves (expired/not-found)", () => {
    expect(parseJobDetail(`<html><body>redirected</body></html>`, "x", "u")).toBeNull();
  });
});

describe("jobageToSinceDate", () => {
  test("maps day counts to the three InfoJobs buckets", () => {
    expect(jobageToSinceDate(1)).toBe("_24_HOURS");
    expect(jobageToSinceDate(5)).toBe("_7_DAYS");
    expect(jobageToSinceDate(7)).toBe("_7_DAYS");
    expect(jobageToSinceDate(10)).toBe("_15_DAYS");
    expect(jobageToSinceDate(15)).toBe("_15_DAYS");
  });
  test("no filter for out-of-range / omitted values", () => {
    expect(jobageToSinceDate(30)).toBeNull();
    expect(jobageToSinceDate(9999)).toBeNull();
    expect(jobageToSinceDate(0)).toBeNull();
  });
});

describe("extractOfferId", () => {
  test("extracts hex from an of-i token, a full url, and bare hex", () => {
    expect(extractOfferId("of-i5729505a1a431da38968e4bb91f095")).toBe("5729505a1a431da38968e4bb91f095");
    expect(
      extractOfferId("https://www.infojobs.net/madrid/dev/of-i5729505a1a431da38968e4bb91f095?applicationOrigin=x"),
    ).toBe("5729505a1a431da38968e4bb91f095");
    expect(extractOfferId("5729505a1a431da38968e4bb91f095")).toBe("5729505a1a431da38968e4bb91f095");
  });
  test("returns null for unparseable input", () => {
    expect(extractOfferId("not-an-id")).toBeNull();
  });
});
