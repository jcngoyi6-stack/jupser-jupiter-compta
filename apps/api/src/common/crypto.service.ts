import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from './config';
import type { Tx } from './prisma.service';

/**
 * Chiffrement applicatif par locataire (AES-256-GCM). La clé de données du locataire est enveloppée
 * par la clé maîtresse (en production : KMS/HSM — ici, variable MASTER_KEY).
 */
@Injectable()
export class CryptoService {
  private readonly master = Buffer.from(config.masterKey, 'base64');
  private readonly cache = new Map<string, Buffer>();

  constructor() {
    if (this.master.length !== 32) throw new Error('MASTER_KEY doit faire 32 octets (base64).');
  }

  static seal(key: Buffer, plain: Buffer): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([c.update(plain), c.final()]);
    return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
  }

  static open(key: Buffer, sealed: string): Buffer {
    const [v, iv, tag, data] = sealed.split('.');
    if (v !== 'v1' || !iv || !tag || data === undefined) throw new Error('Format chiffré invalide');
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]);
  }

  private async tenantKey(tx: Tx, tenantId: string): Promise<Buffer> {
    const cached = this.cache.get(tenantId);
    if (cached) return cached;
    let row = await tx.tenantKey.findUnique({ where: { tenantId } });
    if (!row) {
      const dek = randomBytes(32);
      row = await tx.tenantKey.create({ data: { tenantId, wrappedKey: CryptoService.seal(this.master, dek) } });
    }
    const key = CryptoService.open(this.master, row.wrappedKey);
    this.cache.set(tenantId, key);
    return key;
  }

  async encryptJson(tx: Tx, tenantId: string, value: unknown): Promise<string> {
    // `this[k]` : valeur brute, avant l'éventuel BigInt.prototype.toJSON global
    const json = JSON.stringify(value, function (this: Record<string, unknown>, k, v) {
      const raw = this[k];
      return typeof raw === 'bigint' ? { $big: raw.toString() } : v;
    });
    return CryptoService.seal(await this.tenantKey(tx, tenantId), Buffer.from(json, 'utf8'));
  }

  async decryptJson<T>(tx: Tx, tenantId: string, sealed: string): Promise<T> {
    const plain = CryptoService.open(await this.tenantKey(tx, tenantId), sealed).toString('utf8');
    return JSON.parse(plain, (_k, v) => (v && typeof v === 'object' && '$big' in v ? BigInt(v.$big) : v)) as T;
  }

  async encryptBytes(tx: Tx, tenantId: string, data: Buffer): Promise<string> {
    return CryptoService.seal(await this.tenantKey(tx, tenantId), data);
  }

  async decryptBytes(tx: Tx, tenantId: string, sealed: string): Promise<Buffer> {
    return CryptoService.open(await this.tenantKey(tx, tenantId), sealed);
  }

  /** Secret TOTP chiffré par la clé maîtresse (les utilisateurs ne sont pas rattachés à un seul locataire). */
  sealGlobal(plain: string): string {
    return CryptoService.seal(this.master, Buffer.from(plain, 'utf8'));
  }
  openGlobal(sealed: string): string {
    return CryptoService.open(this.master, sealed).toString('utf8');
  }
}
