import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableOfContents, TableRow, TextRun, WidthType } from 'docx';

export interface WordSection { heading: string; paragraphs?: string[]; table?: { header: string[]; rows: (string | number)[][] }; level?: 1 | 2 }

/** Document Word à la charte (en-tête cabinet / client, mention « projet à valider »). */
export async function buildWord(p: { title: string; subtitle?: string; brand?: string; sections: WordSection[]; toc?: boolean; draft?: boolean }): Promise<Buffer> {
  const children: (Paragraph | Table | TableOfContents)[] = [
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: p.brand ?? 'Jupiter Compta — JUPSER', color: '14A9CB', bold: true })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: p.title, color: '0D2747' })] }),
  ];
  if (p.subtitle) children.push(new Paragraph({ children: [new TextRun({ text: p.subtitle, italics: true })] }));
  if (p.draft !== false) children.push(new Paragraph({ children: [new TextRun({ text: 'Projet généré — à revoir et valider par l’expert avant toute diffusion.', color: 'B45309', bold: true })] }));
  if (p.toc) children.push(new TableOfContents('Table des matières', { hyperlink: true, headingStyleRange: '1-2' }));
  for (const s of p.sections) {
    children.push(new Paragraph({ heading: s.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1, children: [new TextRun({ text: s.heading, color: '0D2747' })] }));
    for (const t of s.paragraphs ?? []) children.push(new Paragraph({ children: [new TextRun(t)] }));
    if (s.table) {
      const row = (cells: (string | number)[], bold = false) =>
        new TableRow({ children: cells.map((c) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(c), bold })] })] })) });
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [row(s.table.header, true), ...s.table.rows.map((r) => row(r))] }));
    }
  }
  const doc = new Document({ creator: 'Jupiter Compta', title: p.title, features: { updateFields: !!p.toc }, sections: [{ children }] });
  return Packer.toBuffer(doc);
}
