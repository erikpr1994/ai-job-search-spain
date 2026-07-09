import { detailUrl, htmlFetch, idFromUrl, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = idFromUrl(opts.id)
  if (!id) {
    writeError(`Could not parse a job id from "${opts.id}"`, "BAD_ID")
    return 1
  }

  // A full detail URL was passed in — use it directly; otherwise reconstruct
  // the canonical /ofertas-trabajo/rf-<id> URL, which resolves for any offer.
  const url = /^https?:\/\//i.test(opts.id) ? opts.id : detailUrl(id)

  try {
    const html = await htmlFetch(url)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, id)
    if (!job.title) {
      writeError("Failed to parse job listing", "PARSE_ERROR")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}${job.modality ? ` (${job.modality})` : ""}`,
        "",
        job.date ? `Publicada: ${job.date}` : "",
        job.deadline ? `Plazo: ${job.deadline}` : "",
        job.employmentType ? `Jornada: ${job.employmentType}` : "",
        job.contractType ? `Contrato: ${job.contractType}` : "",
        job.experience ? `Experiencia: ${job.experience}` : "",
        job.functions ? `Funciones: ${job.functions}` : "",
        job.salary ? `Salario: ${job.salary}` : "",
        job.technologies.length ? `Tecnologías: ${job.technologies.join(", ")}` : "",
        "",
        job.description || "(sin descripción)",
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Inscripción: ${job.applyUrl}` : "",
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
