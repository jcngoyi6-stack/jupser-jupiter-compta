/**
 * Exercice : 12 mois, année civile par défaut (docs/12). Premier exercice plus court ou plus long
 * selon la date de création — TODO(expert-comptable) : confirmer les bornes exactes de l'AUDCIF
 * (pratique retenue ici : création après le 30 juin → premier exercice clos le 31/12 de l'année suivante).
 */
export function proposeFirstFiscalYear(creationDate: string): { start: string; end: string; months: number } {
  const [y, m] = creationDate.split('-').map(Number) as [number, number];
  const endYear = m > 6 ? y + 1 : y;
  const months = (endYear - y) * 12 + (12 - m + 1);
  return { start: creationDate, end: `${endYear}-12-31`, months };
}

export function monthlyPeriods(start: string, end: string): { start: string; end: string; label: string }[] {
  const out: { start: string; end: string; label: string }[] = [];
  let [y, m] = start.split('-').map(Number) as [number, number];
  const startDay = start;
  for (;;) {
    const first = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const last = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    out.push({
      start: first < startDay ? startDay : first,
      end: last > end ? end : last,
      label: `${String(m).padStart(2, '0')}/${y}`,
    });
    if (last >= end) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
