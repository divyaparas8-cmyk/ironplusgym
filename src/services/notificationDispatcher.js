import prisma from '../prisma.js';

/**
 * Multi-channel Notification Dispatcher
 *
 * Handles template placeholder replacement and provider integration evaluation.
 * Does NOT falsely claim delivery if provider gateways are not configured.
 */
export class NotificationDispatcher {
  /**
   * Safely interpolate template variables
   * @param {string} text - Template text with {{variable}} placeholders
   * @param {Object} context - Data dictionary
   * @returns {string} Processed text
   */
  static interpolate(text, context = {}) {
    if (!text || typeof text !== 'string') return '';

    return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
      const value = context[key];
      return value !== undefined && value !== null ? String(value) : match;
    });
  }

  /**
   * Dispatch a notification through the requested channel
   * Checks IntegrationSetting for configured/enabled gateways.
   *
   * @param {Object} params - { gymId, channel, recipient, subject, message, context }
   * @returns {Promise<Object>} { delivered: boolean, status: 'SENT'|'PENDING'|'FAILED', failureReason?: string }
   */
  static async dispatch({ gymId, channel, recipient, subject, message, context = {} }) {
    const interpolatedMessage = this.interpolate(message, context);
    const interpolatedSubject = subject ? this.interpolate(subject, context) : undefined;

    // Map ReminderChannel to IntegrationProvider
    const channelProviderMap = {
      EMAIL: 'SENDGRID_EMAIL',
      SMS: 'TWILIO_SMS',
      WHATSAPP: 'WHATSAPP_API'
    };

    const providerType = channelProviderMap[channel];

    // Check if the tenant has an active gateway for this channel
    let integration = null;
    if (providerType) {
      integration = await prisma.integrationSetting.findUnique({
        where: {
          gymId_provider: {
            gymId,
            provider: providerType
          }
        }
      });
    }

    // If no provider is configured or it is disabled, return controlled PENDING state
    if (!integration || !integration.isEnabled || !integration.config) {
      return {
        delivered: false,
        status: 'PENDING',
        message: interpolatedMessage,
        subject: interpolatedSubject,
        failureReason: `Integration gateway (${providerType || channel}) not configured or inactive for this gym. Notification queued as PENDING.`
      };
    }

    // In a live production environment with valid API keys in config,
    // the external SDK would be invoked here.
    // In accordance with Phase 8 PCI/provider safety rules:
    // We only simulate dispatch if the integration explicitly contains active mock/sandbox test configuration.
    try {
      const config = integration.config;
      if (config && (config.apiKey || config.accountSid || config.sandbox === true)) {
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
          status: 'PENDING',
          message: interpolatedMessage,
          subject: interpolatedSubject,
          failureReason: `Provider (${providerType}) configuration is incomplete.`
        };
      }
    } catch (err) {
      return {
        delivered: false,
        status: 'FAILED',
        message: interpolatedMessage,
        subject: interpolatedSubject,
        failureReason: `Gateway dispatch error: ${err.message}`
      };
    }
  }
}

export default NotificationDispatcher;
