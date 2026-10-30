/**
 * Manuel de procédures comptables sur mesure (docs/15 §6).
 * Bibliothèque de modèles à valider par JUPSER et ses experts ; le texte final est relu par l'expert-comptable.
 */

export type Sector = 'COMMERCE' | 'INDUSTRIE' | 'SERVICES' | 'BTP' | 'MINES' | 'AGRICULTURE' | 'ONG';
export type ManualCycle = 'ACHATS' | 'VENTES' | 'TRESORERIE' | 'STOCKS' | 'IMMOBILISATIONS' | 'PAIE' | 'FISCALITE' | 'CLOTURE' | 'ARCHIVAGE' | 'PRODUCTION' | 'SUBVENTIONS';

/** Fonctions incompatibles (séparation des tâches). */
export type Duty = 'INITIATION' | 'VALIDATION' | 'PAIEMENT' | 'ENREGISTREMENT' | 'GARDE' | 'CONTROLE';
const INCOMPATIBLE: [Duty, Duty][] = [
  ['INITIATION', 'VALIDATION'],
  ['VALIDATION', 'PAIEMENT'],
  ['PAIEMENT', 'ENREGISTREMENT'],
  ['GARDE', 'ENREGISTREMENT'],
  ['INITIATION', 'PAIEMENT'],
];

export interface Position { id: string; title: string; holder?: string }

export interface ManualInput {
  company: string;
  country: string;
  sector: Sector;
  system: 'NORMAL' | 'SMT';
  positions: Position[];
  /** Affectation souhaitée des fonctions par cycle (poste par fonction). À défaut, affectation automatique. */
  assignments?: Partial<Record<ManualCycle, Partial<Record<Duty, string>>>>;
  methods?: { depreciation?: string; inventory?: 'CMUP' | 'FIFO' };
  modules?: string[];
  accounts?: { code: string; label: string }[];
  /** Obligations fiscales et sociales issues des packs validés. */
  obligations?: { label: string; frequency: string; deadline: string }[];
  risks?: string[];
  version?: string;
}

const SECTOR_CYCLES: Record<Sector, ManualCycle[]> = {
  COMMERCE: ['ACHATS', 'VENTES', 'STOCKS', 'TRESORERIE', 'IMMOBILISATIONS', 'PAIE', 'FISCALITE', 'CLOTURE', 'ARCHIVAGE'],
  INDUSTRIE: ['ACHATS', 'PRODUCTION', 'STOCKS', 'VENTES', 'TRESORERIE', 'IMMOBILISATIONS', 'PAIE', 'FISCALITE', 'CLOTURE', 'ARCHIVAGE'],
  SERVICES: ['ACHATS', 'VENTES', 'TRESORERIE', 'IMMOBILISATIONS', 'PAIE', 'FISCALITE', 'CLOTURE', 'ARCHIVAGE'],
  BTP: ['ACHATS', 'STOCKS', 'PRODUCTION', 'VENTES', 'TRESORERIE', 'IMMOBILISATIONS', 'PAIE', 'FISCALITE', 'CLOTURE', 'ARCHIVAGE'],
  MINES: ['ACHATS', 'PRODUCTION', 'STOCKS', 'VENTES', 'TRESORERIE', 'IMMOBILISATIONS', 'PAIE', 'FISCALITE', 'CLOTURE', 'ARCHIVAGE'],
  AGRICULTURE: ['ACHATS', 'PRODUCTION', 'STOCKS', 'VENTES', 'TRESORERIE', 'IMMOBILISATIONS', 'PAIE', 'FISCALITE', 'CLOTURE', 'ARCHIVAGE'],
  ONG: ['SUBVENTIONS', 'ACHATS', 'TRESORERIE', 'IMMOBILISATIONS', 'PAIE', 'FISCALITE', 'CLOTURE', 'ARCHIVAGE'],
};

interface StepTpl { duty: Duty; action: string; document: string; control?: string; delay?: string }

const STEPS: Record<ManualCycle, { objective: string; steps: StepTpl[]; entries: string[] }> = {
  ACHATS: {
    objective: 'Garantir que tout achat est autorisé, reçu, correctement facturé, enregistré et payé une seule fois.',
    steps: [
      { duty: 'INITIATION', action: 'Émettre la demande d’achat et le bon de commande', document: 'Bon de commande numéroté' },
      { duty: 'VALIDATION', action: 'Approuver le bon de commande selon les délégations de signature', document: 'Bon de commande visé', control: 'Respect des plafonds et du budget' },
      { duty: 'GARDE', action: 'Réceptionner les biens et établir le bon de réception', document: 'Bon de réception', control: 'Rapprochement quantités commandées/reçues' },
      { duty: 'ENREGISTREMENT', action: 'Enregistrer la facture après rapprochement commande–réception–facture', document: 'Facture fournisseur', control: 'Rapprochement à trois voies', delay: '48 h après réception' },
      { duty: 'PAIEMENT', action: 'Préparer et exécuter le règlement à l’échéance', document: 'Ordre de virement / chèque', control: 'Double signature au-delà du seuil' },
    ],
    entries: ['601/602/604 + 445200 au débit, 401 au crédit (facture)', '401 au débit, 521 au crédit (règlement)'],
  },
  VENTES: {
    objective: 'Garantir que toute livraison est facturée, certifiée (RDC : DEF), enregistrée et encaissée.',
    steps: [
      { duty: 'INITIATION', action: 'Enregistrer la commande client et vérifier le crédit autorisé', document: 'Bon de commande client', control: 'Encours ≤ plafond client' },
      { duty: 'GARDE', action: 'Livrer et faire signer le bon de livraison', document: 'Bon de livraison' },
      { duty: 'ENREGISTREMENT', action: 'Émettre la facture normalisée et la comptabiliser', document: 'Facture certifiée', control: 'Continuité de la numérotation', delay: 'Le jour de la livraison' },
      { duty: 'CONTROLE', action: 'Suivre la balance âgée et relancer', document: 'Balance âgée', delay: 'Hebdomadaire' },
      { duty: 'PAIEMENT', action: 'Encaisser et lettrer les règlements', document: 'Reçu / avis de crédit' },
    ],
    entries: ['411 au débit, 70x + 443 au crédit (facture)', '521/571 au débit, 411 au crédit (encaissement)'],
  },
  TRESORERIE: {
    objective: 'Protéger les fonds et assurer l’exhaustivité des mouvements de trésorerie.',
    steps: [
      { duty: 'INITIATION', action: 'Établir la demande de décaissement avec pièces justificatives', document: 'Bon de caisse / demande de paiement' },
      { duty: 'VALIDATION', action: 'Autoriser le décaissement', document: 'Demande visée' },
      { duty: 'GARDE', action: 'Tenir la caisse et le brouillard de caisse', document: 'Brouillard de caisse', control: 'Plafond d’encaisse' },
      { duty: 'ENREGISTREMENT', action: 'Comptabiliser les mouvements bancaires et de caisse', document: 'Relevés' },
      { duty: 'CONTROLE', action: 'Établir le rapprochement bancaire et l’arrêté de caisse', document: 'État de rapprochement, PV de caisse', delay: 'Mensuel / quotidien' },
    ],
    entries: ['521 / 571 selon le moyen de paiement', '585 virements de fonds entre comptes de trésorerie'],
  },
  STOCKS: {
    objective: 'Assurer l’existence et la valorisation correcte des stocks.',
    steps: [
      { duty: 'GARDE', action: 'Tenir les fiches de stock et autoriser les sorties sur bon', document: 'Bon de sortie' },
      { duty: 'ENREGISTREMENT', action: 'Enregistrer entrées et sorties dans l’inventaire permanent', document: 'Journal des mouvements' },
      { duty: 'CONTROLE', action: 'Réaliser les inventaires tournants et l’inventaire annuel', document: 'PV d’inventaire', control: 'Comptage par une équipe indépendante du magasinier' },
      { duty: 'VALIDATION', action: 'Approuver les écarts d’inventaire', document: 'État des écarts' },
    ],
    entries: ['31x/32x/33x et 603x (variation des stocks)', '659/6593 dépréciations si VNR < coût'],
  },
  IMMOBILISATIONS: {
    objective: 'Garantir l’existence, l’évaluation et la protection des immobilisations.',
    steps: [
      { duty: 'INITIATION', action: 'Demander l’investissement dans le cadre du budget', document: 'Fiche d’investissement' },
      { duty: 'VALIDATION', action: 'Approuver l’investissement', document: 'Décision d’investissement' },
      { duty: 'ENREGISTREMENT', action: 'Immatriculer le bien, l’enregistrer et l’amortir par composants', document: 'Fichier des immobilisations' },
      { duty: 'CONTROLE', action: 'Inventorier physiquement les biens', document: 'PV d’inventaire', delay: 'Annuel' },
    ],
    entries: ['2x au débit, 481 au crédit (acquisition)', '681 au débit, 28x au crédit (dotations)', '812 / 822 (cessions)'],
  },
  PAIE: {
    objective: 'Payer les seuls salariés présents, aux montants et barèmes en vigueur, et déclarer à temps.',
    steps: [
      { duty: 'INITIATION', action: 'Mettre à jour le fichier du personnel et les variables (pointage, congés)', document: 'États de présence' },
      { duty: 'ENREGISTREMENT', action: 'Calculer la paie avec les barèmes du pack pays validé', document: 'Bulletins et livre de paie' },
      { duty: 'VALIDATION', action: 'Valider le livre de paie', document: 'Livre de paie visé', control: 'Revue des variations mensuelles' },
      { duty: 'PAIEMENT', action: 'Payer les salaires et les cotisations', document: 'Ordre de virement' },
    ],
    entries: ['66x au débit, 422 / 43x / 447 au crédit', '422 au débit, 521 au crédit'],
  },
  FISCALITE: {
    objective: 'Respecter les obligations déclaratives et de paiement.',
    steps: [
      { duty: 'ENREGISTREMENT', action: 'Préparer les déclarations à partir des comptes', document: 'Déclarations' },
      { duty: 'CONTROLE', action: 'Rapprocher les déclarations de la comptabilité', document: 'Tableau de rapprochement' },
      { duty: 'VALIDATION', action: 'Valider et signer les déclarations', document: 'Déclarations signées' },
      { duty: 'PAIEMENT', action: 'Payer dans les délais', document: 'Quittances' },
    ],
    entries: ['443/445 → 4441/4449 (liquidation de TVA)', '891/895 et 441 (impôt sur le résultat)'],
  },
  CLOTURE: {
    objective: 'Produire des états financiers fiables dans les délais légaux.',
    steps: [
      { duty: 'ENREGISTREMENT', action: 'Passer les écritures d’inventaire (amortissements, provisions, cut-off, stocks)', document: 'Journal d’OD' },
      { duty: 'CONTROLE', action: 'Justifier tous les comptes de bilan', document: 'Dossier de justification' },
      { duty: 'VALIDATION', action: 'Arrêter les comptes et verrouiller la période', document: 'Calendrier de clôture visé' },
    ],
    entries: ['408/418/476/477 (cut-off)', '13x (résultat)'],
  },
  ARCHIVAGE: {
    objective: 'Conserver les pièces dans les délais légaux et pouvoir les produire.',
    steps: [
      { duty: 'GARDE', action: 'Numériser et classer les pièces dans la GED avec leur durée de conservation', document: 'Plan de classement' },
      { duty: 'CONTROLE', action: 'Vérifier l’intégrité des archives et les éliminations autorisées', document: 'Registre des éliminations' },
    ],
    entries: [],
  },
  PRODUCTION: {
    objective: 'Maîtriser les consommations et le coût de revient.',
    steps: [
      { duty: 'INITIATION', action: 'Lancer l’ordre de fabrication à partir de la nomenclature', document: 'Ordre de fabrication' },
      { duty: 'GARDE', action: 'Sortir les matières et déclarer la production', document: 'Bons de sortie et de production' },
      { duty: 'ENREGISTREMENT', action: 'Valoriser la production au coût de revient', document: 'Fiche de coût' },
      { duty: 'CONTROLE', action: 'Analyser les écarts sur coûts standards', document: 'État des écarts' },
    ],
    entries: ['36x au débit, 736 au crédit (production stockée)'],
  },
  SUBVENTIONS: {
    objective: 'Utiliser les fonds conformément aux conventions et en rendre compte aux bailleurs.',
    steps: [
      { duty: 'INITIATION', action: 'Engager les dépenses dans la limite des lignes budgétaires du bailleur', document: 'Fiche d’engagement' },
      { duty: 'VALIDATION', action: 'Vérifier l’éligibilité et approuver', document: 'Fiche visée' },
      { duty: 'ENREGISTREMENT', action: 'Imputer analytiquement par projet et par bailleur', document: 'Journal analytique' },
      { duty: 'CONTROLE', action: 'Établir les rapports financiers aux bailleurs', document: 'Rapport financier' },
    ],
    entries: ['4495 / 71x subventions d’exploitation', '14x subventions d’investissement'],
  },
};

export interface SodIssue { cycle: ManualCycle; positionId: string; duties: [Duty, Duty]; compensatingControl: string }

function autoAssign(positions: Position[], duties: Duty[]): Partial<Record<Duty, string>> {
  const out: Partial<Record<Duty, string>> = {};
  if (positions.length === 0) return out;
  duties.forEach((d, i) => {
    out[d] = positions[i % positions.length]?.id;
  });
  return out;
}

export function generateProceduresManual(input: ManualInput) {
  const cycles = SECTOR_CYCLES[input.sector];
  const posTitle = (id?: string) => input.positions.find((p) => p.id === id)?.title ?? 'À désigner';
  const sod: SodIssue[] = [];
  const chapters = cycles.map((cycle) => {
    const tpl = STEPS[cycle];
    const duties = [...new Set(tpl.steps.map((s) => s.duty))];
    const assign = { ...autoAssign(input.positions, duties), ...(input.assignments?.[cycle] ?? {}) };
    for (const [a, b] of INCOMPATIBLE) {
      const pa = assign[a];
      if (pa && pa === assign[b] && duties.includes(a) && duties.includes(b)) {
        sod.push({
          cycle, positionId: pa, duties: [a, b],
          compensatingControl: `Revue a posteriori par la direction des opérations « ${a.toLowerCase()} » et « ${b.toLowerCase()} » du poste ${posTitle(pa)} (visa mensuel et contrôle par sondage).`,
        });
      }
    }
    return {
      cycle,
      objective: tpl.objective,
      procedures: tpl.steps.map((s, i) => ({ step: i + 1, actor: posTitle(assign[s.duty]), ...s })),
      entries: tpl.entries,
    };
  });
  const methods = [
    `Référentiel : Acte uniforme relatif au droit comptable et à l’information financière (AUDCIF) et SYSCOHADA révisé — système ${input.system === 'SMT' ? 'minimal de trésorerie' : 'normal'}.`,
    `Amortissements : ${input.methods?.depreciation ?? 'linéaire par composants'}.`,
    `Stocks : ${input.methods?.inventory === 'FIFO' ? 'premier entré, premier sorti (PEPS)' : 'coût moyen unitaire pondéré (CMUP)'}.`,
  ];
  return {
    title: `Manuel de procédures administratives, financières et comptables — ${input.company}`,
    version: input.version ?? '1.0',
    status: 'PROJET_A_VALIDER' as const,
    country: input.country,
    sector: input.sector,
    methods,
    chapters,
    segregationIssues: sod,
    annexes: {
      chartOfAccounts: input.accounts ?? [],
      obligations: input.obligations ?? [],
      delegationMatrix: chapters.map((c) => ({ cycle: c.cycle, approver: c.procedures.find((p) => p.duty === 'VALIDATION')?.actor ?? '—' })),
      risks: input.risks ?? [],
    },
  };
}
