/**
 * Centralized Production Configuration Validator
 * Validates environmental boundaries at startup without printing sensitive secret values.
 */

export const validateProductionConfig = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test' || process.argv.some(arg => arg.includes('test'));

  // Never block test suites
  if (isTest) {
    return { valid: true, report: [] };
  }

  const report = [];

  // Critical Variables: Application cannot function securely without these
  const criticalVars = [
    {
      name: 'JWT_SECRET',
      validate: (val) => {
        if (!val || val.trim() === '') return 'MISSING (Authentication disabled)';
        if (isProduction && val.length < 32) return 'INVALID (Must be >= 32 characters in production)';
        return 'CONFIGURED';
      },
      critical: true
    },
    {
      name: 'DATABASE_URL',
      validate: (val) => (!val ? 'MISSING (Database offline)' : 'CONFIGURED'),
      critical: true
    }
  ];

  // Provider Variables: Graceful degradation with CONFIGURATION_REQUIRED status
  const providerVars = [
    { name: 'STRIPE_SECRET_KEY', label: 'Stripe Merchant Card/ACH Gateway' },
    { name: 'STRIPE_PUBLISHABLE_KEY', label: 'Stripe Client Publishable Key' },
    { name: 'STRIPE_WEBHOOK_SECRET', label: 'Stripe Webhook Cryptographic Verification' },
    { name: 'TWILIO_ACCOUNT_SID', label: 'Twilio SMS Account' },
    { name: 'TWILIO_AUTH_TOKEN', label: 'Twilio SMS Auth' },
    { name: 'TWILIO_PHONE_NUMBER', label: 'Twilio Sender Phone' },
    { name: 'BREVO_API_KEY', label: 'Brevo Transactional Email Key' },
    { name: 'BREVO_FROM_EMAIL', label: 'Brevo Verified Sender Address' },
    // WhatsApp keys commented out (uncomment when Meta Cloud API credentials are provided):
    // { name: 'META_WHATSAPP_ACCESS_TOKEN', label: 'Meta WhatsApp Cloud Access Token' },
    // { name: 'META_WHATSAPP_PHONE_ID', label: 'Meta WhatsApp Phone Identifier' },
    { name: 'APP_URL', label: 'Application Canonical URL (CORS / Links)' },
    { name: 'FRONTEND_URL', label: 'Frontend Client URL (CORS)' },
    { name: 'CRON_SECRET', label: 'Cloud Scheduler Inbound Auth' }
  ];

  let hasCriticalFailure = false;

  console.log('\n[IronPulse] ==================== ENVIRONMENT CONFIGURATION AUDIT ====================');

  // Audit Critical Variables
  for (const item of criticalVars) {
    const val = process.env[item.name];
    const status = item.validate(val);
    const isOk = status === 'CONFIGURED';
    console.log(`[IronPulse] ${item.name.padEnd(28)} : ${status}`);
    report.push({ name: item.name, status, critical: true });
    if (!isOk) {
      hasCriticalFailure = true;
    }
  }

  // Audit Provider Variables
  for (const item of providerVars) {
    const val = process.env[item.name];
    const status = val && val.trim() !== '' ? 'CONFIGURED' : 'MISSING (Feature enters CONFIGURATION_REQUIRED)';
    console.log(`[IronPulse] ${item.name.padEnd(28)} : ${status}`);
    report.push({ name: item.name, status, critical: false, label: item.label });
  }

  console.log('[IronPulse] ===========================================================================\n');

  if (hasCriticalFailure && isProduction) {
    const errorMsg = '[IronPulse FATAL] Critical production configuration failed. Halting application startup.';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  return { valid: !hasCriticalFailure, report };
};

export default validateProductionConfig;
