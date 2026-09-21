import crypto from 'crypto';

/**
 * Verify incoming webhook signature (Stripe & Standard HMAC-SHA256)
 *
 * @param {Object} params
 * @param {Buffer|string} params.rawBody - Raw request body buffer or string
 * @param {string} params.signatureHeader - Signature header from request (stripe-signature or x-webhook-signature)
 * @param {string} params.secret - Webhook signing secret
 * @param {number} [params.tolerance=300] - Replay attack tolerance in seconds (default 300s / 5m)
 * @returns {{ isValid: boolean, error?: string, timestamp?: number }}
 */
export const verifyWebhookSignature = ({
  rawBody,
  signatureHeader,
  secret,
  tolerance = 300
}) => {
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return { isValid: false, error: 'Missing or invalid signature header' };
  }

  if (!secret) {
    return { isValid: false, error: 'Webhook secret is not configured' };
  }

  if (!rawBody) {
    return { isValid: false, error: 'Missing raw request body for signature verification' };
  }

  const rawBodyString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);

  // 1. Check if signature follows Stripe specification: t=<timestamp>,v1=<signature>
  if (signatureHeader.includes('t=') && signatureHeader.includes('v1=')) {
    const parts = signatureHeader.split(',').reduce((acc, part) => {
      const [key, value] = part.trim().split('=');
      if (key && value) acc[key] = value;
      return acc;
    }, {});

    const timestamp = parseInt(parts.t, 10);
    const signature = parts.v1;

    if (isNaN(timestamp) || !signature) {
      return { isValid: false, error: 'Malformed timestamp or v1 signature' };
    }

    // Replay attack check
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - timestamp) > tolerance) {
      return { isValid: false, error: 'Webhook timestamp outside of tolerance window' };
    }

    // Stripe signed payload is: `${timestamp}.${rawBody}`
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBodyString}`)
      .digest('hex');

    try {
      const isMatch = crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
      return { isValid: isMatch, timestamp, error: isMatch ? null : 'Signature mismatch' };
    } catch {
      return { isValid: false, error: 'Invalid signature encoding or length mismatch' };
    }
  }

  // 2. Standard direct HMAC-SHA256 signature (e.g. x-webhook-signature as raw hex)
  const cleanSignature = signatureHeader.trim();
  const expectedDirectSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBodyString)
    .digest('hex');

  try {
    const isMatch = crypto.timingSafeEqual(
      Buffer.from(cleanSignature, 'hex'),
      Buffer.from(expectedDirectSignature, 'hex')
    );
    return { isValid: isMatch, error: isMatch ? null : 'Signature mismatch' };
  } catch {
    return { isValid: false, error: 'Invalid direct signature encoding' };
  }
};

/**
 * Utility helper to generate test signatures
 */
export const generateWebhookSignature = ({
  payload,
  secret,
  timestamp = Math.floor(Date.now() / 1000),
  scheme = 'stripe'
}) => {
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

  if (scheme === 'stripe') {
    const signedPayload = `${timestamp}.${payloadString}`;
    const v1 = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
    return `t=${timestamp},v1=${v1}`;
  }

  return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
};
