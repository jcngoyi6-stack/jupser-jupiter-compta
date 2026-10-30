/**
 * Documentation de mission générée (docs/15 §5). Ce sont des projets : l'expert les adapte et les valide.
 */
import type { MissionType } from './practice';

export interface EngagementParams {
  firm: string;
  firmAddress?: string;
  client: string;
  clientAddress?: string;
  fiscalYear: string;
  fee: string;
  partner: string;
  date: string;
  country?: string;
}

export interface DocSection { heading: string; paragraphs: string[] }
export interface GeneratedDoc { title: string; sections: DocSection[]; status: 'PROJET_A_VALIDER' }

const SCOPE: Record<MissionType, string[]> = {
  TENUE: ['Saisie et tenue de la comptabilité selon le SYSCOHADA révisé à partir des pièces transmises.', 'Établissement des déclarations périodiques convenues.'],
  REVISION: ['Revue des comptes et des écritures d’inventaire, contrôle de cohérence et de vraisemblance.', 'Propositions d’écritures d’ajustement.'],
  ETABLISSEMENT: ['Établissement des états financiers annuels (bilan, compte de résultat, TFT, notes annexes) et de la DSF.'],
  AUDIT: ['Audit des états financiers selon les normes ISA adoptées par l’ordre professionnel, en vue d’exprimer une opinion.', 'L’audit comporte des sondages et ne vise pas la détection de toutes les fraudes.'],
  CONSEIL_FISCAL: ['Conseil et assistance en matière fiscale, revue des déclarations, assistance lors des contrôles.'],
  PAIE: ['Établissement des bulletins de paie et des déclarations sociales et fiscales sur salaires.'],
  EVALUATION: ['Évaluation de l’entreprise ou du projet selon les méthodes convenues et remise d’un rapport.'],
  RESTRUCTURATION: ['Diagnostic, élaboration de scénarios de restructuration et assistance à leur mise en œuvre.'],
};

export function engagementLetter(type: MissionType, p: EngagementParams): GeneratedDoc {
  return {
    title: `Lettre de mission — ${p.client} — exercice ${p.fiscalYear}`,
    status: 'PROJET_A_VALIDER',
    sections: [
      { heading: 'Objet', paragraphs: [`${p.firm} a le plaisir de confirmer son intervention auprès de ${p.client} pour l’exercice ${p.fiscalYear}.`] },
      { heading: 'Nature et étendue de la mission', paragraphs: SCOPE[type] },
      { heading: 'Responsabilités de la direction', paragraphs: [
        'La direction est responsable de l’établissement des états financiers, du contrôle interne et de la mise à disposition de toutes les pièces et informations.',
        'Elle s’engage à remettre une lettre d’affirmation en fin de mission.',
      ] },
      { heading: 'Responsabilités du cabinet', paragraphs: ['Le cabinet exécute la mission conformément aux normes professionnelles et à son code de déontologie, avec indépendance et secret professionnel.'] },
      { heading: 'Honoraires', paragraphs: [`Honoraires convenus : ${p.fee}, hors taxes et débours. Facturation selon l’échéancier joint.`] },
      { heading: 'Signatures', paragraphs: [`Fait le ${p.date}.`, `Pour ${p.firm} : ${p.partner}, associé signataire.`, `Pour ${p.client} : bon pour accord.`] },
    ],
  };
}

export function documentRequest(type: MissionType, client: string, fiscalYear: string): GeneratedDoc {
  const common = ['Balance générale et grands livres au 31/12', 'Relevés bancaires et états de rapprochement', 'Procès-verbaux des organes sociaux', 'Contrats significatifs conclus ou modifiés'];
  const extra: Partial<Record<MissionType, string[]>> = {
    AUDIT: ['Inventaire physique des stocks et des caisses', 'Tableau des immobilisations et des amortissements', 'Liste des litiges et correspondance avec les avocats', 'Déclarations fiscales et sociales de l’exercice'],
    PAIE: ['Contrats de travail et avenants', 'Pointages et absences', 'Barèmes et conventions collectives applicables'],
    ETABLISSEMENT: ['Factures non parvenues et à établir', 'États des créances douteuses', 'Tableau des emprunts'],
  };
  return {
    title: `Demande de pièces — ${client} — ${fiscalYear}`,
    status: 'PROJET_A_VALIDER',
    sections: [{ heading: 'Documents à transmettre', paragraphs: [...common, ...(extra[type] ?? [])] }],
  };
}

export function representationLetter(p: EngagementParams): GeneratedDoc {
  return {
    title: `Lettre d’affirmation — ${p.client} — ${p.fiscalYear}`,
    status: 'PROJET_A_VALIDER',
    sections: [{ heading: `À l’attention de ${p.firm}`, paragraphs: [
      `Nous confirmons que les états financiers de l’exercice ${p.fiscalYear} ont été établis conformément à l’AUDCIF et au SYSCOHADA révisé et donnent une image fidèle.`,
      'Toutes les opérations ont été enregistrées ; tous les documents, procès-verbaux et informations vous ont été fournis.',
      'Nous n’avons connaissance d’aucune fraude, d’aucun litige non provisionné ni d’aucun événement postérieur significatif non communiqué.',
      `Fait le ${p.date}. La direction de ${p.client}.`,
    ] }],
  };
}
