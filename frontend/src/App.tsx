const departments = ['Marketing', 'Operaciones', 'Contabilidad', 'TI'];

function App() {
  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">GEMESEG · Panel administrativo</p>
          <h1>Gestión corporativa de fichas y permisos</h1>
          <p className="hero-text">
            Control centralizado para personas, áreas y roles operativos con una experiencia visual alineada a la identidad corporativa.
          </p>
        </div>
      </header>

      <main className="content-grid">
        <section className="panel">
          <h2>Áreas corporativas</h2>
          <div className="chip-list">
            {departments.map((department) => (
              <span key={department} className="chip">
                {department}
              </span>
            ))}
          </div>
        </section>

        <section className="panel highlight">
          <h2>Estado del módulo</h2>
          <ul>
            <li>Frontend React + Vite listo</li>
            <li>Backend NestJS + Prisma preparado</li>
            <li>Paleta corporativa aplicada</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

export default App;
