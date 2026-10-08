import { fetchJob, normalizeSlug, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  try {
    const job = await fetchJob(normalizeSlug(opts.id))
    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        ...(job.date ? [`Posted: ${job.date.slice(0, 10)}`] : []),
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        ...(job.applyUrl ? [`Apply: ${job.applyUrl}`] : []),
      ]
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    const code = (e as { code?: string }).code === "NOT_FOUND" ? "NOT_FOUND" : "DETAIL_FAILED"
    writeError(e instanceof Error ? e.message : String(e), code)
    return 1
  }
}
