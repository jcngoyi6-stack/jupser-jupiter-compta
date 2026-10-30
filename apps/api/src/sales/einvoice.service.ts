import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DEFAULT_TAX_GROUPS, HttpEmcf, SimulatedDef, type EInvoiceProvider, type InvoiceType, type NormalizedInvoice, type SecurityElements } from '@jupiter/einvoice';
import { config } from '../common/config';
import { domainError } from '../common/http';

export interface EInvoiceSettings {
  enabled?: boolean; // par défaut actif pour les sociétés établies en RDC
  nim?: string;
  mode?: 'PRODUCTION' | 'SIMULATION';
}

/**
 * Port EInvoiceProvider (docs/02) : RDC — facture normalisée transmise au dispositif électronique fiscal.
 * Production : e-MCF de la DGI (RDC_EMCF_URL + RDC_EMCF_TOKEN). Sinon : simulateur, sans valeur fiscale.
 */
@Injectable()
export class EInvoiceService {
  private readonly simulator = new SimulatedDef(createHash('sha256').update('def-sim|' + config.jwtSecret).digest('hex'));
  private readonly emcf: EInvoiceProvider | null =
    process.env.RDC_EMCF_URL && process.env.RDC_EMCF_TOKEN ? new HttpEmcf({ baseUrl: process.env.RDC_EMCF_URL, token: process.env.RDC_EMCF_TOKEN }) : null;

  required(company: { country: string; einvoiceSettings: unknown }): boolean {
    const s = (company.einvoiceSettings ?? {}) as EInvoiceSettings;
    return company.country === 'CD' && s.enabled !== false;
  }

  provider(company: { einvoiceSettings: unknown }): EInvoiceProvider {
    const s = (company.einvoiceSettings ?? {}) as EInvoiceSettings;
    if (s.mode === 'SIMULATION' || !this.emcf) {
      if (config.isProd && s.mode !== 'SIMULATION') {
        throw domainError('DEF_NON_CONFIGURE', 'Dispositif électronique fiscal (e-MCF) non configuré : facture normalisée impossible.');
      }
      return this.simulator;
    }
    return this.emcf;
  }

  /** Groupe de taxation selon la nature TVA de la ligne (paramétrable, à confirmer par la DGI). */
  taxGroup(vatKind: string, groups = DEFAULT_TAX_GROUPS): string {
    const g = Object.entries(groups).find(([, v]) => v.vatKind === vatKind);
    if (!g) throw domainError('GROUPE_TAXATION', `Aucun groupe de taxation pour ${vatKind}.`);
    return g[0];
  }

  async certify(
    company: { taxId: string | null; name: string; einvoiceSettings: unknown },
    data: Omit<NormalizedInvoice, 'sellerTaxId' | 'sellerName' | 'nim'>,
  ): Promise<SecurityElements> {
    if (!company.taxId) throw domainError('NIF_MANQUANT', 'Le NIF de la société est obligatoire pour émettre une facture normalisée.');
    const s = (company.einvoiceSettings ?? {}) as EInvoiceSettings;
    try {
      return await this.provider(company).submit({ ...data, sellerTaxId: company.taxId, sellerName: company.name, nim: s.nim ?? null });
    } catch (e) {
      throw domainError('DEF_REFUS', `Le dispositif électronique fiscal a refusé la facture : ${(e as Error).message}`);
    }
  }

  static typeFor(kind: 'FACTURE' | 'AVOIR', exportSale: boolean): InvoiceType {
    if (kind === 'FACTURE') return exportSale ? 'EV' : 'FV';
    return exportSale ? 'EA' : 'FA';
  }
}
