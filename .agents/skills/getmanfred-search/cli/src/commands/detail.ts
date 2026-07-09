import {
  OFFERS_URL,
  jsonFetch,
  toDetail,
  normalizeId,
  writeError,
  type RawOffer,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse an offer id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const raw = await jsonFetch<RawOffer>(`${OFFERS_URL}/${id}?lang=EN`)
    if (!raw || typeof raw.id === "undefined") {
      writeError("Offer not found", "NOT_FOUND")
      return 1
    }
    const job = toDetail(raw)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        job.salary ? `Salary: ${job.salary}` : "",
        typeof job.remote === "number" ? `Remote: ${job.remote}%` : "",
        job.skills.length ? `Stack: ${job.skills.join(", ")}` : "",
        job.languages.length ? `Languages: ${job.languages.join(", ")}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.companyUrl ? `Company: ${job.companyUrl}` : "",
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
