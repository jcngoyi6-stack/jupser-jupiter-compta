/**
 * Démonstration FICTIVE de la comptabilité analytique : « Boulangerie de démonstration ».
 * Toutes les opérations passent par les services de l'ERP (écritures validées, inventaire permanent),
 * pour que la comptabilité générale, les stocks, la production, les ventes et la CAGE concordent.
 */
import type { INestApplicationContext } from '@nestjs/common';
import { canonicalJson, sha256 } from '@jupiter/ledger';
import { costSheet, ITEM_ACCOUNTS } from '@jupiter/operations';
import { CompanyService } from './accounting/company.service';
import { EntriesService } from './accounting/entries.service';
import { defaultSettings } from './analytics/analytics.types';
import type { SessionUser } from './auth/decorators';
import { PrismaService } from './common/prisma.service';
import { StockService } from './erp/stock.service';

const C = (cdf: number) => BigInt(Math.round(cdf * 100)); // CDF → centimes

export async function seedBoulangerie(app: INestApplicationContext, tenantId: string, u: SessionUser, uChef: SessionUser) {
  const db = app.get(PrismaService);
  const companies = app.get(CompanyService);
  const entries = app.get(EntriesService);
  const stock = app.get(StockService);
  const year = new Date().getUTCFullYear();
  const day = (d: number) => `${year}-02-${String(d).padStart(2, '0')}`;

  await db.forTenant(tenantId, async (tx) => {
    if (await tx.company.findFirst({ where: { name: 'Boulangerie de démonstration' } })) return;
    const { company } = await companies.create(tx, u, {
      name: 'Boulangerie de démonstration', legalForm: 'SARL', country: 'CD', rccm: 'CD/KNG/RCCM/00-B-00001 (fictif)', taxId: 'A0000001X (fictif)',
      nationalId: '01-000-N00001X (fictif)', address: 'Kinshasa/Limete (fictif)', sector: 'Boulangerie-pâtisserie', activity: 'ARTISANAT',
      expectedTurnover: C(900_000_000), fiscalYearStart: `${year}-01-01`, fiscalYearEnd: `${year}-12-31`, shareCapital: C(20_000_000), headcount: 18,
    });
    const cid = company.id;
    const post = async (journalCode: string, date: string, pieceRef: string, label: string, lines: { account: string; debit?: number; credit?: number; thirdPartyId?: string; analytic?: string }[]) => {
      const d = await entries.createDraft(tx, u, cid, { journalCode, date, pieceRef, label, lines: lines.map((l) => ({ account: l.account, debit: C(l.debit ?? 0), credit: C(l.credit ?? 0), thirdPartyId: l.thirdPartyId, analytic: l.analytic })) });
      await entries.validate(tx, uChef, cid, d.id);
    };
    const client = await tx.thirdParty.create({ data: { tenantId, companyId: cid, type: 'CLIENT', code: 'C-SUP', name: 'Supérette du quartier (fictive)', account: '411100', taxId: 'A9999999Z' } });
    const supplier = await tx.thirdParty.create({ data: { tenantId, companyId: cid, type: 'FOURNISSEUR', code: 'F-MIN', name: 'Minoterie fictive SARL', account: '401100' } });
    const staff = await tx.thirdParty.create({ data: { tenantId, companyId: cid, type: 'AUTRE', code: 'PERS', name: 'Personnel (rémunérations dues)', account: '422000' } });
    const wh = await tx.warehouse.create({ data: { tenantId, companyId: cid, code: 'PRINCIPAL', label: 'Dépôt principal' } });
    const item = (code: string, label: string, kind: keyof typeof ITEM_ACCOUNTS, salePrice = 0, unit = 'u') => {
      const a = ITEM_ACCOUNTS[kind]!;
      return tx.stockItem.create({ data: { tenantId, companyId: cid, code, label, unit, kind, method: 'CMUP', stockAccount: a.stock, purchaseAccount: a.purchase, salesAccount: a.sales, variationAccount: a.variation, salePrice: C(salePrice) } });
    };
    const far = await item('FAR', 'Farine de blé', 'MATIERE', 0, 'kg');
    const suc = await item('SUC', 'Sucre', 'MATIERE', 0, 'kg');
    const pain = await item('PAIN', 'Pain baguette', 'PRODUIT_FINI', 500);
    const gat = await item('GAT', 'Gâteau', 'PRODUIT_FINI', 4000);

    // Capital et achats de matières (facture fournisseur + entrée en stock)
    await post('OD', day(1), 'STATUTS', 'Capital libéré en banque', [{ account: '521100', debit: 20_000_000 }, { account: '101300', credit: 20_000_000 }]);
    await post('ACH', day(2), 'FMIN-01', 'Farine 2 000 kg et sucre 500 kg', [
      { account: '602100', debit: 4_400_000 }, { account: '445200', debit: 704_000 }, { account: '401100', credit: 5_104_000, thirdPartyId: supplier.id },
    ]);
    await stock.move(tx, u, cid, { itemId: far.id, warehouseId: wh.id, date: day(2), type: 'ENTREE', qtyMilli: 2_000_000n, unitCost: C(1500), reference: 'FMIN-01' });
    await stock.move(tx, u, cid, { itemId: suc.id, warehouseId: wh.id, date: day(2), type: 'ENTREE', qtyMilli: 500_000n, unitCost: C(2800), reference: 'FMIN-01' });

    // Nomenclatures et ordres de fabrication (poste ATE = centre Atelier)
    const bomPain = await tx.bom.create({ data: { tenantId, companyId: cid, productId: pain.id, components: [{ itemId: far.id, qtyMilli: '250' }, { itemId: suc.id, qtyMilli: '10' }], routing: [{ poste: 'ATE', minutes: 1.2, hourlyRate: C(3000).toString() }], overheadRate: '0.10' } });
    const bomGat = await tx.bom.create({ data: { tenantId, companyId: cid, productId: gat.id, components: [{ itemId: far.id, qtyMilli: '400' }, { itemId: suc.id, qtyMilli: '200' }], routing: [{ poste: 'ATE', minutes: 6, hourlyRate: C(3000).toString() }], overheadRate: '0.10' } });
    let n = 0;
    const workOrder = async (bom: typeof bomPain, qty: number, date: string) => {
      const comps = (bom.components as { itemId: string; qtyMilli: string }[]).map((c) => ({ itemId: c.itemId, qtyMilli: BigInt(c.qtyMilli) }));
      const costs = new Map<string, bigint>();
      for (const c of comps) costs.set(c.itemId, (await stock.valuation(tx, c.itemId)).unitCost);
      const routing = (bom.routing as { poste: string; minutes: number; hourlyRate: string }[]).map((r) => ({ ...r, hourlyRate: BigInt(r.hourlyRate) }));
      const q = BigInt(qty * 1000);
      const sheet = costSheet(comps, routing, q, (id) => costs.get(id) ?? 0n, bom.overheadRate);
      const number = `OF-${year}-${String(++n).padStart(5, '0')}`;
      for (const c of comps) await stock.move(tx, u, cid, { itemId: c.itemId, warehouseId: wh.id, date, type: 'CONSOMMATION', qtyMilli: -(c.qtyMilli * q) / 1000n, reference: number });
      await stock.move(tx, u, cid, { itemId: bom.productId, warehouseId: wh.id, date, type: 'PRODUCTION', qtyMilli: q, unitCost: sheet.unitCost, reference: number });
      await tx.workOrder.create({ data: { tenantId, companyId: cid, number, bomId: bom.id, qtyMilli: q, date, status: 'TERMINE', costSheet: JSON.parse(JSON.stringify(sheet, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) } });
    };
    await workOrder(bomPain, 4000, day(5));
    await workOrder(bomGat, 600, day(10));
    await workOrder(bomPain, 2000, day(15));

    // Ventes (factures + sortie de stock)
    let f = 0;
    const sale = async (it: typeof pain, qty: number, price: number, date: string) => {
      const net = C(qty * price);
      const vat = (net * 16n) / 100n;
      const number = `FV-${year}-${String(++f).padStart(5, '0')}`;
      const lines = [{ itemId: it.id, description: it.label, quantity: qty, unitPrice: C(price).toString(), net: net.toString(), vat: vat.toString(), vatRate: '0.16', vatKind: 'NORMAL', account: '702100' }];
      await post('VTE', date, number, `Vente ${it.label}`, [{ account: '411100', debit: Number(net + vat) / 100, thirdPartyId: client.id }, { account: '702100', credit: Number(net) / 100 }, { account: '443100', credit: Number(vat) / 100 }]);
      await tx.salesDocument.create({ data: { tenantId, companyId: cid, type: 'FACTURE', number, date, thirdPartyId: client.id, lines, totalNet: net, totalVat: vat, totalGross: net + vat, currency: 'CDF', hash: sha256(canonicalJson({ cid, number, date, lines })), einvoice: { mode: 'SIMULATION' } } });
      await stock.move(tx, u, cid, { itemId: it.id, warehouseId: wh.id, date, type: 'SORTIE', qtyMilli: -BigInt(qty * 1000), reference: number });
    };
    await sale(pain, 3000, 500, day(12));
    await sale(gat, 550, 4000, day(18));
    await sale(pain, 2500, 500, day(25));

    // Main-d'œuvre et charges indirectes (certaines portent un code analytique de centre)
    await post('OD', day(28), 'PAIE-02', 'Salaires de février', [
      { account: '661100', debit: 540_000 }, { account: '661200', debit: 1_200_000 }, { account: '422000', credit: 1_740_000, thirdPartyId: staff.id },
    ]);
    const charge = (account: string, amount: number, ref: string, label: string, analytic?: string) => post('BQ1', day(20), ref, label, [{ account, debit: amount, analytic }, { account: '521100', credit: amount }]);
    await charge('622200', 800_000, 'LOY-02', 'Loyer du fournil');
    await charge('605200', 450_000, 'SNEL-02', 'Électricité du four', 'ATE');
    await charge('605100', 60_000, 'EAU-02', 'Eau');
    await charge('624100', 150_000, 'ENT-02', 'Entretien du four', 'ENT');
    await charge('612000', 200_000, 'TRS-02', 'Livraisons aux clients', 'DIS');
    await charge('627100', 120_000, 'PUB-02', 'Publicité radio', 'DIS');
    await charge('628100', 50_000, 'TEL-02', 'Téléphone');
    await charge('641100', 100_000, 'IMP-02', 'Impôts et taxes');
    await charge('681300', 300_000, 'DOT-02', 'Dotation aux amortissements du four');
    await charge('647100', 50_000, 'PEN-02', 'Pénalité fiscale (non incorporable)');
    await charge('812000', 30_000, 'HAO-02', 'Valeur comptable d’un matériel cédé (HAO)');

    // Paramétrage analytique et budget par centre
    const s = defaultSettings();
    s.keys.push({ prefix: '6612', label: 'Primes du personnel indirect', shares: { ADM: 60, DIS: 40 } });
    s.rules.overrides = { '647100': 'NON_INCORPORABLE' };
    s.supplementary = { equityRate: 0.12, ownerAnnual: 0, centre: 'ADM' };
    s.standards = { prices: { FAR: 1450, SUC: 2800 }, hourlyRates: { ATE: 3000 } };
    await tx.analyticConfig.create({ data: { tenantId, companyId: cid, settings: s as never, updatedBy: uChef.userId } });
    const fy = await tx.fiscalYear.findFirstOrThrow({ where: { companyId: cid } });
    for (const [analytic, amount] of [['ADM', 12_000_000], ['ENT', 2_000_000], ['APP', 1_500_000], ['ATE', 9_000_000], ['DIS', 4_500_000]] as const) {
      await tx.budgetLine.create({ data: { tenantId, companyId: cid, fiscalYearId: fy.id, version: 'INITIAL', prefix: '6', analytic, label: `Charges du centre ${analytic}`, amount: C(amount) } });
    }
  });
}
