export function getFromEmail(): string {
  const raw = process.env.RESEND_FROM_EMAIL?.replace(/^"|"$/g, '') ?? 'onboarding@resend.dev';
  if (raw.includes('<')) return raw;
  return `Elevate <${raw}>`;
}

async function fetchWithTimeout(url: string, options: RequestInit, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.replace(/^"|"$/g, '');
  if (!apiKey) throw new Error('RESEND_API_KEY no configurada');

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (params.idempotencyKey) {
    headers['Idempotency-Key'] = params.idempotencyKey;
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from: getFromEmail(),
          to: [params.to],
          subject: params.subject,
          html: params.html,
        }),
      },
      15_000,
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado al contactar el servicio de correo');
    }
    throw error;
  }

  const body = (await response.json().catch(() => ({}))) as { message?: string; id?: string };

  if (!response.ok) {
    throw new Error(body.message ?? `Error al enviar correo (${response.status})`);
  }

  return body;
}
