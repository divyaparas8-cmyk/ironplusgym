import https from 'https';
import prisma from '../prisma.js';

const COUNTRY_DIALING_CODES = {
  US: '+1',
  USA: '+1',
  'UNITED STATES': '+1',
  CA: '+1',
  CAN: '+1',
  CANADA: '+1',
  GB: '+44',
  UK: '+44',
  'UNITED KINGDOM': '+44',
  IN: '+91',
  IND: '+91',
  INDIA: '+91',
  AU: '+61',
  AUS: '+61',
  AUSTRALIA: '+61',
  DE: '+49',
  GERMANY: '+49',
  FR: '+33',
  FRANCE: '+33',
  ES: '+34',
  SPAIN: '+34',
  IT: '+39',
  ITALY: '+39'
};

/**
 * Robust E.164 phone number normalization
 * - Preserves existing valid E.164 (+...)
 * - Converts local 10-digit numbers using tenant facility country code
 * - Validates length and characters
 */
export const normalizePhoneNumber = (rawPhone, defaultCountry = 'US') => {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return { isValid: false, error: 'Recipient phone number is missing' };
  }

  let cleaned = rawPhone.trim().replace(/[\s\-\(\)\.]/g, '');
  if (!cleaned) {
    return { isValid: false, error: 'Phone number contains no numeric characters' };
  }

  // Already E.164 format with +
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1);
    if (/^\d{7,15}$/.test(digits)) {
      return { isValid: true, phone: cleaned };
    }
    return { isValid: false, error: `Invalid E.164 format: ${cleaned}` };
  }

  // International 00 prefix
  if (cleaned.startsWith('00')) {
    const digits = cleaned.slice(2);
    if (/^\d{7,15}$/.test(digits)) {
      return { isValid: true, phone: `+${digits}` };
    }
  }

  // 10-digit Australian local starting with 0 (e.g. 0412345678 -> +61412345678)
  if (/^0[2-9]\d{8}$/.test(cleaned) && ['AU', 'AUS', 'AUSTRALIA'].includes(String(defaultCountry || '').toUpperCase())) {
    return { isValid: true, phone: `+61${cleaned.slice(1)}` };
  }

  // 9-digit Australian local without leading 0 (e.g. 412345678 -> +61412345678)
  if (/^[2-9]\d{8}$/.test(cleaned) && ['AU', 'AUS', 'AUSTRALIA'].includes(String(defaultCountry || '').toUpperCase())) {
    return { isValid: true, phone: `+61${cleaned}` };
  }

  // 10-digit local number: resolve prefix strictly from gym country configuration
  if (/^\d{10}$/.test(cleaned)) {
    const countryKey = String(defaultCountry || 'US').trim().toUpperCase();
    const prefix = process.env.DEFAULT_COUNTRY_CODE || COUNTRY_DIALING_CODES[countryKey] || '+1';
    return { isValid: true, phone: `${prefix}${cleaned}` };
  }

  // 11-digit North American local with leading 1
  if (/^1\d{10}$/.test(cleaned)) {
    return { isValid: true, phone: `+${cleaned}` };
  }

  // 11-digit UK local starting with 0
  if (/^0\d{10}$/.test(cleaned) && ['GB', 'UK', 'UNITED KINGDOM'].includes(String(defaultCountry || '').toUpperCase())) {
    return { isValid: true, phone: `+44${cleaned.slice(1)}` };
  }

  return {
    isValid: false,
    error: `Unable to normalize phone number '${rawPhone}'. Must be valid E.164 (e.g. +15128904400 or 10 digits)`
  };
};

/**
 * Multi-channel Notification Dispatcher
 *
 * Handles template placeholder replacement and live external provider dispatch:
 * - SendGrid / Brevo for Email
 * - Twilio for SMS
 * - Meta Cloud API for WhatsApp
 * Never falsely claims SENT if external providers fail or are unconfigured.
 */
export class NotificationDispatcher {
  /**
   * Safely interpolate template variables
   */
  static interpolate(text, context = {}) {
    if (!text || typeof text !== 'string') return '';

    return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
      const value = context[key];
      return value !== undefined && value !== null ? String(value) : match;
    });
  }

  /**
   * HTTPS helper
   */
  static async _sendHttpsRequest(options, postData) {
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body });
        });
      });
      req.on('error', (err) => reject(err));
      if (postData) req.write(postData);
      req.end();
    });
  }

  /**
   * Dispatch a notification through the requested channel
   */
  static async dispatch({ gymId, channel, recipient, subject, message, context = {} }) {
    const interpolatedMessage = this.interpolate(message, context);
    const interpolatedSubject = subject ? this.interpolate(subject, context) : 'IronPulse Notification';

    const channelProviderMap = {
      EMAIL: 'SENDGRID_EMAIL',
      SMS: 'TWILIO_SMS',
      WHATSAPP: 'WHATSAPP_API'
    };

    const providerType = channelProviderMap[channel];

    // Check if the tenant has an active gateway for this channel
    let integration = null;
    if (providerType && gymId) {
      integration = await prisma.integrationSetting.findUnique({
        where: {
          gymId_provider: {
            gymId,
            provider: providerType
          }
        }
      });
    }

    const config = integration?.config || {};

    // -------------------------------------------------------------
    // CHANNEL: EMAIL (Brevo or SendGrid)
    // -------------------------------------------------------------
    if (channel === 'EMAIL') {
      const brevoKey = config.brevoApiKey || process.env.BREVO_API_KEY;
      const sendgridKey = config.apiKey || process.env.SENDGRID_API_KEY;
      const fromEmail = config.fromEmail || process.env.BREVO_FROM_EMAIL || process.env.BREVO_SENDER_EMAIL || process.env.SENDGRID_FROM_EMAIL || process.env.SYSTEM_FROM_EMAIL || 'billing@ironpulse.club';

      // 1. Try Brevo (Sendinblue) API if configured
      if (brevoKey && !brevoKey.includes('placeholder')) {
        try {
          const emailPayload = JSON.stringify({
            sender: { name: config.fromName || 'IronPulse Gym Billing', email: fromEmail },
            to: [{ email: recipient, name: context.memberName || 'Gym Member' }],
            subject: interpolatedSubject,
            textContent: interpolatedMessage,
            htmlContent: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222; padding: 16px;"><p>${interpolatedMessage.replace(/\n/g, '<br/>')}</p><br/><hr style="border:0;border-top:1px solid #eee;"/><p style="font-size:11px;color:#888;">IronPulse Athletic Club & Performance Lab</p></div>`
          });

          const options = {
            hostname: 'api.brevo.com',
            port: 443,
            path: '/v3/smtp/email',
            method: 'POST',
            headers: {
              'api-key': brevoKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Content-Length': Buffer.byteLength(emailPayload)
            }
          };

          const res = await this._sendHttpsRequest(options, emailPayload);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            return {
              delivered: true,
              status: 'SENT',
              provider: 'BREVO',
              sentAt: new Date(),
              message: interpolatedMessage,
              subject: interpolatedSubject
            };
          } else {
            return {
              delivered: false,
              status: 'FAILED',
              provider: 'BREVO',
              message: interpolatedMessage,
              failureReason: `Brevo error (HTTP ${res.statusCode}): ${res.body}`
            };
          }
        } catch (err) {
          return {
            delivered: false,
            status: 'FAILED',
            provider: 'BREVO',
            message: interpolatedMessage,
            failureReason: `Brevo network error: ${err.message}`
          };
        }
      }

      // 2. Try SendGrid as fallback
      if (sendgridKey && !sendgridKey.includes('placeholder')) {
        try {
          const emailPayload = JSON.stringify({
            personalizations: [{ to: [{ email: recipient }] }],
            from: { email: fromEmail, name: 'IronPulse Gym Billing' },
            subject: interpolatedSubject,
            content: [{ type: 'text/plain', value: interpolatedMessage }]
          });

          const options = {
            hostname: 'api.sendgrid.com',
            port: 443,
            path: '/v3/mail/send',
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${sendgridKey}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(emailPayload)
            }
          };

          const res = await this._sendHttpsRequest(options, emailPayload);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            return {
              delivered: true,
              status: 'SENT',
              provider: 'SENDGRID',
              sentAt: new Date(),
              message: interpolatedMessage,
              subject: interpolatedSubject
            };
          } else {
            return {
              delivered: false,
              status: 'FAILED',
              provider: 'SENDGRID',
              message: interpolatedMessage,
              failureReason: `SendGrid error (HTTP ${res.statusCode}): ${res.body}`
            };
          }
        } catch (err) {
          return {
            delivered: false,
            status: 'FAILED',
            provider: 'SENDGRID',
            message: interpolatedMessage,
            failureReason: `SendGrid network error: ${err.message}`
          };
        }
      }

      // Neither configured
      return {
        delivered: false,
        status: 'PENDING',
        provider: 'UNCONFIGURED',
        message: interpolatedMessage,
        subject: interpolatedSubject,
        failureReason: 'Email provider API key (BREVO_API_KEY or SENDGRID_API_KEY) is required for live email dispatch. Queued as PENDING.'
      };
    }

    // -------------------------------------------------------------
    // CHANNEL: SMS (Twilio)
    // -------------------------------------------------------------
    if (channel === 'SMS') {
      const accountSid = config.accountSid || process.env.TWILIO_ACCOUNT_SID;
      const authToken = config.authToken || process.env.TWILIO_AUTH_TOKEN;
      const fromPhone = config.fromPhone || process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !fromPhone || accountSid.includes('placeholder')) {
        return {
          delivered: false,
          status: 'PENDING',
          message: interpolatedMessage,
          subject: interpolatedSubject,
          failureReason: 'Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER) are required for live SMS dispatch. Queued as CONFIGURATION_REQUIRED.'
        };
      }

      // Resolve gym country to inform local phone number formatting
      let gymCountry = 'US';
      if (gymId) {
        try {
          const gymRecord = await prisma.gym.findUnique({
            where: { id: gymId },
            select: { country: true }
          });
          if (gymRecord?.country) gymCountry = gymRecord.country.trim().toUpperCase();
        } catch {}
      }

      const phoneNorm = normalizePhoneNumber(recipient, gymCountry);
      if (!phoneNorm.isValid) {
        return {
          delivered: false,
          status: 'FAILED',
          message: interpolatedMessage,
          subject: interpolatedSubject,
          failureReason: `Phone normalization error: ${phoneNorm.error}`
        };
      }

      const toPhone = phoneNorm.phone;

      try {
        const postData = new URLSearchParams({
          To: toPhone,
          From: fromPhone,
          Body: interpolatedMessage
        }).toString();

        const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const options = {
          hostname: 'api.twilio.com',
          port: 443,
          path: `/2010-04-01/Accounts/${accountSid}/Messages.json`,
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        const res = await this._sendHttpsRequest(options, postData);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          return {
            delivered: true,
            status: 'SENT',
            sentAt: new Date(),
            message: interpolatedMessage,
            subject: interpolatedSubject
          };
        } else {
          let failureReason = `Twilio error (HTTP ${res.statusCode}): ${res.body}`;
          try {
            const errObj = JSON.parse(res.body);
            if (errObj.code === 21608) {
              failureReason = `Twilio trial account restriction (Error 21608): The recipient number is unverified. Trial accounts can only send SMS to numbers verified in your Twilio Console. Project upgrade required for production.`;
            } else if (errObj.message) {
              failureReason = `Twilio Error (${errObj.code || res.statusCode}): ${errObj.message}`;
            }
          } catch {}

          return {
            delivered: false,
            status: 'FAILED',
            message: interpolatedMessage,
            failureReason
          };
        }
      } catch (err) {
        return {
          delivered: false,
          status: 'FAILED',
          message: interpolatedMessage,
          failureReason: `Twilio network error: ${err.message}`
        };
      }
    }

    // -------------------------------------------------------------
    // CHANNEL: WHATSAPP (Meta Cloud API)
    // -------------------------------------------------------------
    if (channel === 'WHATSAPP') {
      const apiToken = config.apiToken || process.env.META_WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN;
      const phoneNumberId = config.phoneNumberId || process.env.META_WHATSAPP_PHONE_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;

      if (!apiToken || !phoneNumberId || apiToken.includes('placeholder')) {
        return {
          delivered: false,
          success: false,
          status: 'CONFIGURATION_REQUIRED',
          message: interpolatedMessage,
          subject: interpolatedSubject,
          failureReason: 'WhatsApp Cloud API credentials (META_WHATSAPP_ACCESS_TOKEN, META_WHATSAPP_PHONE_ID) are required for live dispatch. Status: CONFIGURATION_REQUIRED.'
        };
      }

      try {
        const postData = JSON.stringify({
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'text',
          text: { body: interpolatedMessage }
        });

        const options = {
          hostname: 'graph.facebook.com',
          port: 443,
          path: `/v18.0/${phoneNumberId}/messages`,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        const res = await this._sendHttpsRequest(options, postData);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          return {
            delivered: true,
            status: 'SENT',
            sentAt: new Date(),
            message: interpolatedMessage,
            subject: interpolatedSubject
          };
        } else {
          return {
            delivered: false,
            status: 'FAILED',
            message: interpolatedMessage,
            failureReason: `WhatsApp API error (HTTP ${res.statusCode}): ${res.body}`
          };
        }
      } catch (err) {
        return {
          delivered: false,
          status: 'FAILED',
          message: interpolatedMessage,
          failureReason: `WhatsApp network error: ${err.message}`
        };
      }
    }

    return {
      delivered: false,
      status: 'FAILED',
      failureReason: `Unsupported notification channel '${channel}'`
    };
  }

  /**
   * Convenience helper for email dispatch
   */
  static async dispatchEmail({ to, subject, body, gymId = null, context = {} }) {
    return this.dispatch({
      gymId,
      channel: 'EMAIL',
      recipient: to,
      subject,
      message: body,
      context
    });
  }

  /**
   * Convenience helper for SMS dispatch
   */
  static async dispatchSms({ to, message, gymId = null, context = {} }) {
    return this.dispatch({
      gymId,
      channel: 'SMS',
      recipient: to,
      message,
      context
    });
  }

  /**
   * Convenience helper for WhatsApp dispatch
   */
  static async dispatchWhatsApp({ to, message, gymId = null, context = {} }) {
    return this.dispatch({
      gymId,
      channel: 'WHATSAPP',
      recipient: to,
      message,
      context
    });
  }
}

export default NotificationDispatcher;
