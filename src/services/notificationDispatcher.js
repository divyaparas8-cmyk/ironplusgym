import https from 'https';
import prisma from '../prisma.js';

/**
 * Multi-channel Notification Dispatcher
 *
 * Handles template placeholder replacement and live external provider dispatch:
 * - SendGrid for Email
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
    // CHANNEL: EMAIL (SendGrid)
    // -------------------------------------------------------------
    if (channel === 'EMAIL') {
      const apiKey = config.apiKey || process.env.SENDGRID_API_KEY;
      const fromEmail = config.fromEmail || process.env.SYSTEM_FROM_EMAIL || 'billing@ironpulse.club';

      if (!apiKey || apiKey.includes('placeholder') || !recipient) {
        return {
          delivered: false,
          status: 'PENDING',
          provider: 'UNCONFIGURED',
          message: interpolatedMessage,
          subject: interpolatedSubject,
          failureReason: 'SendGrid API key (SENDGRID_API_KEY) is required for live email dispatch. Queued as PENDING.'
        };
      }

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
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(emailPayload)
          }
        };

        const res = await this._sendHttpsRequest(options, emailPayload);
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
            failureReason: `SendGrid error (HTTP ${res.statusCode}): ${res.body}`
          };
        }
      } catch (err) {
        return {
          delivered: false,
          status: 'FAILED',
          message: interpolatedMessage,
          failureReason: `SendGrid network error: ${err.message}`
        };
      }
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
          failureReason: 'Twilio credentials (TWILIO_ACCOUNT_SID, AUTH_TOKEN, PHONE) are required for live SMS dispatch. Queued as PENDING.'
        };
      }

      try {
        const postData = new URLSearchParams({
          To: recipient,
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
          return {
            delivered: false,
            status: 'FAILED',
            message: interpolatedMessage,
            failureReason: `Twilio error (HTTP ${res.statusCode}): ${res.body}`
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
      const apiToken = config.apiToken || process.env.WHATSAPP_API_TOKEN;
      const phoneNumberId = config.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;

      if (!apiToken || !phoneNumberId || apiToken.includes('placeholder')) {
        return {
          delivered: false,
          status: 'PENDING',
          message: interpolatedMessage,
          subject: interpolatedSubject,
          failureReason: 'WhatsApp Cloud API credentials (WHATSAPP_API_TOKEN, PHONE_NUMBER_ID) are required for live dispatch. Queued as PENDING.'
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
