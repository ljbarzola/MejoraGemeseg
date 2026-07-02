import { useNavigate } from 'react-router-dom';
import { getUser } from '../../services/auth.service';

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = getUser();

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">GEMESEG · Panel administrativo</p>
          <h1>Bienvenido{user ? `, ${user.fullName}` : ''}</h1>
          <p className="hero-text">
            Gestiona proyectos, tareas y el equipo de trabajo desde un solo lugar.
          </p>
        </div>
      </header>

      <main className="content-grid">
        <section
          className="panel clickable"
          onClick={() => navigate('/projects')}
        >
          <h2>Proyectos</h2>
          <p>Administra los proyectos del equipo, sus estados y fechas.</p>
          <span className="panel-link">Ver proyectos &rarr;</span>
        </section>

        <section className="panel highlight">
          <h2>Estado del sistema</h2>
          <ul>
            <li>Autenticación JWT activa</li>
            <li>Módulo de proyectos listo</li>
            <li>Paleta corporativa aplicada</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
