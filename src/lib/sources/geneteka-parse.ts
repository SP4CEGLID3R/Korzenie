// Odczyt odpowiedzi Geneteki (api/getAct.php – ten sam format, którego używa
// tabela wyników na stronie). Bez sieci – testy działają na zanonimizowanym przykładzie.
//
// Kolumny (X 2026):
//  urodzenia (B): rok, akt, imię, nazwisko, imię ojca, imię matki, nazwisko matki, parafia, miejscowość, uwagi
//  małżeństwa (S): rok, akt, imię, nazwisko, rodzice pana młodego, imię, nazwisko, rodzice panny młodej, parafia, uwagi
//  zgony (D):     rok, akt, imię, nazwisko, imię ojca, imię matki, nazwisko matki, parafia, miejscowość, uwagi
// W „uwagach” (HTML) są m.in.: dokładna data, miejscowość, wiek, archiwum, link do skanu,
// autor indeksu (wolontariusz) i identyfikator wpisu (gid w linku „Zgłoś poprawkę”).

import type { RecordFacts, YearRange } from "@/lib/matching/types";
import { buildGenetekaUrl, GENETEKA_REGIONS, type GenetekaKind, type GenetekaRegion } from "./geneteka-links";
import type { SourceCandidate } from "./types";

export type GetActResponse = { recordsTotal?: number; recordsFiltered?: number; data: unknown[][] };

export type GenetekaAct = {
  kind: GenetekaKind;
  gid: string | null;
  region: GenetekaRegion | null;
  parishId: string | null;
  year: number | null;
  actNumber: string | null;
  parish: string | null;
  locality: string | null;
  /** Dokładna data z uwag („Data urodzenia: 04.10.1851 r.”) jako [rok, miesiąc, dzień]. */
  exactDate: [number, number, number] | null;
  ageAtDeath: number | null;
  person: { given: string | null; surname: string | null };
  father: { given: string | null } | null;
  mother: { given: string | null; surname: string | null } | null;
  /** Tylko akty ślubu: panna młoda i rodzice obojga. */
  bride?: { given: string | null; surname: string | null };
  brideFather?: { given: string | null } | null;
  brideMother?: { given: string | null; surname: string | null } | null;
  groomFather?: { given: string | null } | null;
  groomMother?: { given: string | null; surname: string | null } | null;
  remarks: string[];
  archive: string | null;
  /** Link do skanu aktu (metryki.genealodzy.pl, genbaza, szukajwarchiwach). */
  scanUrl: string | null;
  indexedBy: string | null;
};

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#013;": "\n", "&nbsp;": " " };

function decodeHtml(s: string) {
  return s.replace(/&(amp|lt|gt|quot|#39|#013|nbsp);/g, (m) => ENTITIES[m] ?? m).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

const clean = (v: unknown) => {
  const s = typeof v === "string" ? v : v == null ? "" : String(v);
  const t = decodeHtml(s).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return t || null;
};

/** „Jan, Katarzyna Kowalkowska” → ojciec Jan, matka Katarzyna Kowalkowska. */
export function parseParents(v: unknown) {
  const text = clean(v);
  if (!text) return { father: null, mother: null };
  const [f, m] = text.split(",").map((x) => x.trim());
  const motherParts = (m ?? "").split(/\s+/).filter(Boolean);
  return {
    father: f ? { given: f } : null,
    mother: motherParts.length
      ? { given: motherParts[0], surname: motherParts.length > 1 ? motherParts.slice(1).join(" ") : null }
      : null,
  };
}

/** Domeny ze skanami ksiąg, które warto pokazać. Innych linków (np. do serwisów komercyjnych) nie przenosimy. */
const SCAN_HOSTS = ["metryki.genealodzy.pl", "metryki.genbaza.pl", "genbaza.pl", "szukajwarchiwach.gov.pl", "www.szukajwarchiwach.gov.pl"];

export function parseRemarks(html: unknown) {
  const s = typeof html === "string" ? html : "";
  const titles = [...s.matchAll(/title="([^"]*)"/g)].map((m) => decodeHtml(m[1]).replace(/\r/g, "\n"));
  const hrefs = [...s.matchAll(/href="([^"]*)"/g)].map((m) => decodeHtml(m[1]));
  const lines = titles.flatMap((t) => t.split("\n")).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

  // Wartość bywa w tej samej linii („Miejscowość: Bolmin”) albo w następnej.
  const field = (label: RegExp) => {
    const i = lines.findIndex((x) => label.test(x));
    if (i < 0) return null;
    const v = lines[i].replace(label, "").trim();
    return v || lines[i + 1] || null;
  };
  const dateText = field(/^Data (urodzenia|chrztu|ślubu|zgonu|pogrzebu):/i);
  const dm = dateText?.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  const ageMatch = lines.join(" ").match(/(?:lat|wiek:?)\s*(\d{1,3})\b/i);
  const fix = hrefs.find((h) => h.startsWith("fix.php"));
  const fixParams = fix ? new URLSearchParams(fix.split("?")[1] ?? "") : null;
  const scan = hrefs.find((h) => {
    try {
      return SCAN_HOSTS.includes(new URL(h).hostname);
    } catch {
      return false;
    }
  });

  return {
    exactDate: dm ? ([Number(dm[3]), Number(dm[2]), Number(dm[1])] as [number, number, number]) : null,
    locality: field(/^Miejscowość:/i),
    ageAtDeath: ageMatch ? Number(ageMatch[1]) : null,
    archive: field(/^Miejsce przechowywania ksiąg:/i),
    indexedBy: field(/^Indeks dodał:/i),
    remarks: lines.filter((l) => /^Uwagi:/i.test(l)).map((l) => l.replace(/^Uwagi:\s*/i, "")),
    gid: fixParams?.get("gid") ?? null,
    parishId: fixParams?.get("rid") ?? null,
    region: (fixParams?.get("w") as GenetekaRegion | null) ?? null,
    scanUrl: scan ?? null,
  };
}

export function parseGetAct(json: GetActResponse, kind: GenetekaKind): GenetekaAct[] {
  return (json.data ?? []).map((row) => {
    const r = parseRemarks(row[9]);
    const year = Number(row[0]);
    const base = {
      kind,
      gid: r.gid,
      region: r.region,
      parishId: r.parishId,
      year: Number.isFinite(year) && year > 0 ? year : null,
      actNumber: clean(row[1]),
      exactDate: r.exactDate,
      ageAtDeath: r.ageAtDeath,
      person: { given: clean(row[2]), surname: clean(row[3]) },
      remarks: r.remarks,
      archive: r.archive,
      scanUrl: r.scanUrl,
      indexedBy: r.indexedBy,
    };
    if (kind === "S") {
      const groom = parseParents(row[4]);
      const bride = parseParents(row[7]);
      return {
        ...base,
        parish: clean(row[8]),
        locality: r.locality ?? clean(row[8]),
        father: groom.father,
        mother: groom.mother,
        groomFather: groom.father,
        groomMother: groom.mother,
        bride: { given: clean(row[5]), surname: clean(row[6]) },
        brideFather: bride.father,
        brideMother: bride.mother,
      };
    }
    return {
      ...base,
      parish: clean(row[7]),
      locality: clean(row[8]) ?? r.locality,
      father: clean(row[4]) ? { given: clean(row[4]) } : null,
      mother: clean(row[5]) || clean(row[6]) ? { given: clean(row[5]), surname: clean(row[6]) } : null,
    };
  });
}

const regionLabel = (code: GenetekaRegion | null) => GENETEKA_REGIONS.find(([c]) => c === code)?.[1] ?? null;

/** Link do tego aktu w Genetece: wyszukiwanie zawężone do parafii, roku i nazwiska. */
export function actUrl(a: GenetekaAct) {
  return buildGenetekaUrl({
    kind: a.kind,
    lastname: a.person.surname ?? "",
    name: a.person.given,
    fromYear: a.year,
    toYear: a.year,
    region: a.region,
    parishId: a.parishId,
  });
}

/**
 * Akt → rekord do porównania. Dla aktów ślubu zwracamy dwa spojrzenia:
 * `facts` (pan młody) i `altFacts` (panna młoda) – wybiera je silnik zależnie od płci osoby.
 */
export function actToCandidate(a: GenetekaAct): SourceCandidate & { altFacts?: RecordFacts } {
  const place = a.parish || a.locality ? { name: a.locality ?? a.parish!, parish: a.parish, region: regionLabel(a.region) } : null;
  const kindLabel = { B: "Akt urodzenia/chrztu", S: "Akt małżeństwa", D: "Akt zgonu" }[a.kind];
  const who = [a.person.given, a.person.surname].filter(Boolean).join(" ");
  const title =
    a.kind === "S"
      ? `${kindLabel}: ${who} i ${[a.bride?.given, a.bride?.surname].filter(Boolean).join(" ")}, ${a.parish ?? ""} ${a.year ?? ""}`.trim()
      : `${kindLabel}: ${who}, ${a.parish ?? ""} ${a.year ?? ""}`.trim();
  const fatherFact = (f: { given: string | null } | null | undefined, surname: string | null) =>
    f?.given ? { given: f.given, surname } : null;
  const birthFromAge: YearRange | null =
    a.kind === "D" && a.year && a.ageAtDeath !== null ? { min: a.year - a.ageAtDeath - 1, max: a.year - a.ageAtDeath } : null;

  const facts: RecordFacts =
    a.kind === "S"
      ? {
          kind: "MARRIAGE",
          person: { ...a.person, sex: "MALE" },
          year: a.year,
          date: a.exactDate,
          place,
          father: fatherFact(a.groomFather, a.person.surname),
          mother: a.groomMother ?? null,
          spouses: a.bride ? [a.bride] : [],
          description: title,
        }
      : {
          kind: a.kind === "B" ? "BIRTH" : "DEATH",
          person: a.person,
          year: a.year,
          date: a.exactDate,
          birth: birthFromAge,
          place,
          father: fatherFact(a.father, a.person.surname),
          mother: a.mother,
          description: title,
        };

  const altFacts: RecordFacts | undefined =
    a.kind === "S" && a.bride
      ? {
          kind: "MARRIAGE",
          person: { ...a.bride, sex: "FEMALE" },
          year: a.year,
          date: a.exactDate,
          place,
          father: fatherFact(a.brideFather, a.bride.surname),
          mother: a.brideMother ?? null,
          spouses: [a.person],
          description: title,
        }
      : undefined;

  return {
    externalId: `${a.kind}-${a.gid ?? `${a.region}-${a.parishId}-${a.year}-${a.actNumber}`}`,
    type: a.kind === "B" ? "BIRTH" : a.kind === "S" ? "MARRIAGE" : "DEATH",
    url: actUrl(a),
    title,
    year: a.year,
    facts,
    altFacts,
    raw: a,
  };
}

// ───────────────────────────── robots.txt ─────────────────────────────

export type RobotsRules = { crawlDelaySeconds: number | null; disallow: string[] };

/** Reguły dla wszystkich automatów („User-agent: *”) – na nich opiera się nasz limit. */
export function parseRobots(text: string): RobotsRules {
  const rules: RobotsRules = { crawlDelaySeconds: null, disallow: [] };
  let applies = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const key = k.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") applies = value === "*" || /korzenie/i.test(value);
    else if (applies && key === "crawl-delay") rules.crawlDelaySeconds = Number(value) || null;
    else if (applies && key === "disallow" && value) rules.disallow.push(value);
  }
  return rules;
}

export function isAllowed(rules: RobotsRules, path: string) {
  return !rules.disallow.some((d) => path.startsWith(d));
}
