// Africa's Talking SMS client (works with sandbox and live).
// Env: AT_USERNAME ("sandbox" for testing), AT_API_KEY, AT_SENDER_ID (optional, must be approved)

export interface SmsResult {
  number: string;
  ok: boolean;
  status: string;
}

export async function sendSms(to: string[], message: string): Promise<SmsResult[]> {
  const username = Deno.env.get('AT_USERNAME');
  const apiKey = Deno.env.get('AT_API_KEY');
  if (!username || !apiKey) throw new Error("Africa's Talking is not configured (AT_USERNAME / AT_API_KEY)");
  if (to.length === 0) return [];

  const host = username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
  const body = new URLSearchParams({ username, to: to.join(','), message });
  const sender = Deno.env.get('AT_SENDER_ID');
  if (sender) body.set('from', sender);

  const res = await fetch(`https://${host}/version1/messaging`, {
    method: 'POST',
    headers: {
      apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Africa's Talking error ${res.status}: ${text}`);
  }

  const json = await res.json();
  const recipients: Array<{ number: string; status: string; statusCode: number }> =
    json?.SMSMessageData?.Recipients ?? [];
  return recipients.map((r) => ({
    number: r.number,
    status: r.status,
    // 100 Processed, 101 Sent, 102 Queued
    ok: [100, 101, 102].includes(r.statusCode),
  }));
}
