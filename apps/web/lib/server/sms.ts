import 'server-only';

// Africa's Talking SMS. Env: AT_USERNAME ("sandbox" while testing), AT_API_KEY, AT_SENDER_ID (optional)

export interface SmsResult {
  number: string;
  ok: boolean;
  status: string;
}

export async function sendSms(to: string[], message: string): Promise<SmsResult[]> {
  const username = process.env.AT_USERNAME;
  const apiKey = process.env.AT_API_KEY;
  if (!username || !apiKey) throw new Error("Africa's Talking is not configured (AT_USERNAME / AT_API_KEY)");
  if (to.length === 0) return [];

  const host = username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
  const form = new URLSearchParams({ username, to: to.join(','), message });
  if (process.env.AT_SENDER_ID) form.set('from', process.env.AT_SENDER_ID);

  const res = await fetch(`https://${host}/version1/messaging`, {
    method: 'POST',
    headers: { apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (!res.ok) throw new Error(`Africa's Talking error ${res.status}: ${await res.text()}`);

  const json = await res.json();
  const recipients: Array<{ number: string; status: string; statusCode: number }> = json?.SMSMessageData?.Recipients ?? [];
  // 100 Processed, 101 Sent, 102 Queued
  return recipients.map((r) => ({ number: r.number, status: r.status, ok: [100, 101, 102].includes(r.statusCode) }));
}
