import ExcelJS from 'exceljs';
import { parseDelimited, type Row } from '@jupiter/ledger';

/** Lit un fichier importé (CSV/TXT en clair, ou XLSX en base64) en lignes de texte. */
export async function readRows(input: { content?: string; base64?: string; fileName?: string }): Promise<Row[]> {
  if (input.base64 && /\.xlsx$/i.test(input.fileName ?? '.xlsx')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(input.base64, 'base64') as never);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const rows: Row[] = [];
    ws.eachRow({ includeEmpty: false }, (r) => {
      const vals = (r.values as unknown[]).slice(1).map((v) => {
        if (v === null || v === undefined) return '';
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === 'object' && 'result' in (v as object)) return String((v as { result: unknown }).result ?? '');
        if (typeof v === 'object' && 'text' in (v as object)) return String((v as { text: unknown }).text ?? '');
        return String(v);
      });
      rows.push(vals);
    });
    return rows;
  }
  const text = input.content ?? (input.base64 ? Buffer.from(input.base64, 'base64').toString('utf8') : '');
  return parseDelimited(text);
}

export interface SheetSpec {
  name: string;
  title?: string;
  columns: { header: string; width?: number; money?: boolean }[];
  rows: (string | number | bigint | null)[][];
}

/** Classeur Excel (DSF, annexes) : montants convertis en nombres décimaux uniquement à l'export. */
export async function buildWorkbook(sheets: SheetSpec[], decimals = 2, meta: { company?: string } = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Jupiter Compta — JUPSER';
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    let r = 1;
    if (s.title) {
      ws.getCell(r, 1).value = s.title;
      ws.getCell(r, 1).font = { bold: true, size: 13, color: { argb: 'FF0D2747' } };
      r++;
      if (meta.company) ws.getCell(r++, 1).value = meta.company;
      r++;
    }
    s.columns.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D2747' } };
      ws.getColumn(i + 1).width = c.width ?? (c.money ? 18 : 30);
    });
    r++;
    for (const row of s.rows) {
      row.forEach((v, i) => {
        const cell = ws.getCell(r, i + 1);
        if (typeof v === 'bigint') {
          // conversion texte → nombre : exacte pour les montants courants
          const neg = v < 0n;
          const a = (neg ? -v : v).toString().padStart(decimals + 1, '0');
          cell.value = Number((neg ? '-' : '') + a.slice(0, a.length - decimals) + (decimals ? '.' + a.slice(-decimals) : ''));
          cell.numFmt = decimals ? '# ##0.00' : '# ##0';
        } else cell.value = v as string | number | null;
      });
      r++;
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
