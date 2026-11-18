import { createHmac } from 'crypto';
import {
  avisoPrecios,
  ciudadEnSedes,
  construirPrompt,
  construirPromptExtraccion,
  dentroDeHorario,
  esTelefonoDePrueba,
  extraerCodigoLanding,
  extraerMensajes,
  extraerPedidoCotizacion,
  firmaValida,
  GUION_POR_DEFECTO,
  limpiarCotizacion,
  limpiarGuion,
  limpiarPlantilla,
  limpiarTelefonosPrueba,
  separarEscalado,
  separarListo,
  textoCotizacionCustodia,
  textoCotizacionProductos,
  ultimosNueve,
  ventanaAbierta,
} from './whatsapp-bot.util';

describe('whatsapp-bot.util', () => {
  describe('firmaValida', () => {
    const cuerpo = Buffer.from('{"entry":[]}');
    const firma = 'sha256=' + createHmac('sha256', 'secreto').update(cuerpo).digest('hex');

    it('acepta la firma correcta', () => {
      expect(firmaValida(cuerpo, firma, 'secreto')).toBe(true);
    });
    it('rechaza otra firma, otro secreto o datos faltantes', () => {
      expect(firmaValida(cuerpo, firma.replace(/.$/, '0'), 'secreto')).toBe(false);
      expect(firmaValida(cuerpo, firma, 'otro')).toBe(false);
      expect(firmaValida(undefined, firma, 'secreto')).toBe(false);
      expect(firmaValida(cuerpo, undefined, 'secreto')).toBe(false);
      expect(firmaValida(cuerpo, firma, undefined)).toBe(false);
    });
  });

  describe('extraerMensajes', () => {
    const aviso = (mensaje: Record<string, unknown>) => ({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '123' },
                contacts: [{ wa_id: '593990000001', profile: { name: 'Ana' } }],
                messages: [{ from: '593990000001', id: 'wamid.1', ...mensaje }],
              },
            },
          ],
        },
      ],
    });

    it('lee un texto con el nombre del contacto', () => {
      const [m] = extraerMensajes(aviso({ type: 'text', text: { body: 'hola' } }));
      expect(m).toMatchObject({ phoneNumberId: '123', telefono: '593990000001', nombre: 'Ana', texto: 'hola', esTexto: true, media: null });
    });
    it('marca audio e imagen para descargarlos', () => {
      const [a] = extraerMensajes(aviso({ type: 'audio', audio: { id: 'm1', mime_type: 'audio/ogg; codecs=opus' } }));
      expect(a.esTexto).toBe(false);
      expect(a.media).toEqual({ tipo: 'audio', mediaId: 'm1', mime: 'audio/ogg; codecs=opus' });
      const [i] = extraerMensajes(aviso({ type: 'image', image: { id: 'm2', mime_type: 'image/jpeg' } }));
      expect(i.media?.tipo).toBe('imagen');
    });
    it('ignora avisos de estado y mensajes sin identificador', () => {
      expect(extraerMensajes({ entry: [{ changes: [{ value: { metadata: { phone_number_id: '1' }, statuses: [{}] } }] }] })).toEqual([]);
      expect(extraerMensajes(null)).toEqual([]);
    });
  });

  describe('horario y ventana de 24 h', () => {
    it('usa la hora de Ecuador (UTC-5)', () => {
      // Lunes 2026-11-16 14:00 UTC = 09:00 en Ecuador
      expect(dentroDeHorario(new Date('2026-11-16T14:00:00Z'))).toBe(true);
      // Lunes 23:00 UTC = 18:00 en Ecuador: ya cerró
      expect(dentroDeHorario(new Date('2026-11-16T23:00:00Z'))).toBe(false);
      // Domingo
      expect(dentroDeHorario(new Date('2026-11-15T17:00:00Z'))).toBe(false);
    });
    it('la ventana se cierra a las 24 h', () => {
      const ahora = new Date('2026-11-17T12:00:00Z');
      expect(ventanaAbierta(new Date('2026-11-16T13:00:00Z'), ahora)).toBe(true);
      expect(ventanaAbierta(new Date('2026-11-16T11:00:00Z'), ahora)).toBe(false);
      expect(ventanaAbierta(null, ahora)).toBe(false);
    });
  });

  describe('etiquetas del bot', () => {
    it('separa [ESCALAR] y [LISTO] del texto del cliente', () => {
      expect(separarEscalado('Un asesor te responde. [ESCALAR: queja]')).toEqual({ texto: 'Un asesor te responde.', motivo: 'queja' });
      expect(separarEscalado('Hola').motivo).toBeNull();
      expect(separarListo('Gracias. [LISTO: VIP en Loja, 2 guardias]')).toEqual({ texto: 'Gracias.', resumen: 'VIP en Loja, 2 guardias' });
      expect(separarListo('Hola').resumen).toBeNull();
    });
    it('lee el pedido de cotización aunque el texto lleve corchetes', () => {
      const r = extraerPedidoCotizacion('Listo. [COTIZAR_CUSTODIA: {"origen":"Quito","destino":"Guayaquil","extras":[{"id":"a","cantidad":1}]}]');
      expect(r.texto).toBe('Listo.');
      expect(r.pedido).toEqual({ tipo: 'CUSTODIA', datos: { origen: 'Quito', destino: 'Guayaquil', extras: [{ id: 'a', cantidad: 1 }] } });
      expect(r.ilegible).toBe(false);
    });
    it('marca como ilegible un pedido roto y no inventa datos', () => {
      const r = extraerPedidoCotizacion('hola [COTIZAR_PRODUCTOS: {rota');
      expect(r.pedido).toBeNull();
      expect(r.ilegible).toBe(true);
      expect(extraerPedidoCotizacion('sin etiqueta').ilegible).toBe(false);
    });
    it('reconoce el código de la landing', () => {
      expect(extraerCodigoLanding('hola, mi código es gms-wa-abc234')).toBe('GMS-WA-ABC234');
      expect(extraerCodigoLanding('hola')).toBeNull();
    });
  });

  describe('teléfonos y sedes', () => {
    it('compara teléfonos de Ecuador por los últimos 9 dígitos', () => {
      expect(ultimosNueve('0991234567')).toBe('991234567');
      expect(ultimosNueve('+593 99 123 4567')).toBe('991234567');
      expect(ultimosNueve('12345')).toBe('');
    });
    it('una ciudad fuera de las sedes no está cubierta', () => {
      const sedes = ['Quito', 'Guayaquil'];
      expect(ciudadEnSedes('Quito, Pichincha', sedes)).toBe(true);
      expect(ciudadEnSedes('GUAYAQUIL', sedes)).toBe(true);
      expect(ciudadEnSedes('Loja', sedes)).toBe(false);
      expect(ciudadEnSedes('Loja', [])).toBe(true); // sin sedes configuradas no se restringe
      expect(ciudadEnSedes('', sedes)).toBe(true);
    });
  });

  describe('limpieza de lo que se guarda', () => {
    it('limpia el guion: ids únicos, sin áreas vacías y mínimos acotados', () => {
      const g = limpiarGuion({
        pilares: [
          { nombre: 'Gemeseg', cotiza: ['CUSTODIA', 'OTRA'], preguntas: ['a', ' ', 'b'] },
          { nombre: 'Gemeseg' },
          { nombre: '   ' },
        ],
        minimoRespuestas: 99,
        sedes: [' Quito ', '', 'Loja'],
      });
      expect(g.pilares).toHaveLength(2);
      expect(g.pilares[0]).toMatchObject({ id: 'gemeseg', cotiza: ['CUSTODIA'], preguntas: ['a', 'b'], activo: true });
      expect(g.pilares[1].id).toBe('gemeseg-2');
      expect(g.minimoRespuestas).toBe(12);
      expect(g.sedes).toEqual(['Quito', 'Loja']);
    });
    it('valida la plantilla y los márgenes', () => {
      expect(limpiarPlantilla({ nombre: 'Reanudar_Chat', idioma: 'es_EC' })).toMatchObject({ nombre: 'reanudar_chat', idioma: 'es_EC' });
      expect(limpiarPlantilla({ nombre: 'con espacios!' }).nombre).toBe('');
      expect(limpiarCotizacion({ margenCustodiaPct: 200, margenProductosPct: '' })).toEqual({ margenCustodiaPct: 30, margenProductosPct: null });
      expect(limpiarCotizacion({ margenCustodiaPct: 25 }).margenCustodiaPct).toBe(25);
    });
  });

  describe('textos al cliente', () => {
    it('la cotización solo lleva precios de venta y el aviso de valor referencial', () => {
      const t = textoCotizacionProductos(
        [{ nombre: 'Cámara IP', unidad: 'u', cantidad: 2, precioUnitario: 50, total: 100 }],
        { subtotal: 100, iva: 15, total: 115 },
        'Gemeseg',
      );
      expect(t).toContain('2 × Cámara IP (u): $50.00 c/u = $100.00');
      expect(t).toContain('Total $115.00');
      expect(t).toContain(avisoPrecios('Gemeseg'));
      const c = textoCotizacionCustodia(
        { origen: 'Quito', destino: 'Guayaquil', kmServicio: 420, incluyeRegreso: true, agentes: 2, choferes: 1, vehiculos: 1, viajes: 1, precioSinIva: 500, iva: 75, total: 575 },
        'Gemeseg',
      );
      expect(c).toContain('Quito → Guayaquil (ida y regreso)');
      expect(c).toContain('Total $575.00');
      expect(c).toContain('no son precios finales');
    });
  });

  describe('construirPrompt', () => {
    const base = { empresa: 'Gemeseg', conocimiento: 'Operamos en todo el país.', dentroDeHorario: true, primerMensaje: false, correcciones: [] };
    const guion = limpiarGuion({
      pilares: [{ nombre: 'Seguridad', preguntas: ['¿Dónde?'], cotiza: ['CUSTODIA'] }],
      sedes: ['Quito'],
      privacidad: 'Usamos tus datos solo para atenderte.',
    });

    it('sin áreas configuradas no cotiza y pide indagar antes de pasar a un asesor', () => {
      const p = construirPrompt(base);
      expect(p).toContain('No des precios');
      expect(p).toContain('INDAGAR ANTES DE PASAR A UN ASESOR');
      expect(p).toContain('NO está registrado como cliente');
    });
    it('con áreas incluye sus preguntas, las sedes y la regla de que el modelo no escribe precios', () => {
      const p = construirPrompt({
        ...base,
        guion,
        cotizacion: { catalogo: [], regiones: ['Costa'], extras: [] },
      });
      expect(p).toContain('¿Dónde?');
      expect(p).toContain('SEDES (ciudades donde la empresa tiene oficina): Quito');
      expect(p).toContain('NUNCA escribas precios');
      expect(p).toContain('REGIONES: Costa');
    });
    it('saluda una sola vez en el primer mensaje y agrega el aviso de datos', () => {
      const p = construirPrompt({ ...base, primerMensaje: true, guion });
      expect(p).toContain('salúdalo UNA sola vez');
      expect(p).toContain('Usamos tus datos solo para atenderte.');
    });
    it('un cliente actual recibe sus contratos sin valores', () => {
      const p = construirPrompt({
        ...base,
        cliente: { nombre: 'Acme', contratos: [{ titulo: 'Guardianía', tipo: 'SERVICIO', estado: 'VIGENTE', desde: '2026-01-01', hasta: '2026-12-31', servicios: ['Guardia'] }] },
      });
      expect(p).toContain('CLIENTE ACTUAL');
      expect(p).toContain('hasta 2026-12-31');
      expect(p).not.toMatch(/\$\s?\d/);
    });
  });
});

describe('teléfonos de prueba', () => {
  it('limpia a solo dígitos, sin repetidos ni basura', () => {
    expect(limpiarTelefonosPrueba('0979 459-793, +593 97 945 9793;\n123, abc')).toEqual(['0979459793', '593979459793']);
    expect(limpiarTelefonosPrueba(['09 7945 9793', '09 7945 9793'])).toEqual(['0979459793']);
    expect(limpiarTelefonosPrueba(undefined)).toEqual([]);
  });

  it('reconoce el mismo número escrito con o sin código de país', () => {
    const lista = limpiarTelefonosPrueba('0979459793');
    expect(esTelefonoDePrueba(lista, '593979459793')).toBe(true);
    expect(esTelefonoDePrueba(lista, '+593 97 945 9793')).toBe(true);
    expect(esTelefonoDePrueba(lista, '593999999999')).toBe(false);
  });

  it('con la lista vacía nadie es de prueba', () => {
    expect(esTelefonoDePrueba([], '593979459793')).toBe(false);
    expect(esTelefonoDePrueba(undefined, '593979459793')).toBe(false);
  });
});

describe('construirPromptExtraccion', () => {
  const guion = { ...GUION_POR_DEFECTO, pilares: [{ id: 'g', nombre: 'Seguridad', descripcion: '', cotiza: ['CUSTODIA' as const], preguntas: [], activo: true }] };
  const cotizacion = { catalogo: [], regiones: ['Costa', 'Sierra'], extras: [] };

  it('pide solo la etiqueta o NINGUNA, con las regiones y sin precios', () => {
    const p = construirPromptExtraccion({ cotizacion, guion });
    expect(p).toContain('NINGUNA');
    expect(p).toContain('COTIZAR_CUSTODIA');
    expect(p).toContain('REGIONES: Costa, Sierra');
    expect(p).not.toContain('LISTADO DE PRODUCTOS');
    expect(p).not.toMatch(/\$\s?\d/);
  });
});
