import { Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { CryptoService } from './crypto.service';
import type { Tx } from './prisma.service';

/**
 * Stockage des pièces (docs/02) : MinIO/S3 si S3_ENDPOINT est configuré, sinon PostgreSQL.
 * Dans les deux cas le contenu est chiffré par la clé du locataire avant d'être stocké.
 */
@Injectable()
export class StorageService {
  private readonly s3 = process.env.S3_ENDPOINT
    ? new S3Client({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION ?? 'us-east-1',
        forcePathStyle: true,
        credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? '', secretAccessKey: process.env.S3_SECRET_KEY ?? '' },
      })
    : null;
  private readonly bucket = process.env.S3_BUCKET ?? 'jupiter-compta';

  constructor(private readonly crypto: CryptoService) {}

  get mode() {
    return this.s3 ? 'S3' : 'BASE';
  }

  /** Retourne { storageKey } (S3) ou { dataEnc } (base). */
  async put(tx: Tx, tenantId: string, data: Buffer): Promise<{ storageKey: string | null; dataEnc: string | null }> {
    const sealed = await this.crypto.encryptBytes(tx, tenantId, data);
    if (!this.s3) return { storageKey: null, dataEnc: sealed };
    const key = `${tenantId}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}`;
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: sealed, ContentType: 'application/octet-stream' }));
    return { storageKey: key, dataEnc: null };
  }

  async get(tx: Tx, tenantId: string, ref: { storageKey: string | null; dataEnc: string | null }): Promise<Buffer> {
    if (ref.dataEnc) return this.crypto.decryptBytes(tx, tenantId, ref.dataEnc);
    if (!this.s3 || !ref.storageKey) throw new Error('Pièce introuvable dans le stockage.');
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: ref.storageKey }));
    const sealed = await r.Body!.transformToString();
    return this.crypto.decryptBytes(tx, tenantId, sealed);
  }
}
