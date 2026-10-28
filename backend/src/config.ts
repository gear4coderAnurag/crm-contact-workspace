const isTest = process.env.NODE_ENV === 'test';
const base = process.env.DATABASE_URL ?? 'postgres://crm:crm@localhost:5432/crm';

export const config = {
  // tests always run against crm_test, never the dev DB
  databaseUrl: isTest ? (process.env.TEST_DATABASE_URL ?? base.replace(/\/[^/?]+(\?|$)/, '/crm_test$1')) : base,
  port: Number(process.env.PORT ?? 4000),
};
