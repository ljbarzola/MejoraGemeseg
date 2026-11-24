import { claseEquipo, indicePuestosPorNombre, normalizarPuesto, puestoDeRegistro, puestoDeTenedor } from './inventario-puestos.util';

describe('inventario-puestos.util', () => {
  describe('normalizarPuesto', () => {
    it('quita tildes, pasa a mayúsculas y junta espacios', () => {
      expect(normalizarPuesto('  Garita   Norte ')).toBe('GARITA NORTE');
      expect(normalizarPuesto('Gestión de Riesgo')).toBe('GESTION RIESGO');
    });
    it('los guiones y puntos no cuentan: «CNEL COLONCHE» es «CNEL - COLONCHE»', () => {
      expect(normalizarPuesto('CNEL - COLONCHE')).toBe(normalizarPuesto('CNEL COLONCHE'));
      expect(normalizarPuesto('CNEL -CAC')).toBe(normalizarPuesto('CNEL CAC'));
      expect(normalizarPuesto('MIN. GOBIERNO / ORION 1')).toBe('MINISTERIO GOBIERNO ORION 1');
      expect(normalizarPuesto('MIN GOBIERNO ORION 1')).toBe(normalizarPuesto('MINISTERIO DE GOBIERNO - ORION 1'));
      expect(normalizarPuesto('KIA GALPON-NOCHE')).toBe(normalizarPuesto('Kia Galpon Noche'));
    });
    it('los números sí cuentan: la versión (2) es otro puesto', () => {
      expect(normalizarPuesto('DISTRITO CAÑAR (2)')).not.toBe(normalizarPuesto('DISTRITO CAÑAR'));
      expect(normalizarPuesto('DISTRITO CAÑAR (2)')).toBe('DISTRITO CANAR 2');
    });
    it('un nombre vacío o ausente queda vacío', () => {
      expect(normalizarPuesto(null)).toBe('');
      expect(normalizarPuesto(undefined)).toBe('');
      expect(normalizarPuesto('   ')).toBe('');
    });
  });

  describe('claseEquipo', () => {
    it('reconoce los chalecos por el nombre, con o sin tilde o mayúsculas', () => {
      expect(claseEquipo('Chaleco nivel IIIA', 'IMPLEMENTO')).toBe('CHALECO');
      expect(claseEquipo('CHALECO BALÍSTICO', 'UNIFORME')).toBe('CHALECO');
    });
    it('la munición va aparte y lo demás es otro equipo', () => {
      expect(claseEquipo('MUNICION CAL 38 SPL', 'MUNICION')).toBe('MUNICION');
      expect(claseEquipo('ALIMENTADORA', 'IMPLEMENTO')).toBe('OTRO');
      expect(claseEquipo('Camisa', 'UNIFORME')).toBe('OTRO');
      expect(claseEquipo(null, null)).toBe('OTRO');
    });
  });

  describe('indicePuestosPorNombre', () => {
    it('un nombre escrito con guion encuentra al puesto que lo lleva sin él', () => {
      const idx = indicePuestosPorNombre([{ id: 8, nombre: 'CNEL - COLONCHE' }]);
      expect(puestoDeRegistro(idx, null, 'CNEL COLONCHE')).toBe(8);
    });
    it('enlaza solo los nombres que identifican a un único puesto', () => {
      const idx = indicePuestosPorNombre([
        { id: 1, nombre: 'Garita Norte' },
        { id: 2, nombre: 'GARITA NORTE' }, // mismo nombre en otro contrato: no se adivina
        { id: 3, nombre: 'Distrito Urdaneta' },
      ]);
      expect(idx.get('GARITA NORTE')).toBeUndefined();
      expect(idx.get('DISTRITO URDANETA')).toBe(3);
    });
    it('ignora los puestos sin nombre', () => {
      expect(indicePuestosPorNombre([{ id: 1, nombre: '  ' }]).size).toBe(0);
    });
  });

  describe('puestoDeRegistro', () => {
    const idx = indicePuestosPorNombre([{ id: 3, nombre: 'Distrito Urdaneta' }]);
    it('manda el puestoId cuando lo tiene, aunque el nombre diga otra cosa', () => {
      expect(puestoDeRegistro(idx, 9, 'DISTRITO URDANETA')).toBe(9);
    });
    it('sin puestoId busca el puesto que se llame igual', () => {
      expect(puestoDeRegistro(idx, null, 'distrito  urdaneta')).toBe(3);
    });
    it('un nombre que no existe no se enlaza', () => {
      expect(puestoDeRegistro(idx, null, 'LOJA')).toBeNull();
      expect(puestoDeRegistro(idx, null, null)).toBeNull();
    });
  });

  describe('puestoDeTenedor', () => {
    const idx = indicePuestosPorNombre([{ id: 3, nombre: 'Distrito Urdaneta' }]);
    it('lee el id de una clave P:', () => {
      expect(puestoDeTenedor(idx, 'P:7', null)).toBe(7);
      expect(puestoDeTenedor(idx, 'P:xx', null)).toBeNull();
    });
    it('una clave N: se resuelve por nombre', () => {
      expect(puestoDeTenedor(idx, 'N:DISTRITO URDANETA', 'Distrito Urdaneta')).toBe(3);
      expect(puestoDeTenedor(idx, 'N:DISTRITO URDANETA', null)).toBe(3);
      expect(puestoDeTenedor(idx, 'N:OTRO', 'Otro')).toBeNull();
    });
    it('un guardia (G:) no es de ningún puesto', () => {
      expect(puestoDeTenedor(idx, 'G:0912345678', null)).toBeNull();
    });
  });
});
