// Supabase Auth "Send SMS" hook: Supabase generates the OTP, we deliver it with
// Africa's Talking (Supabase has no built-in Africa's Talking provider).
//
// Deploy with --no-verify-jwt; the request is authenticated by the hook signature.
// Env: SEND_SMS_HOOK_SECRET (the "v1,whsec_..." value from Auth > Hooks), AT_* vars.

import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { sendSms } from '../_shared/africastalking.ts';

Deno.serve(async (req) => {
  const payload = await req.text();
  const secret = (Deno.env.get('SEND_SMS_HOOK_SECRET') ?? '').replace('v1,whsec_', '');

  let data: { user: { phone: string }; sms: { otp: string } };
  try {
    const wh = new Webhook(secret);
    data = wh.verify(payload, Object.fromEntries(req.headers)) as typeof data;
  } catch {
    return new Response(JSON.stringify({ error: { http_code: 401, message: 'Invalid signature' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const phone = '+' + data.user.phone.replace(/^\+/, '');
  const message = `${data.sms.otp} is your SafeNest code. It expires in 10 minutes. Never share it with anyone.`;

  try {
    const [result] = await sendSms([phone], message);
    if (!result?.ok) throw new Error(result?.status ?? 'SMS rejected');
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('OTP SMS failed', e);
    return new Response(
      JSON.stringify({ error: { http_code: 500, message: 'Could not send the code. Please try again.' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
