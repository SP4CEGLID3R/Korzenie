// Algorytmy porównywania podobnie brzmiących słów.
//
// Daitch–Mokotoff Soundex – kod fonetyczny zaprojektowany dla nazwisk
// słowiańskich i żydowskich z Europy Środkowo-Wschodniej (zapis „Kowalski”
// i „Kovalsky” dają ten sam kod). Opis: https://www.avotaynu.com/soundex.htm
// Implementacja wg reguł Gary'ego Mokotoffa (z odgałęzieniami dla liter
// o dwóch możliwych wymowach, np. „ch”, „rz”, „c”).
//
// Jaro–Winkler – podobieństwo napisów 0–1, odporne na drobne literówki.

import { fold } from "./normalize";

type Codes = [start: string, beforeVowel: string, other: string];
type Rule = { pattern: string; codes: Codes[] };

const N = ""; // „nie kodujemy”

// Kolejność nie ma znaczenia – zawsze wybieramy najdłuższy pasujący wzorzec.
const RAW: [string[], Codes, Codes?][] = [
  [["ai", "aj", "ay"], ["0", "1", N]],
  [["au"], ["0", "7", N]],
  [["a"], ["0", N, N]],
  [["b"], ["7", "7", "7"]],
  [["chs"], ["5", "54", "54"]],
  [["ch"], ["5", "5", "5"], ["4", "4", "4"]],
  [["ck"], ["5", "5", "5"], ["45", "45", "45"]],
  [["csz", "czs", "cz", "cs"], ["4", "4", "4"]],
  [["c"], ["5", "5", "5"], ["4", "4", "4"]],
  [["drz", "drs"], ["4", "4", "4"]],
  [["dsh", "dsz", "ds"], ["4", "4", "4"]],
  [["dzh", "dzs", "dz"], ["4", "4", "4"]],
  [["d", "dt"], ["3", "3", "3"]],
  [["ei", "ej", "ey"], ["0", "1", N]],
  [["eu"], ["1", "1", N]],
  [["e"], ["0", N, N]],
  [["fb", "f"], ["7", "7", "7"]],
  [["g"], ["5", "5", "5"]],
  [["h"], ["5", "5", N]],
  [["ia", "ie", "io", "iu"], ["1", N, N]],
  [["i"], ["0", N, N]],
  [["j"], ["1", "1", "1"], ["4", "4", "4"]],
  [["ks"], ["5", "54", "54"]],
  [["kh", "k"], ["5", "5", "5"]],
  [["l"], ["8", "8", "8"]],
  [["mn", "nm"], ["66", "66", "66"]],
  [["m", "n"], ["6", "6", "6"]],
  [["oi", "oj", "oy"], ["0", "1", N]],
  [["o"], ["0", N, N]],
  [["pf", "ph", "p"], ["7", "7", "7"]],
  [["q"], ["5", "5", "5"]],
  [["rs", "rz"], ["94", "94", "94"], ["4", "4", "4"]],
  [["r"], ["9", "9", "9"]],
  [["schtsch", "schtsh", "schtch"], ["2", "4", "4"]],
  [["sch"], ["4", "4", "4"]],
  [["shtch", "shch", "shtsh"], ["2", "4", "4"]],
  [["sht", "scht", "schd"], ["2", "43", "43"]],
  [["sh"], ["4", "4", "4"]],
  [["stch", "stsch", "sc"], ["2", "4", "4"]],
  [["strz", "strs", "stsh"], ["2", "4", "4"]],
  [["st"], ["2", "43", "43"]],
  [["szcz", "szcs"], ["2", "4", "4"]],
  [["szt", "shd", "szd", "sd"], ["2", "43", "43"]],
  [["sz"], ["4", "4", "4"]],
  [["s"], ["4", "4", "4"]],
  [["tch", "ttch", "ttsch"], ["4", "4", "4"]],
  [["th"], ["3", "3", "3"]],
  [["trz", "trs"], ["4", "4", "4"]],
  [["tsch", "tsh"], ["4", "4", "4"]],
  [["ts", "tts", "ttsz", "tc"], ["4", "4", "4"]],
  [["tz", "ttz", "tzs", "tsz"], ["4", "4", "4"]],
  [["t"], ["3", "3", "3"]],
  [["ui", "uj", "uy"], ["0", "1", N]],
  [["u", "ue"], ["0", N, N]],
  [["v", "w"], ["7", "7", "7"]],
  [["x"], ["5", "54", "54"]],
  [["y"], ["1", N, N]],
  [["zdz", "zdzh", "zhdzh"], ["2", "4", "4"]],
  [["zd", "zhd"], ["2", "43", "43"]],
  [["zh", "zs", "zsch", "zsh"], ["4", "4", "4"]],
  [["z"], ["4", "4", "4"]],
];

const RULES: Rule[] = RAW.flatMap(([patterns, a, b]) =>
  patterns.map((pattern) => ({ pattern, codes: b ? [a, b] : [a] })),
).sort((x, y) => y.pattern.length - x.pattern.length);

const VOWELS = new Set(["a", "e", "i", "o", "u", "y"]);

/** Kody Daitch–Mokotoff (6 cyfr). Słowo może mieć kilka kodów. */
export function daitchMokotoff(word: string): string[] {
  const s = fold(word).replace(/[^a-z]/g, "");
  if (!s) return [];
  type Branch = { code: string; last: string | null };
  let branches: Branch[] = [{ code: "", last: null }];
  let i = 0;
  let prevChar = "";
  while (i < s.length) {
    const rule = RULES.find((r) => s.startsWith(r.pattern, i));
    if (!rule) {
      i++;
      continue;
    }
    const next = s[i + rule.pattern.length];
    const col = i === 0 ? 0 : next && VOWELS.has(next) ? 1 : 2;
    // „mn” / „nm” na styku liter zawsze kodujemy podwójnie.
    const force = (prevChar === "m" && rule.pattern[0] === "n") || (prevChar === "n" && rule.pattern[0] === "m");
    const nextBranches: Branch[] = [];
    for (const b of branches) {
      for (const codes of rule.codes) {
        const rep = codes[col];
        const append = b.last === null || !b.last.endsWith(rep) || force;
        nextBranches.push({ code: append && rep ? b.code + rep : b.code, last: rep });
      }
    }
    // Usuwamy duplikaty gałęzi.
    const seen = new Set<string>();
    branches = nextBranches.filter((b) => {
      const k = `${b.code}|${b.last}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    prevChar = rule.pattern[rule.pattern.length - 1];
    i += rule.pattern.length;
  }
  return [...new Set(branches.map((b) => (b.code + "000000").slice(0, 6)))];
}

export function sharesSoundex(a: string, b: string) {
  const ca = new Set(daitchMokotoff(a));
  return daitchMokotoff(b).some((c) => ca.has(c));
}

/** Podobieństwo Jaro–Winkler (1 = identyczne). */
export function jaroWinkler(a: string, b: string): number {
  const s1 = fold(a);
  const s2 = fold(b);
  if (s1 === s2) return s1 ? 1 : 0;
  if (!s1 || !s2) return 0;
  const range = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);
  const m1 = new Array<boolean>(s1.length).fill(false);
  const m2 = new Array<boolean>(s2.length).fill(false);
  let matches = 0;
  for (let i = 0; i < s1.length; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(i + range + 1, s2.length);
    for (let j = lo; j < hi; j++) {
      if (m2[j] || s1[i] !== s2[j]) continue;
      m1[i] = m2[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!m1[i]) continue;
    while (!m2[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }
  const jaro = (matches / s1.length + matches / s2.length + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && s1[prefix] === s2[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}
