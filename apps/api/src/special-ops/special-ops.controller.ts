import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { decimalsOf } from '@jupiter/ledger';
import { CATALOGUE, findOperation, runOperation, scaleAmounts, toJson, type OpResult } from '@jupiter/special-ops';
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

  private async missingAccounts(tx: Tx, companyId: string, r: OpResult) {
    const used = [...new Set(r.entries.flatMap((e) => e.lines.map((l) => l.account)))];
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
      await this.audit.log(tx, u.tenantId, u.userId, 'OPERATION_SPECIFIQUE', `company:${companyId}`, { op, entries: created.length });
      return { created: created.length, entries: created, counterpartEntries: toJson(r.counterpartEntries ?? []), notes: r.notes ?? [] };
    });
  }
}
