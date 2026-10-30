import { countryPackRules, rdcSeedRules, type CountryRef } from '@jupiter/tax-engine';
import { readData } from './data';
import type { PrismaService } from './prisma.service';

/** Charge les règles fiscales de départ des 17 pays (A_VALIDER) si elles sont absentes. */
export async function seedTaxRules(db: PrismaService): Promise<number> {
  const countries = (JSON.parse(readData('pays_ohada_referentiel.json')) as { pays: CountryRef[] }).pays;
  const rules = [...rdcSeedRules(), ...countryPackRules(countries).filter((r) => r.country !== 'CD') /* RDC : pack détaillé */];
  // Présence → paie : paramètres légaux à saisir par le fiscaliste / juriste social de chaque pays
  for (const c of countries) {
    const base = { country: c.code, status: 'A_VALIDER' as const, effectiveFrom: '2026-01-01' };
    rules.push(
      { ...base, tax: 'PRESENCE', param: 'majoration_hs_pct', value: null, legalRef: `TODO(juriste social) : majoration des heures supplémentaires — Code du travail ${c.nom}` },
      { ...base, tax: 'PRESENCE', param: 'heures_mensuelles', value: null, legalRef: `TODO(juriste social) : durée légale mensuelle du travail — ${c.nom}` },
      { ...base, tax: 'PRESENCE', param: 'retenue_retards', value: false, legalRef: 'Choix de l’entreprise (règlement intérieur)' },
    );
  }
  let n = 0;
  for (const r of rules) {
    const exists = await db.client.taxRule.findFirst({ where: { country: r.country, tax: r.tax, param: r.param, effectiveFrom: r.effectiveFrom } });
    if (exists) continue;
    await db.client.taxRule.create({ data: { ...r, value: (r.value ?? null) as never, effectiveTo: r.effectiveTo ?? null } });
    n++;
  }
  return n;
}
