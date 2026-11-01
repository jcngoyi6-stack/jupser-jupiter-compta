import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import Anthropic from '@anthropic-ai/sdk';
import { acceptAction, MockLlmProvider, OCR_MEDIA_TYPES, OCR_PROMPT, parseOcrResponse, proposePurchaseEntry, redact, suggestAccounts, SYSTEM_PROMPT, type LlmMessage, type LlmProvider } from '@jupiter/ai';
import { decimalsOf } from '@jupiter/ledger';
import { z } from 'zod';
import { EntriesService } from '../accounting/entries.service';
import { ACCOUNTING_WRITE, CurrentUser, RequiresModule, Roles, type SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { config } from '../common/config';
import { domainError, parse, zAccount, zAmount, zDate } from '../common/http';
import { PrismaService } from '../common/prisma.service';

/** Fournisseur Claude (API Anthropic), appelé côté serveur uniquement : la clé ne quitte jamais l'API. */
class ClaudeProvider implements LlmProvider {
  private readonly client = new Anthropic({ apiKey: config.anthropicKey! });
  async complete(system: string, messages: LlmMessage[]): Promise<string> {
    const r = await this.client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system,
      messages,
    });
    if (r.stop_reason === 'refusal') return "Je ne peux pas répondre à cette demande. Reformulez-la ou contactez votre expert-comptable.";
    return r.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  }

  /** Lecture d'une photo ou d'un PDF (vision). */
  async read(prompt: string, mediaType: string, base64: string): Promise<string> {
    const source = { type: 'base64' as const, media_type: mediaType, data: base64 };
    const block = mediaType === 'application/pdf' ? { type: 'document' as const, source } : { type: 'image' as const, source };
    const r = await this.client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: [block as never, { type: 'text', text: prompt }] }],
    });
    return r.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  }
}

@ApiTags('Jupiter IA')
@RequiresModule('IA_GUIDE')
@Controller('ai')
export class AiController {
  private readonly llm: LlmProvider = config.anthropicKey ? new ClaudeProvider() : new MockLlmProvider();
  /** Lecteur de pièces remplaçable (tests) ; null hors ligne. */
  static reader: ((prompt: string, mediaType: string, base64: string) => Promise<string>) | null = null;
  private get ocrReader() {
    return AiController.reader ?? (this.llm instanceof ClaudeProvider ? this.llm.read.bind(this.llm) : null);
  }

  constructor(
    private readonly db: PrismaService,
    private readonly entries: EntriesService,
    private readonly audit: AuditService,
  ) {}

  private async consumeCredit(tenantId: string) {
    const t = await this.db.client.tenant.updateMany({ where: { id: tenantId, aiCredits: { gt: 0 } }, data: { aiCredits: { decrement: 1 } } });
    if (t.count === 0) throw new ForbiddenException({ code: 'CREDITS_IA', message: 'Crédits Jupiter IA épuisés pour cette période.' });
  }

  /** Mode « Guide » : questions en langage naturel, réponses avec renvoi à l'AUDCIF. */
  @Post('ask')
  @HttpCode(200)
  async ask(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const b = parse(z.object({ question: z.string().min(2).max(4000), companyId: z.string().uuid().optional(), history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) })).max(20).default([]) }), body);
    await this.consumeCredit(u.tenantId);
    const known = b.companyId
      ? new Set((await this.db.forTenant(u.tenantId, (tx) => tx.account.findMany({ where: { companyId: b.companyId }, select: { number: true } }))).map((a) => a.number))
      : new Set<string>();
    const answer = await this.llm.complete(SYSTEM_PROMPT, [...b.history, { role: 'user', content: redact(b.question) }]);
    await this.db.forTenant(u.tenantId, (tx) => this.audit.log(tx, u.tenantId, u.userId, 'IA_QUESTION', 'ai:ask', { chars: b.question.length }));
    return { answer, suggestions: suggestAccounts(b.question, known), mode: config.anthropicKey ? 'claude' : 'hors-ligne' };
  }

  /** OCR d'une pièce (photo, PDF) : champs lus par vision, fournisseur reconnu, compte de charge suggéré. */
  @Roles(...ACCOUNTING_WRITE, 'CAISSIER')
  @Post('companies/:companyId/ocr')
  @HttpCode(200)
  async ocr(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    const b = parse(z.object({ base64: z.string().min(10).max(14_000_000), mediaType: z.enum(OCR_MEDIA_TYPES), fileName: z.string().max(200).optional() }), body);
    const reader = this.ocrReader;
    if (!reader) throw domainError('OCR_INDISPONIBLE', 'Lecture automatique indisponible hors ligne (clé API Claude non configurée) : saisissez la pièce manuellement.');
    await this.consumeCredit(u.tenantId);
    const company = await this.db.forTenant(u.tenantId, (tx) => tx.company.findUniqueOrThrow({ where: { id: companyId } }));
    let r;
    try {
      r = parseOcrResponse(await reader(OCR_PROMPT, b.mediaType, b.base64), company.currency);
    } catch (e) {
      throw domainError((e as Error).message === 'OCR_REPONSE_ILLISIBLE' ? 'OCR_REPONSE_ILLISIBLE' : 'OCR_ECHEC', 'La pièce n’a pas pu être lue : saisie manuelle requise.');
    }
    return this.db.forTenant(u.tenantId, async (tx) => {
      const suppliers = await tx.thirdParty.findMany({ where: { companyId, type: 'FOURNISSEUR' } });
      const norm = (x: string | null | undefined) => (x ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const supplier = suppliers.find((s) => r.supplierTaxId && norm(s.taxId) === norm(r.supplierTaxId)) ?? suppliers.find((s) => r.supplierName && norm(s.name) === norm(r.supplierName)) ?? null;
      const known = new Set((await tx.account.findMany({ where: { companyId, imputable: true }, select: { number: true } })).map((a) => a.number));
      await this.audit.log(tx, u.tenantId, u.userId, 'IA_OCR', `company:${companyId}`, { fileName: b.fileName, confidence: r.confidence });
      return { ...r, supplier: supplier && { id: supplier.id, name: supplier.name }, suggestions: suggestAccounts(`${r.description ?? ''} ${r.supplierName ?? ''}`, known), status: 'A_VERIFIER' };
    });
  }

  /** Pièce → écriture : propose une écriture au statut BROUILLON_IA (jamais validée sans action humaine). */
  @Roles(...ACCOUNTING_WRITE)
  @Post('companies/:companyId/purchase-proposal')
  async propose(@CurrentUser() u: SessionUser, @Param('companyId') companyId: string, @Body() body: unknown) {
    await this.consumeCredit(u.tenantId);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const dec = decimalsOf(company.currency);
      const b = parse(
        z.object({
          supplierThirdPartyId: z.string().uuid(),
          date: zDate,
          number: z.string().min(1),
          netAmount: zAmount(dec),
          vatAmount: zAmount(dec),
          grossAmount: zAmount(dec),
          description: z.string().default(''),
          expenseAccount: zAccount.optional(),
          confidence: z.number().min(0).max(1).default(0.9),
        }),
        body,
      );
      const supplier = await tx.thirdParty.findFirst({ where: { id: b.supplierThirdPartyId, companyId } });
      if (!supplier) throw domainError('FOURNISSEUR_INCONNU', 'Fournisseur introuvable.');
      const known = new Set((await tx.account.findMany({ where: { companyId, imputable: true }, select: { number: true } })).map((a) => a.number));
      const expense = b.expenseAccount ?? suggestAccounts(b.description, known)[0]?.account;
      const p = proposePurchaseEntry({ supplierName: supplier.name, date: b.date, number: b.number, netAmount: b.netAmount, vatAmount: b.vatAmount, grossAmount: b.grossAmount, currency: company.currency, expenseAccount: expense, confidence: b.confidence }, supplier.id, 'ACH');
      p.lines = p.lines.map((l) => (l.account === '401100' ? { ...l, account: supplier.account } : l));
      const draft = await this.entries.createDraft(tx, { ...u, userId: u.userId }, companyId, { journalCode: p.journalCode, date: p.date, pieceRef: p.pieceRef, label: p.label, lines: p.lines }, 'IA', true);
      const action = await tx.aiAction.create({
        data: { tenantId: u.tenantId, companyId, tool: 'propose_purchase_entry', params: { number: b.number }, result: { entryId: draft.id, warnings: p.warnings, confidence: p.confidence }, userId: u.userId },
      });
      return { action, entry: draft, warnings: p.warnings };
    });
  }

  @Get('actions')
  actions(@CurrentUser() u: SessionUser) {
    return this.db.forTenant(u.tenantId, (tx) => tx.aiAction.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }));
  }

  /** Acceptation par un humain habilité : l'écriture passe les contrôles normaux puis est validée. */
  @Roles(...ACCOUNTING_WRITE)
  @Post('actions/:id/accept')
  @HttpCode(200)
  accept(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const a = await tx.aiAction.findUniqueOrThrow({ where: { id } });
      acceptAction({ tool: a.tool, status: a.status as 'PROPOSE' }, u.userId);
      const entryId = (a.result as { entryId: string }).entryId;
      const v = await this.entries.validate(tx, u, a.companyId!, entryId);
      await tx.aiAction.update({ where: { id }, data: { status: 'ACCEPTE', decidedBy: u.userId, decidedAt: new Date() } });
      await this.audit.log(tx, u.tenantId, u.userId, 'IA_ACTION_ACCEPTEE', `ai_action:${id}`, { entry: v.entry.number });
      return v;
    });
  }

  @Roles(...ACCOUNTING_WRITE)
  @Post('actions/:id/reject')
  @HttpCode(200)
  reject(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const a = await tx.aiAction.findUniqueOrThrow({ where: { id } });
      if (a.status !== 'PROPOSE') throw domainError('DEJA_TRAITEE', 'Action déjà traitée.');
      const entryId = (a.result as { entryId: string }).entryId;
      await this.entries.deleteDraft(tx, u, a.companyId!, entryId);
      await tx.aiAction.update({ where: { id }, data: { status: 'REJETE', decidedBy: u.userId, decidedAt: new Date() } });
      await this.audit.log(tx, u.tenantId, u.userId, 'IA_ACTION_REJETEE', `ai_action:${id}`);
      return { rejected: true };
    });
  }
}
