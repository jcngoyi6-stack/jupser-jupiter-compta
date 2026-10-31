import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { decimalsOf } from '@jupiter/ledger';
import { CATALOGUE, findOperation, INTERCOMPANY_KINDS, intercompanyOperation, runOperation, scaleAmounts, toJson, type OpEntry, type OpResult } from '@jupiter/special-ops';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { EntriesService } from '../accounting/entries.service';
import { ACCOUNTING_WRITE, CurrentUser, RequiresModule, Roles, type SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { domainError, parse, zDate } from '../common/http';
import { PrismaService, type Tx } from '../common/prisma.service';

/**
 * Opérations spécifiques du guide d'application (location-acquisition, emprunts obligataires, fusions,
 * réévaluation, subventions…) : calcul, aperçu des écritures, puis création en brouillon. Rien n'est validé
 * sans un humain ; les écritures « chez l'autre partie » sont restituées pour information.
 */
@ApiTags('Opérations spécifiques')
@RequiresModule('COMPTABILITE')
@Controller('companies/:companyId/special-ops')
export class SpecialOpsController {
  constructor(private readonly db: PrismaService, private readonly entries: EntriesService, private readonly audit: AuditService) {}

  /** Catalogue ; les exemples (chiffres du guide, en francs) sont convertis dans les unités mineures de la devise du dossier. */
  @Get()
  catalogue(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const factor = 10n ** BigInt(decimalsOf((await tx.company.findUniqueOrThrow({ where: { id: companyId } })).currency));
      return CATALOGUE.map((c) => ({ id: c.id, label: c.label, chapter: c.chapter, applications: c.applications, example: toJson(scaleAmounts(c.example, factor)) }));
    });
  }

  private compute(op: string, params: unknown): OpResult {
    if (!findOperation(op)) throw domainError('OPERATION_INCONNUE', 'Opération spécifique inconnue.');
    try {
      return runOperation(op, params);
    } catch (e) {
      throw domainError('PARAMETRES_INVALIDES', `Paramètres invalides : ${(e as Error).message}`);
    }
  }

  private async missingAccounts(tx: Tx, companyId: string, r: OpResult | OpEntry[]) {
    const list = Array.isArray(r) ? r : r.entries;
    const used = [...new Set(list.flatMap((e) => e.lines.map((l) => l.account)))];
    const found = new Set((await tx.account.findMany({ where: { companyId, number: { in: used } }, select: { number: true } })).map((a) => a.number));
    return used.filter((a) => !found.has(a));
  }

  @Post(':op/preview')
  preview(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('op') op: string, @Body() body: unknown) {
    const b = parse(z.object({ params: z.record(z.string(), z.unknown()) }), body);
    const r = this.compute(op, b.params);
    return this.db.forTenant(u.tenantId, async (tx) => ({ ...(toJson(r) as object), missingAccounts: await this.missingAccounts(tx, companyId, r) }));
  }

  @Post(':op/drafts')
  @Roles(...ACCOUNTING_WRITE)
  drafts(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Param('op') op: string, @Body() body: unknown) {
    const b = parse(z.object({
      params: z.record(z.string(), z.unknown()),
      journalCode: z.string().min(1).max(10).default('OD'),
      defaultDate: zDate.optional(),
      pieceRef: z.string().max(40).optional(),
      only: z.array(z.number().int().min(0)).optional(),
      counterpartCompanyId: z.string().uuid().optional(),
    }), body);
    const r = this.compute(op, b.params);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const missing = await this.missingAccounts(tx, companyId, r);
      if (missing.length) throw domainError('COMPTES_ABSENTS', `Comptes absents du plan du dossier : ${missing.join(', ')}.`, { missing });
      const selected = r.entries.map((e, i) => ({ e, i })).filter(({ i }) => !b.only || b.only.includes(i));
      const created = [];
      for (const { e, i } of selected) {
        const date = e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : b.defaultDate;
        if (!date) throw domainError('DATE_MANQUANTE', `Écriture n° ${i + 1} sans date : renseignez une date par défaut.`);
        created.push(await this.entries.createDraft(tx, u, companyId, {
          journalCode: b.journalCode, date, pieceRef: `${b.pieceRef ?? `OS-${op}`}-${i + 1}`.slice(0, 40), label: e.label.slice(0, 200),
          lines: e.lines.map((l) => ({ account: l.account, debit: l.debit, credit: l.credit, label: l.label ?? e.label.slice(0, 200) })),
        }, 'OPERATION_SPECIFIQUE'));
      }
      // Écritures de l'autre partie passées en brouillon dans la société du groupe désignée
      const counterpartCreated = [];
      if (b.counterpartCompanyId && r.counterpartEntries?.length) {
        await this.assertSister(tx, u, companyId, b.counterpartCompanyId);
        const miss = await this.missingAccounts(tx, b.counterpartCompanyId, r.counterpartEntries);
        if (miss.length) throw domainError('COMPTES_ABSENTS', `Comptes absents du plan de la société liée : ${miss.join(', ')}.`, { missing: miss });
        for (const [i, e] of r.counterpartEntries.entries()) {
          const date = e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : b.defaultDate;
          if (!date) throw domainError('DATE_MANQUANTE', `Écriture liée n° ${i + 1} sans date : renseignez une date par défaut.`);
          counterpartCreated.push(await this.entries.createDraft(tx, u, b.counterpartCompanyId, {
            journalCode: b.journalCode, date, pieceRef: `${b.pieceRef ?? `OS-${op}`}-L${i + 1}`.slice(0, 40), label: e.label.slice(0, 200),
            lines: e.lines.map((l) => ({ account: l.account, debit: l.debit, credit: l.credit, label: l.label ?? e.label.slice(0, 200) })),
          }, 'OPERATION_SPECIFIQUE'));
        }
      }
      await this.audit.log(tx, u.tenantId, u.userId, 'OPERATION_SPECIFIQUE', `company:${companyId}`, { op, entries: created.length, counterpart: counterpartCreated.length });
      return { created: created.length, entries: created, counterpartCreated, counterpartEntries: toJson(r.counterpartEntries ?? []), notes: r.notes ?? [] };
    });
  }

  /** Société liée : même locataire (garanti par la sécurité au niveau des lignes) et accessible à l'utilisateur. */
  private async assertSister(tx: Tx, u: SessionUser, companyId: string, target: string) {
    if (target === companyId) throw domainError('SOCIETE_IDENTIQUE', 'Choisissez une autre société du groupe.');
    if (u.companyIds.length > 0 && !u.companyIds.includes(target)) throw domainError('SOCIETE_NON_AUTORISEE', 'Vous n’avez pas accès à la société liée.');
    if (!(await tx.company.findUnique({ where: { id: target } }))) throw domainError('SOCIETE_INCONNUE', 'Société liée introuvable.');
  }

  /**
   * Opération intragroupe : écritures de la société émettrice et écritures miroirs de la société réceptrice, créées
   * ensemble en brouillon avec une référence commune ; comptes groupe éliminés en consolidation.
   */
  @Post('intercompany')
  @Roles(...ACCOUNTING_WRITE)
  intercompany(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({
      targetCompanyId: z.string().uuid(), kind: z.enum(INTERCOMPANY_KINDS), amount: z.string().regex(/^\d+$/), date: zDate,
      label: z.string().max(200).optional(), vatRate: z.number().min(0).max(1).optional(),
      revenueAccount: z.string().regex(/^\d{6}$/).optional(), expenseAccount: z.string().regex(/^\d{6}$/).optional(), journalCode: z.string().min(1).max(10).default('OD'),
    }), body);
    const r = intercompanyOperation({ ...b, amount: BigInt(b.amount) });
    return this.db.forTenant(u.tenantId, async (tx) => {
      await this.assertSister(tx, u, companyId, b.targetCompanyId);
      for (const [cid, list] of [[companyId, r.entries], [b.targetCompanyId, r.counterpartEntries!]] as const) {
        const miss = await this.missingAccounts(tx, cid, list);
        if (miss.length) throw domainError('COMPTES_ABSENTS', `Comptes absents du plan : ${miss.join(', ')}.`, { missing: miss, companyId: cid });
      }
      const ref = randomBytes(3).toString('hex').toUpperCase();
      // Tiers « société du groupe » créé une fois dans chaque dossier (client 4112, fournisseur 4012)
      const sisterParty = async (cid: string, other: string, account: string) => {
        const client = account.startsWith('41');
        const code = `GRP-${client ? 'C' : 'F'}-${other.slice(0, 8)}`;
        const found = await tx.thirdParty.findUnique({ where: { companyId_code: { companyId: cid, code } } });
        if (found) return found.id;
        const name = (await tx.company.findUniqueOrThrow({ where: { id: other } })).name;
        return (await tx.thirdParty.create({ data: { tenantId: u.tenantId, companyId: cid, type: client ? 'CLIENT' : 'FOURNISSEUR', code, name: `${name} (groupe)`, account } })).id;
      };
      const post = async (cid: string, other: string, e: OpEntry) => this.entries.createDraft(tx, u, cid, {
        journalCode: b.journalCode, date: b.date, pieceRef: `IG-${other.slice(0, 8)}-${ref}`, label: e.label.slice(0, 200),
        lines: await Promise.all(e.lines.map(async (l) => ({
          account: l.account, debit: l.debit, credit: l.credit, label: e.label.slice(0, 200),
          ...(/^4[01]12/.test(l.account) ? { thirdPartyId: await sisterParty(cid, other, l.account) } : {}),
        }))),
      }, 'INTRAGROUPE');
      const issuer = await post(companyId, b.targetCompanyId, r.entries[0]!);
      const receiver = await post(b.targetCompanyId, companyId, r.counterpartEntries![0]!);
      await this.audit.log(tx, u.tenantId, u.userId, 'OPERATION_INTRAGROUPE', `company:${companyId}`, { kind: b.kind, target: b.targetCompanyId, ref });
      return { reference: ref, issuer, receiver };
    });
  }
}
