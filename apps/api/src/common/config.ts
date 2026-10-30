function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL', isProd ? undefined : 'postgresql://jupiter_app:app_dev_pw@localhost:5432/jupiter'),
  jwtSecret: required('JWT_SECRET', isProd ? undefined : 'dev-only-secret-not-for-production-use-0123456789abcdef'),
  masterKey: required('MASTER_KEY', isProd ? undefined : 'ZGV2LW1hc3Rlci1rZXktMzItYnl0ZXMtbG9uZyEhISE='),
  webhookSecret: required('PAYMENT_WEBHOOK_SECRET', isProd ? undefined : 'dev-webhook-secret'),
  verifyBaseUrl: process.env.PUBLIC_VERIFY_BASE_URL ?? 'http://localhost:3000/verifier',
  anthropicKey: process.env.ANTHROPIC_API_KEY || null,
  sessionMinutes: 30,
  maxFailedLogins: 5,
  lockMinutes: 15,
};
