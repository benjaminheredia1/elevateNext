'use client';

/**
 * Manda un recibo a la impresora.
 *
 * Va por un `<iframe>` oculto y no por `window.open`, que es como lo hacía la
 * referencia de Lucy: si el navegador bloquea el popup, `window.open` devuelve
 * null y el cajero hace clic sin que pase nada ni aparezca un aviso. El iframe
 * no se bloquea nunca y además funciona dentro de Electron, que es como corre
 * la caja en el mostrador.
 *
 * Devuelve `false` solo si el documento del iframe no se pudo crear, para que
 * la pantalla pueda avisar en lugar de fallar en silencio.
 */
export function imprimirRecibo(html: string): boolean {
  if (typeof document === 'undefined') return false;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  // Fuera de la vista pero con tamaño: un iframe de 0×0 no siempre maqueta y
  // sale una hoja en blanco.
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:80mm;height:200mm;border:0;';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  let quitado = false;
  const quitar = () => {
    if (quitado) return;
    quitado = true;
    iframe.remove();
  };

  const disparar = () => {
    const ventana = iframe.contentWindow;
    if (!ventana) return quitar();
    // El iframe se quita recién cuando el diálogo se cerró: sacarlo antes
    // cancela el trabajo de impresión a medio camino.
    ventana.addEventListener('afterprint', quitar);
    try {
      ventana.focus();
      ventana.print();
    } catch {
      quitar();
      return;
    }
    // Red de seguridad: si el navegador nunca emite `afterprint` (pasa en
    // algunas versiones de Chrome cuando se cancela), el iframe igual se va.
    window.setTimeout(quitar, 60000);
  };

  // Un respiro para que el layout se asiente antes de medir la página; sin él,
  // la primera impresión de la sesión sale con la última línea cortada.
  window.setTimeout(disparar, 150);
  return true;
}
