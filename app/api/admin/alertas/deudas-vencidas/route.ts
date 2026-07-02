import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { listarDeudasVencidas } from '@/lib/server/admin/cuentas-corrientes.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const vencidas = await listarDeudasVencidas();
    if (vencidas.length === 0) {
      return NextResponse.json({ message: 'No hay deudas vencidas', enviado: false });
    }

    const config = await prisma.configuracionAlertas.findUnique({ where: { id: 1 } });
    if (!config?.whatsapp_habilitado) {
      return NextResponse.json({
        message: 'WhatsApp deshabilitado. Deudas vencidas detectadas.',
        enviado: false,
        vencidas: vencidas.length,
        detalle: vencidas.map(d => ({
          id: d.id,
          contraparte: d.contraparte,
          saldo: Number(d.monto) - Number(d.monto_pagado),
          vencimiento: d.vencimiento,
        })),
      });
    }

    const lista = vencidas
      .map(d => {
        const saldo = (Number(d.monto) - Number(d.monto_pagado)).toFixed(2);
        const fecha = d.vencimiento
          ? new Date(d.vencimiento).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : 'sin fecha';
        return `- ${d.contraparte}: Bs. ${saldo} (venció ${fecha})`;
      })
      .join('\n');

    const mensaje = `⚠️ Elevate — Deudas vencidas: ${vencidas.length} cuenta(s) sin cobrar.\n${lista}`;

    const token   = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    let estado = 'simulated';

    if (token && phoneId && config.destinatarios.length > 0) {
      try {
        for (const numero of config.destinatarios) {
          await fetch(
            `https://graph.facebook.com/v18.0/${phoneId}/messages`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: numero,
                type: 'text',
                text: { body: mensaje },
              }),
            },
          );
        }
        estado = 'sent';
      } catch (err) {
        console.error('[Alertas Deudas] Error WhatsApp:', err);
        estado = 'failed';
      }
    } else {
      console.log('[Alertas Deudas] (DEMO MODE)\n', mensaje);
    }

    return NextResponse.json({
      message: estado === 'sent' ? 'Alerta enviada por WhatsApp' : 'Alerta simulada (modo demo)',
      enviado: estado === 'sent',
      vencidas: vencidas.length,
      estado,
      preview: mensaje,
    });
  } catch (e) { return handleApiError(e); }
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const vencidas = await listarDeudasVencidas();
    return NextResponse.json({
      vencidas: vencidas.length,
      detalle: vencidas.map(d => ({
        id: d.id,
        contraparte: d.contraparte,
        concepto: d.concepto,
        saldo: Number((Number(d.monto) - Number(d.monto_pagado)).toFixed(2)),
        vencimiento: d.vencimiento,
        cliente: d.cliente,
      })),
    });
  } catch (e) { return handleApiError(e); }
}
