// Czytanie plików GEDCOM (format wymiany drzew – eksportują go m.in. popularne
// serwisy genealogiczne i programy typu Legacy, Gramps, RootsMagic).
// Specyfikacja 5.5.1: https://gedcom.io/specifications/ged551.pdf
//
// Ten moduł zamienia tekst na drzewo węzłów (poziom, tag, wartość, dzieci).
// Co znaczą poszczególne tagi – patrz import.ts.

export type GedcomNode = {
  level: number;
  xref: string | null; // np. "@I12@"
  tag: string; // np. "INDI", "NAME", "BIRT"
  value: string;
  children: GedcomNode[];
};

export type DecodedFile = { text: string; encoding: string; warnings: string[] };

/**
 * Odczytuje bajty pliku we właściwym kodowaniu. Rozpoznaje BOM (UTF-8/UTF-16),
 * a w pozostałych przypadkach czyta deklarację „1 CHAR …” z nagłówka.
 */
export function decodeGedcom(bytes: Uint8Array): DecodedFile {
  const warnings: string[] = [];
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "UTF-8", warnings };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "UTF-16", warnings };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "UTF-16", warnings };
  }

  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4000));
  const charMatch = head.match(/^\s*1\s+CHAR\s+(\S+)/m);
  const declared = (charMatch?.[1] ?? "UTF-8").toUpperCase();

  if (declared === "UTF-8" || declared === "UTF8" || declared === "ASCII" || declared === "UNICODE") {
    const text = new TextDecoder("utf-8").decode(bytes);
    if (text.includes("�")) {
      // Plik deklaruje UTF-8, ale zawiera inne znaki – najczęściej polskie Windows-1250.
      warnings.push("Plik nie jest poprawnym UTF-8 – odczytano go jako Windows-1250. Sprawdź polskie znaki.");
      return { text: new TextDecoder("windows-1250").decode(bytes), encoding: "WINDOWS-1250", warnings };
    }
    return { text, encoding: "UTF-8", warnings };
  }
  if (declared === "ANSEL") {
    warnings.push(
      "Plik używa starego kodowania ANSEL – polskie znaki mogą być zniekształcone. Jeśli to możliwe, wyeksportuj drzewo ponownie w UTF-8.",
    );
    return { text: new TextDecoder("latin1").decode(bytes), encoding: "ANSEL", warnings };
  }
  // ANSI, WINDOWS-1250, CP1250, IBMPC… – w polskich programach to zwykle Windows-1250.
  return { text: new TextDecoder("windows-1250").decode(bytes), encoding: "WINDOWS-1250", warnings };
}

const LINE_RE = /^\s*(\d{1,2})\s+(?:(@[^@\s]+@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/;

/** Zamienia tekst GEDCOM na listę rekordów najwyższego poziomu (HEAD, INDI, FAM…). */
export function parseGedcom(text: string): { records: GedcomNode[]; warnings: string[] } {
  const warnings: string[] = [];
  const records: GedcomNode[] = [];
  const stack: GedcomNode[] = [];
  let badLines = 0;

  const lines = text.split(/\r\n|\r|\n/);
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const m = raw.match(LINE_RE);
    if (!m) {
      badLines++;
      continue;
    }
    const level = Number(m[1]);
    const node: GedcomNode = {
      level,
      xref: m[2] ?? null,
      tag: m[3].toUpperCase(),
      // „@@” w tekście oznacza zwykły znak „@”.
      value: (m[4] ?? "").replace(/@@/g, "@"),
      children: [],
    };

    // Łączenie długich tekstów: CONC dokleja bez spacji, CONT od nowej linii.
    if (node.tag === "CONC" || node.tag === "CONT") {
      const parent = stack[level - 1];
      if (parent) parent.value += (node.tag === "CONT" ? "\n" : "") + node.value;
      continue;
    }

    if (level === 0) {
      records.push(node);
      stack.length = 0;
      stack[0] = node;
      continue;
    }
    const parent = stack[level - 1];
    if (!parent) {
      badLines++;
      continue;
    }
    parent.children.push(node);
    stack.length = level;
    stack[level] = node;
  }

  if (badLines > 0) warnings.push(`Pominięto ${badLines} niepoprawnych linii pliku.`);
  if (!records.some((r) => r.tag === "HEAD")) warnings.push("Brak nagłówka HEAD – to może nie być plik GEDCOM.");
  return { records, warnings };
}

/** Pierwsze dziecko o danym tagu. */
export function child(node: GedcomNode, tag: string): GedcomNode | undefined {
  return node.children.find((c) => c.tag === tag);
}

/** Wszystkie dzieci o danym tagu. */
export function children(node: GedcomNode, tag: string): GedcomNode[] {
  return node.children.filter((c) => c.tag === tag);
}

/** Wartość pierwszego dziecka o danym tagu. */
export function childValue(node: GedcomNode, tag: string): string | null {
  const c = child(node, tag);
  return c && c.value.trim() ? c.value.trim() : null;
}
