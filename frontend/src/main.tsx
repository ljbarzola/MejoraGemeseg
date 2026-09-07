import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Si la pestana quedo abierta durante un despliegue, los chunks con hash del
// build anterior ya no existen en Hosting y las rutas lazy fallan en blanco.
// Recargar una sola vez toma el index.html nuevo; el flag evita bucles.
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem('chunkReloaded')) return;
  sessionStorage.setItem('chunkReloaded', '1');
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
