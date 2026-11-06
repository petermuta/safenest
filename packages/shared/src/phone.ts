// Uganda phone helpers. Mobile numbers are +256 followed by 9 digits starting with 7.

const UG_MOBILE = /^\+2567\d{8}$/;

/**
 * Normalise what people actually type into E.164:
 * "0772 123456", "772123456", "256772123456", "+256 772-123-456" -> "+256772123456".
 * Returns null if it isn't a valid Ugandan mobile number.
 */
export function normalizeUgPhone(input: string): string | null {
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith('256')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);

  const e164 = `+256${digits}`;
  return UG_MOBILE.test(e164) ? e164 : null;
}

export const isUgMobile = (phone: string) => UG_MOBILE.test(phone);

/** "+256772123456" -> "+256 772 123 456" for display. */
export function formatUgPhone(e164: string): string {
  if (!isUgMobile(e164)) return e164;
  const n = e164.slice(4);
  return `+256 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

/** Network guess by prefix — useful later for picking MTN MoMo vs Airtel Money. */
export function ugNetwork(e164: string): 'MTN' | 'Airtel' | 'Other' {
  const p = e164.slice(4, 6);
  if (['76', '77', '78', '79'].includes(p)) return 'MTN';
  if (['70', '74', '75'].includes(p)) return 'Airtel';
  return 'Other';
}
