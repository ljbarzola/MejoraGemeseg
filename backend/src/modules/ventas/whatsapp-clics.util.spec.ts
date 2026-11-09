import { limpiarClic, numeroLimpio } from './whatsapp-clics.util';

describe('numeroLimpio', () => {
  it('deja solo los dígitos del número', () => {
    expect(numeroLimpio('+593 96 913 5744')).toBe('593969135744');
    expect(numeroLimpio(593969135744)).toBe('593969135744');
  });

  it('descarta lo que no parece un teléfono', () => {
    expect(numeroLimpio('')).toBeNull();
    expect(numeroLimpio(undefined)).toBeNull();
    expect(numeroLimpio('12345')).toBeNull();
    expect(numeroLimpio('1'.repeat(16))).toBeNull();
    expect(numeroLimpio('<script>')).toBeNull();
  });
});

describe('limpiarClic y el número de WhatsApp', () => {
  it('guarda a qué número fue el clic (el vendedor de esa landing)', () => {
    const c = limpiarClic({ tracking_id: 'gms-wa-abc234', whatsapp_number: '593 99 123 4567' });
    expect(c?.whatsappNumber).toBe('593991234567');
  });

  it('sin número (script antiguo) guarda el clic igual, con el número vacío', () => {
    const c = limpiarClic({ tracking_id: 'GMS-WA-ABC234' });
    expect(c).not.toBeNull();
    expect(c?.whatsappNumber).toBeNull();
  });
});
