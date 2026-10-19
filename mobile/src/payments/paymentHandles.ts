// How a driver gets paid back. Money never moves through Seawolf Rides: riders tap a button
// that opens Venmo or PayPal with the amount filled in, or copy the driver's Zelle contact.

export type PaymentMethod = 'venmo' | 'paypal' | 'zelle';
export const PAYMENT_METHODS: PaymentMethod[] = ['venmo', 'paypal', 'zelle'];

export interface PaymentHandles {
  venmo?: string;
  paypal?: string;
  zelle?: string;
}

export const methodLabels: Record<PaymentMethod, string> = {
  venmo: 'Venmo',
  paypal: 'PayPal',
  zelle: 'Zelle',
};

export const methodHints: Record<PaymentMethod, string> = {
  venmo: 'Your Venmo username, like @alex-chen',
  paypal: 'Your PayPal.Me name, like alexchen',
  zelle: 'The email or US phone number your bank uses for Zelle',
};

const VENMO = /^@?[A-Za-z0-9_-]{5,30}$/;
const PAYPAL = /^[A-Za-z0-9]{1,20}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,}$/;
const PHONE = /^\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;

// Normalizes one handle, or returns an error message a person can act on.
export function normalizeHandle(
  method: PaymentMethod,
  raw: string,
): { value?: string; error?: string } {
  const text = raw.trim();
  if (!text) return {};
  if (method === 'venmo') {
    if (!VENMO.test(text)) return { error: 'Venmo usernames are 5–30 letters, numbers, - or _.' };
    return { value: text.replace(/^@/, '') };
  }
  if (method === 'paypal') {
    const name = text.replace(/^(https?:\/\/)?(www\.)?paypal\.me\//i, '').replace(/\/$/, '');
    if (!PAYPAL.test(name)) return { error: 'Use your PayPal.Me name: letters and numbers only.' };
    return { value: name };
  }
  if (EMAIL.test(text)) return { value: text.toLowerCase() };
  if (PHONE.test(text)) return { value: text.replace(/[^\d+]/g, '') };
  return { error: 'Enter the email or US phone number linked to Zelle.' };
}

export function parsePaymentHandles(value: unknown): PaymentHandles {
  if (!value || typeof value !== 'object') return {};
  const v = value as Record<string, unknown>;
  const handles: PaymentHandles = {};
  for (const method of PAYMENT_METHODS) {
    if (typeof v[method] !== 'string') continue;
    const normalized = normalizeHandle(method, v[method] as string);
    if (normalized.value) handles[method] = normalized.value;
  }
  return handles;
}

export function displayHandle(method: PaymentMethod, handle: string): string {
  return method === 'venmo' ? `@${handle}` : method === 'paypal' ? `paypal.me/${handle}` : handle;
}

// Universal links open the installed app with the amount and note filled in, and fall back to
// the website otherwise. Zelle has no public link format (it lives inside banking apps), so it
// is copied instead.
export function paymentLink(
  method: PaymentMethod,
  handle: string,
  cents: number,
  note: string,
): { url?: string; copy?: string } {
  const amount = (cents / 100).toFixed(2);
  if (method === 'venmo') {
    const params = new URLSearchParams({ txn: 'pay', amount, note });
    return { url: `https://venmo.com/${encodeURIComponent(handle)}?${params.toString()}` };
  }
  if (method === 'paypal') return { url: `https://paypal.me/${encodeURIComponent(handle)}/${amount}USD` };
  return { copy: handle };
}
