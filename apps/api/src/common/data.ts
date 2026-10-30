import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Localise le dossier `data/` du dépôt (référentiels livrés par JUPSER). */
export function dataPath(file: string): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const p = join(dir, 'data', file);
    if (existsSync(p)) return p;
    dir = dirname(dir);
  }
  throw new Error(`Fichier de référence introuvable : data/${file}`);
}

export function readData(file: string): string {
  return readFileSync(dataPath(file), 'utf8');
}

interface CountryRef {
  code: string;
  nom: string;
  devise: string;
  banque_centrale: string;
  statut: string;
}

let countries: CountryRef[] | null = null;
export function countryRefs(): CountryRef[] {
  countries ??= (JSON.parse(readData('pays_ohada_referentiel.json')) as { pays: CountryRef[] }).pays;
  return countries;
}

/** Monnaie ayant cours légal, imposée comme devise de tenue (docs/12). */
export function legalCurrency(country: string): string {
  const c = countryRefs().find((x) => x.code === country);
  if (!c) throw new Error(`Pays non couvert : ${country}`);
  return c.devise.split(/[\s(]/)[0]!;
}
