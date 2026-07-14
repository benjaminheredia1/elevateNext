export function buildPasswordResetEmailHtml(params: {
  nombre: string;
  resetUrl: string;
  expiresMinutes: number;
}): string {
  const { nombre, resetUrl, expiresMinutes } = params;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#161616;border:1px solid rgba(255,255,255,0.1);border-radius:20px;overflow:hidden;">
          <tr>
            <td style="padding:32px 28px 8px;text-align:center;">
              <div style="display:inline-block;width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#ff5c19,#e04d10);line-height:56px;font-size:24px;color:#fff;">⚡</div>
              <h1 style="margin:16px 0 4px;color:#fff;font-size:24px;font-weight:800;">Restablecer contraseña</h1>
              <p style="margin:0;color:rgba(255,255,255,0.55);font-size:15px;">Elevate · Beyond Performance</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;color:rgba(255,255,255,0.85);font-size:15px;line-height:1.6;">
              <p style="margin:0 0 16px;">Hola ${escapeHtml(nombre)},</p>
              <p style="margin:0 0 24px;">Recibimos una solicitud para restablecer la contraseña de tu cuenta. Si fuiste tú, haz clic en el botón de abajo. El enlace expira en ${expiresMinutes} minutos.</p>
              <p style="margin:0 0 28px;text-align:center;">
                <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#ff5c19,#e04d10);color:#fff;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">Restablecer contraseña</a>
              </p>
              <p style="margin:0 0 12px;color:rgba(255,255,255,0.45);font-size:13px;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
              <p style="margin:0 0 24px;word-break:break-all;color:#ff7a42;font-size:13px;">${resetUrl}</p>
              <p style="margin:0;color:rgba(255,255,255,0.45);font-size:13px;">Si no solicitaste este cambio, puedes ignorar este correo. Tu contraseña no se modificará.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
