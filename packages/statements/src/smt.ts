import type { AccountBalance, ControlResult } from './types';

/**
 * Système minimal de trésorerie (art. 13 AUDCIF) : bilan et compte de résultat SMT, établis à partir
 * des soldes (journal de trésorerie + inventaire de fin d'exercice des créances, dettes et stocks).
 * TODO(expert-comptable, L2) : confronter libellés et ordre aux modèles SMT de l'AUDCIF.
 */
const sumNet = (b: AccountBalance[], re: RegExp) => b.filter((x) => re.test(x.account)).reduce((s, x) => s + x.net, 0n);

export function buildSmtStatements(balances: AccountBalance[]) {
  const recettes = {
    ventes: -sumNet(balances, /^70/),
    autres: -sumNet(balances, /^7[1-9]|^8[2468]/),
  };
  const depenses = {
    achats: sumNet(balances, /^60(?!3)/),
    variationStocks: sumNet(balances, /^603/),
    chargesExternes: sumNet(balances, /^6[123]/),
    impots: sumNet(balances, /^64/),
    personnel: sumNet(balances, /^66/),
    autres: sumNet(balances, /^6[57-9]|^8[13579]/),
  };
  const totalRecettes = recettes.ventes + recettes.autres;
  const totalDepenses = Object.values(depenses).reduce((s, v) => s + v, 0n);
  const resultat = totalRecettes - totalDepenses;

  const actif = {
    immobilisations: sumNet(balances, /^2/),
    stocks: sumNet(balances, /^3/),
    creances: balances.filter((b) => /^4/.test(b.account) && b.net > 0n).reduce((s, b) => s + b.net, 0n),
    tresorerie: balances.filter((b) => /^5/.test(b.account) && b.net > 0n).reduce((s, b) => s + b.net, 0n),
  };
  const passif = {
    capital: -sumNet(balances, /^1[0-2]|^1[4-5]/),
    resultat: resultat - sumNet(balances, /^13/),
    emprunts: -sumNet(balances, /^1[6-9]/),
    dettes: -balances.filter((b) => /^4/.test(b.account) && b.net < 0n).reduce((s, b) => s + b.net, 0n),
    tresoreriePassif: -balances.filter((b) => /^5/.test(b.account) && b.net < 0n).reduce((s, b) => s + b.net, 0n),
  };
  const totalActif = Object.values(actif).reduce((s, v) => s + v, 0n);
  const totalPassif = Object.values(passif).reduce((s, v) => s + v, 0n);
  const controls: ControlResult[] = [{ code: 'SMT_EQUILIBRE', label: 'Bilan SMT équilibré', ok: totalActif === totalPassif, blocking: true }];
  return { recettes, depenses, totalRecettes, totalDepenses, resultat, actif, passif, totalActif, totalPassif, controls };
}
