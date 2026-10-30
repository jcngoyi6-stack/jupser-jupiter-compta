export interface LetterableLine {
  id: string;
  thirdPartyId: string | null;
  account: string;
  date: string;
  reference: string;
  debit: bigint;
  credit: bigint;
  letter?: string | null;
}

/** Code de lettrage suivant : A, B, …, Z, AA, AB… */
export function nextLetter(last: string | null | undefined): string {
  if (!last) return 'A';
  const chars = last.split('');
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] !== 'Z') {
      chars[i] = String.fromCharCode(chars[i]!.charCodeAt(0) + 1);
      return chars.join('');
    }
    chars[i] = 'A';
    i--;
  }
  return 'A' + chars.join('');
}

/** Un groupe ne peut être lettré que s'il est soldé (Σ D = Σ C) sur un même compte et un même tiers. */
export function canLetter(lines: LetterableLine[]): { ok: boolean; reason?: string } {
  if (lines.length < 2) return { ok: false, reason: 'Au moins deux lignes.' };
  const acc = new Set(lines.map((l) => l.account));
  const tp = new Set(lines.map((l) => l.thirdPartyId ?? ''));
  if (acc.size > 1) return { ok: false, reason: 'Lignes de comptes différents.' };
  if (tp.size > 1) return { ok: false, reason: 'Lignes de tiers différents.' };
  if (lines.some((l) => l.letter)) return { ok: false, reason: 'Ligne déjà lettrée.' };
  const net = lines.reduce((s, l) => s + l.debit - l.credit, 0n);
  if (net !== 0n) return { ok: false, reason: 'Le groupe n’est pas soldé.' };
  return { ok: true };
}

/**
 * Lettrage automatique : pour chaque débit non lettré, cherche un crédit de même montant,
 * même compte et même tiers — priorité à la même référence, puis à la date la plus proche.
 */
export function autoLetter(lines: LetterableLine[], lastLetter: string | null = null) {
  const open = lines.filter((l) => !l.letter);
  const used = new Set<string>();
  const groups: { letter: string; ids: string[] }[] = [];
  let letter = lastLetter;
  const debits = open.filter((l) => l.debit > 0n).sort((a, b) => a.date.localeCompare(b.date));
  for (const d of debits) {
    const candidates = open.filter(
      (c) =>
        !used.has(c.id) &&
        c.credit === d.debit &&
        c.account === d.account &&
        (c.thirdPartyId ?? '') === (d.thirdPartyId ?? ''),
    );
    if (candidates.length === 0) continue;
    candidates.sort((a, b) => {
      const ra = a.reference && a.reference === d.reference ? 0 : 1;
      const rb = b.reference && b.reference === d.reference ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return Math.abs(Date.parse(a.date) - Date.parse(d.date)) - Math.abs(Date.parse(b.date) - Date.parse(d.date));
    });
    const c = candidates[0]!;
    used.add(c.id);
    used.add(d.id);
    letter = nextLetter(letter);
    groups.push({ letter, ids: [d.id, c.id] });
  }
  return groups;
}

/** Balance âgée des créances ou dettes non lettrées. */
export function agedBalance(
  lines: LetterableLine[],
  asOf: string,
  buckets: number[] = [30, 60, 90],
): Map<string, bigint[]> {
  const res = new Map<string, bigint[]>();
  for (const l of lines.filter((x) => !x.letter)) {
    const key = l.thirdPartyId ?? '';
    const arr = res.get(key) ?? new Array<bigint>(buckets.length + 1).fill(0n);
    const days = Math.floor((Date.parse(asOf) - Date.parse(l.date)) / 86_400_000);
    let idx = buckets.findIndex((b) => days <= b);
    if (idx === -1) idx = buckets.length;
    arr[idx] = arr[idx]! + l.debit - l.credit;
    res.set(key, arr);
  }
  return res;
}
