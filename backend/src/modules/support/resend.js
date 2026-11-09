class ResendDeliveryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ResendDeliveryError';
  }
}

async function sendResendEmail(email, {
  apiKey = process.env.RESEND_API_KEY,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) throw new ResendDeliveryError('RESEND_API_KEY is not configured');
  if (typeof fetchImpl !== 'function') throw new ResendDeliveryError('Fetch is unavailable');

  let response;
  try {
    response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(email),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ResendDeliveryError('Unable to connect to Resend');
  }

  let result = {};
  try {
    result = await response.json();
  } catch {
    if (response.ok) throw new ResendDeliveryError('Resend returned an invalid response');
  }
  if (!response.ok) {
    throw new ResendDeliveryError(result.message || `Resend rejected the email (${response.status})`);
  }
  return result;
}

module.exports = {ResendDeliveryError, sendResendEmail};
