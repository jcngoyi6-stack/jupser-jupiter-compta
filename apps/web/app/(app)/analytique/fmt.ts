/** Formatage des montants analytiques (nombres) selon les décimales de la devise. */
export const num = (v: number | null | undefined, dec = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const qty = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: 3 }));
export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${(v * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`);
export const n = (s: string | number) => Number(String(s).replace(/\s/g, '').replace(',', '.')) || 0;
