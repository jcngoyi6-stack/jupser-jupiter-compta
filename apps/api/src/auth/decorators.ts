import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { ModuleCode } from '@jupiter/licensing';

export const IS_PUBLIC = 'jc:public';
export const ROLES = 'jc:roles';
export const MODULE = 'jc:module';
export const STAFF = 'jc:staff';
export const ALLOW_NO_MFA = 'jc:allow-no-mfa';

/** Route accessible sans session (connexion, vérification publique d'un QR, webhooks signés). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Rôles autorisés (refus par défaut des autres) ; ADMIN est toujours autorisé. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
/** Module de licence requis (docs/09). */
export const RequiresModule = (m: ModuleCode) => SetMetadata(MODULE, m);
/** Réservé au personnel JUPSER (console). */
export const JupserStaff = () => SetMetadata(STAFF, true);
/** Route utilisable avant la mise en place de la double authentification. */
export const AllowWithoutMfa = () => SetMetadata(ALLOW_NO_MFA, true);

export const ROLE_LIST = [
  'ADMIN',
  'DIRECTION',
  'CHEF_COMPTABLE',
  'COMPTABLE',
  'CAISSIER',
  'PAIE',
  'RH',
  'FISCALITE',
  'COMMERCIAL',
  'AUDITEUR',
  'EXPERT_EXTERNE',
  'EMPLOYE',
] as const;
export type Role = (typeof ROLE_LIST)[number];

/** Rôles pour lesquels la double authentification est obligatoire (docs/08). */
export const MFA_ROLES: Role[] = ['ADMIN', 'CHEF_COMPTABLE', 'COMPTABLE', 'PAIE', 'FISCALITE'];

export const ACCOUNTING_WRITE: Role[] = ['CHEF_COMPTABLE', 'COMPTABLE', 'EXPERT_EXTERNE'];

export interface SessionUser {
  userId: string;
  tenantId: string;
  email: string;
  fullName: string;
  roles: Role[];
  companyIds: string[];
  mfa: boolean;
  isStaff: boolean;
}

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): SessionUser => {
  return ctx.switchToHttp().getRequest().user;
});
