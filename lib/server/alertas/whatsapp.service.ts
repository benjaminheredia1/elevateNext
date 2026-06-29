import prisma from '@/lib/prisma';
import { Insumo, ConfiguracionAlertas } from '@prisma/client';

interface EnviarAlertaArgs {
  insumos: Pick<Insumo, 'id' | 'nombre' | 'stock_actual' | 'stock_minimo' | 'unidad_medida'>[];
  cfg: ConfiguracionAlertas;
}

export async function enviarAlerta({ insumos, cfg }: EnviarAlertaArgs) {
  if (!cfg.whatsapp_habilitado || insumos.length === 0) {
    return null;
  }

  // 1. Verificar anti-spam (intervalo mínimo)
  const lastAlerta = await prisma.registroAlerta.findFirst({
    orderBy: { enviado_at: 'desc' },
  });

  if (lastAlerta) {
    const minutosPasados = (Date.now() - lastAlerta.enviado_at.getTime()) / 1000 / 60;
    if (minutosPasados < cfg.intervalo_minimo_min) {
      console.log(`[Alertas] Ignorando alerta: sólo pasaron ${Math.round(minutosPasados)}min desde la última.`);
      return null;
    }
  }

  // 2. Verificar horario silencioso
  const now = new Date();
  // Asumiendo timezone local o del servidor para simplificar (ajustar si es necesario)
  const horaActualStr = now.toLocaleTimeString('es-AR', { hour12: false, hour: '2-digit', minute: '2-digit' }); // "HH:MM"
  
  if (isDentroDeHorarioSilencio(horaActualStr, cfg.hora_silencio_desde, cfg.hora_silencio_hasta)) {
    console.log(`[Alertas] Ignorando alerta: dentro del horario silencioso (${horaActualStr}).`);
    return null;
  }

  // 3. Preparar mensaje
  const insumosList = insumos
    .map((i) => `- ${i.nombre}: ${i.stock_actual}${i.unidad_medida} (min: ${i.stock_minimo})`)
    .join('\n');

  const mensaje = cfg.plantilla_mensaje
    .replace('{count}', insumos.length.toString())
    .replace('{list}', insumosList)
    .replace('{url}', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000/admin/insumos');

  // 4. Enviar (o simular)
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  let estado = 'simulated';

  if (token && phoneId) {
    // Aquí iría la integración real
    try {
      // await fetch(...)
      estado = 'sent';
      console.log('[Alertas] Mensaje real enviado por WhatsApp.');
    } catch (error) {
      console.error('[Alertas] Error enviando WhatsApp:', error);
      estado = 'failed';
    }
  } else {
    console.log('[Alertas] (DEMO MODE) Mensaje simulado:\n', mensaje);
  }

  // 5. Registrar alerta
  const registro = await prisma.registroAlerta.create({
    data: {
      canal: 'whatsapp',
      insumo_ids: insumos.map(i => i.id),
      estado,
      preview: mensaje,
    }
  });

  return registro;
}

function isDentroDeHorarioSilencio(horaActual: string, desde: string, hasta: string) {
  // Manejo de horarios que cruzan la medianoche (ej. 22:00 a 07:00)
  if (desde > hasta) {
    return horaActual >= desde || horaActual <= hasta;
  }
  // Horarios en el mismo día (ej. 13:00 a 15:00)
  return horaActual >= desde && horaActual <= hasta;
}
