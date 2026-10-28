// Geneteka (https://geneteka.genealodzy.pl) – wyszukiwarka indeksów metrykalnych
// tworzona przez wolontariuszy Polskiego Towarzystwa Genealogicznego.
//
// Domyślnie NIE pobieramy z niej danych automatycznie. Budujemy gotowe linki do
// wyszukiwarki, które użytkownik otwiera sam – tak samo, jakby wpisał dane
// w formularzu na stronie Geneteki.
//
// Parametry formularza (strona index.php?op=gt, stan na X 2026):
//   bdm  – rodzaj aktów: B = urodzenia/chrzty, S = małżeństwa, D = zgony
//   w    – województwo (kod, np. 13sk = świętokrzyskie), lista: GENETEKA_REGIONS
//   rid  – parafia; „B”/„S”/„D” (taki sam jak bdm) = wszystkie miejscowości w województwie
//   search_lastname / search_name   – nazwisko i imię (osoba 1)
//   search_lastname2 / search_name2 – nazwisko i imię (osoba 2, np. małżonek)
//   from_date / to_date – zakres lat
//   exac=1 – tylko dokładna pisownia; pair=1 – szukaj pary (obie osoby w jednym akcie)

export const GENETEKA_BASE = "https://geneteka.genealodzy.pl/index.php";

export type GenetekaKind = "B" | "S" | "D";

export const GENETEKA_KIND_LABEL: Record<GenetekaKind, string> = {
  B: "urodzenia i chrzty",
  S: "małżeństwa",
  D: "zgony",
};

/** Kody województw z formularza Geneteki. */
export const GENETEKA_REGIONS = [
  ["01ds", "dolnośląskie"],
  ["02kp", "kujawsko-pomorskie"],
  ["03lb", "lubelskie"],
  ["04ls", "lubuskie"],
  ["05ld", "łódzkie"],
  ["06mp", "małopolskie"],
  ["07mz", "mazowieckie"],
  ["71wa", "Warszawa"],
  ["08op", "opolskie"],
  ["09pk", "podkarpackie"],
  ["10pl", "podlaskie"],
  ["11pm", "pomorskie"],
  ["12sl", "śląskie"],
  ["13sk", "świętokrzyskie"],
  ["14wm", "warmińsko-mazurskie"],
  ["15wp", "wielkopolskie"],
  ["16zp", "zachodniopomorskie"],
  ["21uk", "Ukraina"],
  ["22br", "Białoruś"],
  ["23lt", "Litwa"],
  ["25po", "Pozostałe"],
] as const;

export type GenetekaRegion = (typeof GENETEKA_REGIONS)[number][0];

export type GenetekaQuery = {
  kind: GenetekaKind;
  lastname: string;
  name?: string | null;
  lastname2?: string | null;
  name2?: string | null;
  fromYear?: number | null;
  toYear?: number | null;
  region?: GenetekaRegion | null;
  /** Identyfikator parafii w Genetece (parametr rid); brak = wszystkie miejscowości. */
  parishId?: string | null;
  /** Szukaj pary – obie osoby w jednym akcie (np. ślub rodziców). */
  pair?: boolean;
};

export function buildGenetekaUrl(q: GenetekaQuery): string {
  const p = new URLSearchParams({
    op: "gt",
    lang: "pol",
    bdm: q.kind,
    w: q.region ?? "",
    rid: q.parishId ?? q.kind,
    search_lastname: q.lastname.trim(),
    search_name: q.name?.trim() ?? "",
    search_lastname2: q.lastname2?.trim() ?? "",
    search_name2: q.name2?.trim() ?? "",
    from_date: q.fromYear ? String(q.fromYear) : "",
    to_date: q.toYear ? String(q.toYear) : "",
  });
  if (q.pair && (q.lastname2 || q.name2)) p.set("pair", "1");
  return `${GENETEKA_BASE}?${p.toString()}`;
}

// ─────────────────── Rozpoznawanie województwa z opisu miejsca ───────────────────

function fold(s: string) {
  return s
    .toLocaleLowerCase("pl")
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Słowa kluczowe (bez polskich znaków) → województwo w Genetece. */
const REGION_KEYWORDS: [GenetekaRegion, string[]][] = [
  ["71wa", ["warszawa"]],
  ["01ds", ["dolnoslask", "wroclaw", "legnic", "walbrzych", "jelenia gora"]],
  ["02kp", ["kujawsko", "bydgosz", "torun", "wloclaw", "inowroclaw", "grudziadz"]],
  ["03lb", ["lubelsk", "lublin", "chelm", "zamosc", "biala podlaska", "krasnystaw", "hrubiesz", "tomaszow lubelski", "janow lubelski", "pulaw"]],
  ["04ls", ["lubusk", "zielona gora", "gorzow"]],
  ["05ld", ["lodzk", "lodz", "piotrkow", "sieradz", "skierniewic", "lowicz", "radomsko", "wielun", "leczyc"]],
  ["06mp", ["malopolsk", "krakow", "tarnow", "nowy sacz", "wadowic", "bochni", "myslenic", "olkusz", "miechow"]],
  ["07mz", ["mazowieck", "radom", "plock", "siedlce", "siedleck", "ostroleka", "ciechanow", "plonsk", "plonsk", "grojec", "pultusk", "sochaczew", "garwolin", "wegrow", "sokolow podlaski", "przasnysz", "mlawa"]],
  ["08op", ["opolsk", "opole", "nysa", "kluczbork", "raciborz"]],
  ["09pk", ["podkarpack", "rzeszow", "przemysl", "krosno", "sanok", "jaslo", "tarnobrzeg", "mielec", "jaroslaw", "lancut"]],
  ["10pl", ["podlask", "bialystok", "lomz", "suwalk", "augustow", "grajewo", "kolno", "wysokie mazowieckie", "bielsk podlaski"]],
  ["11pm", ["pomorsk", "gdansk", "gdynia", "slupsk", "kartuz", "koscierz", "starogard", "tczew", "chojnic"]],
  ["12sl", ["slask", "katowic", "czestochow", "bielsko", "gliwic", "rybnik", "zawiercie", "bedzin", "sosnowiec", "lubliniec"]],
  ["13sk", ["swietokrzysk", "kielec", "kielce", "jedrzejow", "pinczow", "busko", "buski", "opatow", "sandomierz", "staszow", "wloszczow", "konsk", "ostrowiec", "starachowic", "skarzysk", "kazimierza wielka", "checin"]],
  ["14wm", ["warminsko", "olsztyn", "elblag", "elk", "gizycko", "mragowo", "szczytno", "ostroda"]],
  ["15wp", ["wielkopolsk", "poznan", "kalisz", "kalisk", "konin", "leszno", "pila", "gniezno", "ostrow wielkopolski", "turek", "kolo", "slupca"]],
  ["16zp", ["zachodniopomorsk", "szczecin", "koszalin", "stargard", "kolobrzeg"]],
  ["21uk", ["ukraina", "lwow", "lwowsk", "tarnopol", "stanislaw", "wolyn", "wolynsk", "rowne", "luck", "zytomierz", "kijow", "podole", "podolsk"]],
  ["22br", ["bialorus", "grodno", "grodzien", "nowogrod", "brzesc", "pinsk", "minsk", "witebsk", "mohylew", "polesie", "polesk"]],
  ["23lt", ["litwa", "wilno", "wilensk", "kowno", "kowiensk", "troki"]],
];

/** Województwo Geneteki na podstawie miejscowości i opisu regionu (albo null, gdy nie wiadomo). */
export function detectGenetekaRegion(...texts: (string | null | undefined)[]): GenetekaRegion | null {
  const t = fold(texts.filter(Boolean).join(" , "));
  if (!t.trim()) return null;
  // Najpierw dokładne nazwy województw (żeby „mazowieckie” nie przegrało z miastem).
  for (const [code, label] of GENETEKA_REGIONS) {
    if (code === "25po" || code === "71wa") continue;
    if (t.includes(fold(label))) return code;
  }
  for (const [code, words] of REGION_KEYWORDS) {
    if (words.some((w) => new RegExp(`(^|[^a-z])${w}`).test(t))) return code;
  }
  return null;
}
