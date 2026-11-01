import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sha256 } from '@jupiter/ledger';
import { z } from 'zod';
import { AllowWithoutMfa, CurrentUser, RequiresModule, type SessionUser } from '../auth/decorators';
import { AuditService } from '../common/audit.service';
import { domainError, parse, zDate } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { StorageService } from '../common/storage.service';

/** Classement automatique des pièces (GED) — règles par mots-clés ; Jupiter IA affine si configurée. */
export function classify(text: string, fileName: string): { category: string; tags: string[]; amount: bigint | null; date: string | null } {
  const t = `${fileName} ${text}`.toLowerCase();
  const rules: [RegExp, string][] = [
    [/facture|invoice|ttc|tva/, 'FACTURE_FOURNISSEUR'],
    [/relev[ée] de compte|relev[ée] bancaire|solde (créditeur|débiteur)/, 'RELEVE_BANCAIRE'],
    [/contrat|convention|avenant/, 'CONTRAT'],
    [/bulletin de paie|salaire|cnss/, 'PAIE'],
    [/d[ée]claration|dgi|imp[ôo]t|dgrad/, 'FISCAL'],
    [/re[çc]u|quittance/, 'RECU'],
    [/proc[eè]s-verbal|pv |assembl[ée]e/, 'JURIDIQUE'],
    [/courrier|lettre|objet\s*:/, 'COURRIER'],
  ];
  const category = rules.find(([re]) => re.test(t))?.[1] ?? 'DIVERS';
  const tags = [...new Set((t.match(/\b(cdf|usd|eur|xof|xaf|snel|regideso|rawbank|equity|tmb|vodacom|orange|airtel)\b/g) ?? []))];
  const am = /(?:total|montant|net à payer)[^\d]{0,20}([\d\s.,]{3,})/i.exec(text);
  let amount: bigint | null = null;
  if (am) {
    const s = am[1]!.replace(/[\s.]/g, '').replace(',', '.');
    const [i, f = ''] = s.split('.');
    if (/^\d+$/.test(i!) && /^\d*$/.test(f)) amount = BigInt(i! + (f + '00').slice(0, 2));
  }
  const dm = /(\d{2})[/.-](\d{2})[/.-](\d{4})/.exec(text);
  return { category, tags, amount, date: dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : null };
}

const RETENTION_YEARS: Record<string, number> = { FACTURE_FOURNISSEUR: 10, RELEVE_BANCAIRE: 10, PAIE: 10, FISCAL: 10, RECU: 10, CONTRAT: 10, JURIDIQUE: 10, COURRIER: 5, DIVERS: 5 };

@ApiTags('Collaboration, GED, courrier')
@RequiresModule('COLLABORATION')
@Controller('collab')
export class CollabController {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Messagerie interne ----------
  @AllowWithoutMfa()
  @Get('channels')
  channels(@CurrentUser() u: SessionUser) {
    return this.db.forTenant(u.tenantId, (tx) => tx.channel.findMany({ where: { OR: [{ isPrivate: false }, { members: { has: u.userId } }] }, orderBy: { name: 'asc' } }));
  }

  @Post('channels')
  createChannel(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const b = parse(z.object({ name: z.string().min(2).max(60), members: z.array(z.string().uuid()).default([]), isPrivate: z.boolean().default(false) }), body);
    return this.db.forTenant(u.tenantId, (tx) => tx.channel.create({ data: { tenantId: u.tenantId, name: b.name, isPrivate: b.isPrivate, members: [...new Set([u.userId, ...b.members])] } }));
  }

  @Get('channels/:id/messages')
  messages(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const c = await tx.channel.findUniqueOrThrow({ where: { id } });
      if (c.isPrivate && !c.members.includes(u.userId)) throw domainError('PERIMETRE', 'Canal privé.');
      const msgs = await tx.message.findMany({ where: { channelId: id }, orderBy: { createdAt: 'asc' }, take: 200 });
      const users = await this.db.client.user.findMany({ where: { id: { in: [...new Set(msgs.map((m) => m.authorId))] } }, select: { id: true, fullName: true } });
      return msgs.map((m) => ({ ...m, author: users.find((x) => x.id === m.authorId)?.fullName ?? '' }));
    });
  }

  @Post('channels/:id/messages')
  post(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ body: z.string().min(1).max(5000), link: z.string().max(300).optional() }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const c = await tx.channel.findUniqueOrThrow({ where: { id } });
      if (c.isPrivate && !c.members.includes(u.userId)) throw domainError('PERIMETRE', 'Canal privé.');
      return tx.message.create({ data: { tenantId: u.tenantId, channelId: id, authorId: u.userId, body: b.body, link: b.link } });
    });
  }

  // ---------- Réunions ----------
  @Get('meetings')
  meetings(@CurrentUser() u: SessionUser) {
    return this.db.forTenant(u.tenantId, (tx) => tx.meeting.findMany({ orderBy: { date: 'desc' } }));
  }

  /** Convocation : ordre du jour, participants, lieu ou lien ; une tâche « accuser réception » par participant. */
  @Post('meetings')
  convene(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const b = parse(z.object({ title: z.string().min(2), agenda: z.string().min(2), date: z.string().min(10), location: z.string().min(2), participants: z.array(z.string().uuid()).min(1) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const m = await tx.meeting.create({ data: { tenantId: u.tenantId, title: b.title, agenda: b.agenda, date: b.date, location: b.location, participants: b.participants.map((p) => ({ userId: p, ack: false })), createdBy: u.userId } });
      for (const p of b.participants) await tx.task.create({ data: { tenantId: u.tenantId, title: `Convocation : ${b.title} (${b.date.slice(0, 16).replace('T', ' ')})`, assigneeId: p, dueDate: b.date.slice(0, 10), source: 'REUNION', link: `/collaboration?reunion=${m.id}`, createdBy: u.userId } });
      return m;
    });
  }

  @Post('meetings/:id/ack')
  @HttpCode(200)
  ack(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const m = await tx.meeting.findUniqueOrThrow({ where: { id } });
      return tx.meeting.update({ where: { id }, data: { participants: (m.participants as { userId: string; ack: boolean }[]).map((p) => (p.userId === u.userId ? { ...p, ack: true } : p)) } });
    });
  }

  /** Procès-verbal et décisions : chaque décision devient une tâche assignée. */
  @Post('meetings/:id/minutes')
  @HttpCode(200)
  minutes(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ minutes: z.string().min(5), decisions: z.array(z.object({ text: z.string().min(2), assigneeId: z.string().uuid(), dueDate: zDate.optional() })).default([]) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      for (const d of b.decisions) await tx.task.create({ data: { tenantId: u.tenantId, title: d.text, assigneeId: d.assigneeId, dueDate: d.dueDate, source: 'DECISION', link: `/collaboration?reunion=${id}`, createdBy: u.userId } });
      return tx.meeting.update({ where: { id }, data: { minutes: b.minutes, decisions: b.decisions, status: 'TENUE' } });
    });
  }

  // ---------- Tâches et alertes ----------
  @AllowWithoutMfa()
  @Get('tasks')
  tasks(@CurrentUser() u: SessionUser, @Query('all') all?: string) {
    return this.db.forTenant(u.tenantId, (tx) => tx.task.findMany({ where: all === 'true' && u.roles.includes('ADMIN') ? {} : { assigneeId: u.userId }, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }] }));
  }

  @Post('tasks')
  createTask(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const b = parse(z.object({ title: z.string().min(2), details: z.string().default(''), assigneeId: z.string().uuid(), dueDate: zDate.optional(), link: z.string().optional() }), body);
    return this.db.forTenant(u.tenantId, (tx) => tx.task.create({ data: { ...b, tenantId: u.tenantId, createdBy: u.userId } }));
  }

  @Post('tasks/:id/status')
  @HttpCode(200)
  taskStatus(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ status: z.enum(['A_FAIRE', 'EN_COURS', 'TERMINEE']) }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const t = await tx.task.findUniqueOrThrow({ where: { id } });
      if (t.assigneeId !== u.userId && t.createdBy !== u.userId) throw domainError('PERIMETRE', 'Tâche d’un autre utilisateur.');
      return tx.task.update({ where: { id }, data: { status: b.status } });
    });
  }

  /** Alertes automatiques : stock bas, factures échues, échéances fiscales, budget, courrier en retard, absences. */
  @AllowWithoutMfa()
  @Get('alerts')
  alerts(@CurrentUser() u: SessionUser) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const today = new Date().toISOString().slice(0, 10);
      const out: { kind: string; level: 'info' | 'warn' | 'error'; text: string; link?: string }[] = [];
      for (const c of await tx.company.findMany()) {
        const items = await tx.stockItem.findMany({ where: { companyId: c.id, active: true } });
        for (const i of items) {
          const q = await tx.stockMove.aggregate({ where: { itemId: i.id }, _sum: { qtyMilli: true } });
          if ((q._sum.qtyMilli ?? 0n) <= i.reorderLevel) out.push({ kind: 'STOCK_BAS', level: 'warn', text: `${c.name} : stock bas — ${i.label}`, link: '/stocks' });
        }
        const overdue = await tx.entryLine.findMany({ where: { account: { startsWith: '411' }, letter: null, debit: { gt: 0n }, entry: { companyId: c.id, status: 'VALIDE', date: { lt: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10) } } } });
        if (overdue.length) out.push({ kind: 'FACTURES_ECHUES', level: 'warn', text: `${c.name} : ${overdue.length} créance(s) client(s) échue(s) depuis plus de 30 jours`, link: '/tresorerie' });
        const d = new Date();
        const due = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-15`;
        const days = (Date.parse(due) - Date.parse(today)) / 86_400_000;
        if (days >= 0 && days <= 10) out.push({ kind: 'ECHEANCE_FISCALE', level: days <= 3 ? 'error' : 'warn', text: `${c.name} : déclarations TVA et retenues sur salaires au ${due.split('-').reverse().join('/')} (J-${days})`, link: '/fiscalite' });
      }
      const lateMail = await tx.mail.count({ where: { status: { not: 'TRAITE' }, dueDate: { lt: today } } });
      if (lateMail) out.push({ kind: 'COURRIER', level: 'warn', text: `${lateMail} courrier(s) en retard de traitement`, link: '/courrier' });
      const myTasks = await tx.task.count({ where: { assigneeId: u.userId, status: { not: 'TERMINEE' }, dueDate: { lt: today } } });
      if (myTasks) out.push({ kind: 'TACHES', level: 'warn', text: `${myTasks} tâche(s) en retard`, link: '/collaboration' });
      return out;
    });
  }
}

@ApiTags('Collaboration, GED, courrier')
@Controller()
export class GedController {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  // ---------- GED ----------
  @RequiresModule('GED_ARCHIVAGE_IA')
  @Get('ged/documents')
  documents(@CurrentUser() u: SessionUser, @Query('q') q?: string, @Query('category') category?: string) {
    return this.db.forTenant(u.tenantId, (tx) =>
      tx.document.findMany({
        where: { ...(category ? { category } : {}), ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { text: { contains: q, mode: 'insensitive' } }, { tags: { has: q.toLowerCase() } }] } : {}) },
        select: { id: true, title: true, category: true, tags: true, docDate: true, amount: true, fiscalYear: true, retentionUntil: true, fileName: true, mimeType: true, sha256: true, entryId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  /** Dépôt : empreinte SHA-256 + horodatage (valeur probante), classement automatique, durée de conservation. */
  @RequiresModule('GED_ARCHIVAGE_IA')
  @Post('ged/documents')
  upload(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const b = parse(z.object({ fileName: z.string().max(200), mimeType: z.string().max(100), base64: z.string().max(28_000_000), title: z.string().optional(), text: z.string().max(200_000).default(''), companyId: z.string().uuid().optional(), entryId: z.string().uuid().optional(), category: z.string().optional() }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const data = Buffer.from(b.base64, 'base64');
      const text = b.text || (b.mimeType.startsWith('text/') ? data.toString('utf8').slice(0, 200_000) : '');
      const c = classify(text, b.fileName);
      const category = b.category ?? c.category;
      const year = Number((c.date ?? new Date().toISOString()).slice(0, 4));
      const stored = await this.storage.put(tx, u.tenantId, data);
      const doc = await tx.document.create({
        data: {
          tenantId: u.tenantId, companyId: b.companyId, title: b.title ?? b.fileName, category, tags: c.tags, docDate: c.date, amount: c.amount, fiscalYear: c.date?.slice(0, 4),
          retentionUntil: `${year + (RETENTION_YEARS[category] ?? 10)}-12-31`, mimeType: b.mimeType, fileName: b.fileName, sha256: sha256(data), text, entryId: b.entryId, createdBy: u.userId, ...stored,
        },
        select: { id: true, title: true, category: true, tags: true, docDate: true, amount: true, retentionUntil: true, sha256: true },
      });
      await this.audit.log(tx, u.tenantId, u.userId, 'GED_DEPOT', `document:${doc.id}`, { sha256: doc.sha256, category });
      return doc;
    });
  }

  @RequiresModule('GED_ARCHIVAGE_IA')
  @Get('ged/documents/:id/content')
  async content(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.db.forTenant(u.tenantId, async (tx) => {
      const d = await tx.document.findUniqueOrThrow({ where: { id } });
      const data = await this.storage.get(tx, u.tenantId, d);
      await this.audit.log(tx, u.tenantId, u.userId, 'GED_CONSULTATION', `document:${id}`);
      return { fileName: d.fileName, mimeType: d.mimeType, intact: sha256(data) === d.sha256, base64: data.toString('base64') };
    });
  }

  // ---------- Courrier ----------
  @RequiresModule('COURRIER')
  @Get('mail')
  mail(@CurrentUser() u: SessionUser) {
    return this.db.forTenant(u.tenantId, (tx) => tx.mail.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }));
  }

  /** Registre du courrier arrivé / départ : numérotation continue par sens et par année. */
  @RequiresModule('COURRIER')
  @Post('mail')
  register(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    const b = parse(z.object({ direction: z.enum(['ARRIVE', 'DEPART']), date: zDate, correspondent: z.string().min(2), subject: z.string().min(2), service: z.string().optional(), assigneeId: z.string().uuid().optional(), dueDate: zDate.optional(), documentId: z.string().uuid().optional() }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'mail' + u.tenantId + b.direction}))`;
      const prefix = `${b.direction === 'ARRIVE' ? 'CA' : 'CD'}-${b.date.slice(0, 4)}-`;
      const n = (await tx.mail.count({ where: { number: { startsWith: prefix } } })) + 1;
      const m = await tx.mail.create({ data: { tenantId: u.tenantId, ...b, number: `${prefix}${String(n).padStart(5, '0')}`, steps: [{ at: new Date().toISOString(), by: u.userId, action: 'ENREGISTRE' }] } });
      if (b.assigneeId) await tx.task.create({ data: { tenantId: u.tenantId, title: `Traiter le courrier ${m.number} — ${b.subject}`, assigneeId: b.assigneeId, dueDate: b.dueDate, source: 'COURRIER', link: '/courrier', createdBy: u.userId } });
      return m;
    });
  }

  /** Circuit de traitement : affectation, transmission, traitement (historisés). */
  @RequiresModule('COURRIER')
  @Post('mail/:id/step')
  @HttpCode(200)
  step(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(z.object({ action: z.enum(['AFFECTE', 'TRANSMIS', 'EN_TRAITEMENT', 'TRAITE', 'CLASSE']), assigneeId: z.string().uuid().optional(), note: z.string().optional() }), body);
    return this.db.forTenant(u.tenantId, async (tx) => {
      const m = await tx.mail.findUniqueOrThrow({ where: { id } });
      return tx.mail.update({ where: { id }, data: { status: b.action, assigneeId: b.assigneeId ?? m.assigneeId, steps: [...(m.steps as object[]), { at: new Date().toISOString(), by: u.userId, action: b.action, note: b.note }] } });
    });
  }
}

