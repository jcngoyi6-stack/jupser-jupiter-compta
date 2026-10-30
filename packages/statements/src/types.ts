export interface AccountBalance {
  account: string; // 6 chiffres
  net: bigint; // débit – crédit
}

export interface StatementLine {
  ref: string;
  label: string;
  kind: 'line' | 'total';
  level: number;
}

export interface ControlResult {
  code: string;
  label: string;
  ok: boolean;
  detail?: string;
  blocking: boolean;
}
