import { defineConfig } from 'vitest/config';

// Pruebas de la lógica pura del frontend (cálculos del Cotizador). No usan el navegador.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
