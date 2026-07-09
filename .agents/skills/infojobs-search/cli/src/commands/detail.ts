import {
  DETAIL_BASE,
  htmlFetch,
  parseJobDetail,
  extractOfferId,
  writeError,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const hex = extractOfferId(opts.id)
  if (!hex) {
    writeError(`Could not parse an offer id from "${opts.id}"`, "BAD_ID")
    return 1
  }

  // If the caller passed a full InfoJobs offer URL, reuse it (canonical slug);
  // otherwise build a resolvable two-segment path around the of-i id.
  const isUrl = /^https?:\/\/(www\.)?infojobs\.net\//i.test(opts.id.trim())
  const fetchUrl = isUrl ? opts.id.trim().split("?")[0] : `${DETAIL_BASE}/of-i${hex}`
  const canonicalUrl = isUrl ? opts.id.trim().split("?")[0] : `${DETAIL_BASE}/of-i${hex}`

  try {
    const html = await htmlFetch(fetchUrl)
    const job = html ? parseJobDetail(html, hex, canonicalUrl) : null
    if (!job) {
      writeError("Offer not found", "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.details.length ? job.details.join(" · ") : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Apply: ${job.applyUrl}` : "",
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
