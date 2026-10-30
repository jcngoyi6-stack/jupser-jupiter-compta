import type { AccountBalance, ControlResult } from './types';

/**
 * Système minimal de trésorerie — modèle officiel de l'AUDCIF (« Modèle bilan et compte de résultat du
 * système minimal de trésorerie ») :
 *  - compte de résultat : recettes et dépenses encaissées/décaissées (journal de trésorerie), solde C,
 *    corrigé des variations de stocks, de créances et de dettes d'exploitation et des dotations (G) ;
 *  - bilan : immobilisations, stocks, clients et débiteurs divers, caisse, banque / compte de l'exploitant,
 *    résultat, emprunt, fournisseurs et créditeurs divers.
 */
export interface CashEntry {
  /** contreparties de la trésorerie : montant > 0 = recette, < 0 = dépense */
  counterparts: { account: string; amount: bigint }[];
}

const sumNet = (b: AccountBalance[], re: RegExp) => b.filter((x) => re.test(x.account)).reduce((s, x) => s + x.net, 0n);
const RECEIVABLES = /^4(1|[5-7])/; // clients et débiteurs divers (soldes débiteurs)

export function buildSmtStatements(closing: AccountBalance[], cash: CashEntry[] = [], opening: AccountBalance[] = []) {
  const r = { ventes: 0n, autres: 0n };
  const d = { achats: 0n, loyers: 0n, salaires: 0n, impots: 0n, interets: 0n, autres: 0n };
  for (const e of cash) {
    for (const c of e.counterparts) {
      const a = c.account;
      if (/^(1[0-9]|2|5)/.test(a)) continue; // apports, emprunts, investissements, virements internes : hors résultat
      if (c.amount > 0n) {
        if (/^(70|41)/.test(a)) r.ventes += c.amount;
        else r.autres += c.amount;
      } else {
        const v = -c.amount;
        if (/^(60|40)/.test(a)) d.achats += v;
        else if (/^622/.test(a)) d.loyers += v;
        else if (/^(66|42)/.test(a)) d.salaires += v;
        else if (/^(64|44)/.test(a)) d.impots += v;
        else if (/^67/.test(a)) d.interets += v;
        else d.autres += v;
      }
    }
  }
  const A = r.ventes + r.autres;
  const B = Object.values(d).reduce((s, v) => s + v, 0n);
  const C = A - B;
  const stocks = (b: AccountBalance[]) => sumNet(b, /^3[0-8]/);
  const receivables = (b: AccountBalance[]) => b.filter((x) => RECEIVABLES.test(x.account) && x.net > 0n).reduce((s, x) => s + x.net, 0n);
  const payables = (b: AccountBalance[]) => -b.filter((x) => /^4/.test(x.account) && x.net < 0n).reduce((s, x) => s + x.net, 0n);
  const varStocks = stocks(closing) - stocks(opening);
  const varReceivables = receivables(closing) - receivables(opening);
  const varPayables = payables(closing) - payables(opening);
  const dotations = sumNet(closing, /^68|^69/);
  const G = C + varStocks + varReceivables - varPayables - dotations;

  const immobilisations = sumNet(closing, /^2/);
  const caisse = sumNet(closing, /^57/);
  const banque = sumNet(closing, /^5[0-6]|^5[89]/);
  const actif = { immobilisations, stocks: stocks(closing), clientsDebiteurs: receivables(closing), caisse, banque };
  const totalActif = Object.values(actif).reduce((s, v) => s + v, 0n);
  const accountingResult = -sumNet(closing, /^[678]/) - sumNet(closing, /^13/);
  const passif = {
    compteExploitant: -sumNet(closing, /^1[0-2]|^1[45]/),
    resultat: accountingResult,
    emprunt: -sumNet(closing, /^1[6-9]/),
    fournisseursCrediteurs: payables(closing),
  };
  const totalPassif = Object.values(passif).reduce((s, v) => s + v, 0n);
  const controls: ControlResult[] = [
    { code: 'SMT_EQUILIBRE', label: 'Bilan SMT équilibré', ok: totalActif === totalPassif, blocking: true },
    { code: 'SMT_RESULTAT', label: 'Résultat du compte de résultat SMT (G) = résultat du bilan', ok: G === accountingResult, detail: G === accountingResult ? undefined : `G ${G} ≠ ${accountingResult}`, blocking: false },
  ];
  return {
    recettes: r, totalRecettes: A, depenses: d, totalDepenses: B, solde: C,
    variations: { stocks: varStocks, creances: varReceivables, dettes: varPayables }, dotations, resultat: G,
    actif, passif, totalActif, totalPassif, controls,
  };
}
