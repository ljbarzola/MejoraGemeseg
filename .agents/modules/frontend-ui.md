# Reglas de pantalla (frontend)

Reglas transversales de layout y tablas. Las reglas visuales/UX numeradas estan en `.agents/RECOMENDACIONES_UX_UI.md`. Estilos en `frontend/src/styles.css` (seccion `LAYOUT ESTABLE`) y `styles/vistas.css`.

## Layout y cabeceras
- Cabecera con titulo y acciones: `.page-title-row` (las acciones quedan a la derecha aunque se envuelvan) o, mejor, `<PageHeader>` (`components/common/PageHeader.tsx`). Los botones van al PIE del titulo, nunca arriba a la derecha (la campana de notificaciones es `position: fixed` en esa esquina; no anadir otro elemento fijo ahi). La descripcion va dentro del bloque del titulo con `className="page-title-help"`.
- Barras de filtros: `.filter-bar-fields` / `.filter-bar-actions`; `.filter-select` limita el ancho; `.icon-btn` para botones cuadrados con solo icono; `.truncate` en un `<span>` DENTRO del `<td>` (nunca en el `<td>`).
- **Ventas y CRM** usa dos plantillas: `<VentasPageHeader>` y `<PageTabs>`. Orden de la cabecera: nombre del modulo, titulo, descripcion corta y botones: «?» de ayuda (`btn-icon-toolbar` con `HelpCircle`, siempre primero) → secundarios → UN primario `auth-btn` al final. Debajo: pestanas → barra de filtros (`filter-bar`: buscador, `FilterField`, `ColumnPickerMenu`, `ClearFiltersButton`, `ExportTableButton`) → tarjeta `admin-section` con la tabla.
- **Sistemas** se construye igual (`<PageHeader eyebrow="Sistemas">`, sin flecha «Volver»); su dashboard reutiliza `components/ventas/dashboard/DashboardBits.tsx` y `DashboardGraficos.tsx`.
- **Configuracion vive en UN solo lugar por modulo.** Ninguna pantalla repite botones que solo apuntan a Configuracion. El catalogo de Servicios es la unica fuente de los servicios de Ventas.
- **Marco:** en escritorio (≥769px) `.main-content` tiene un marco claro (`--marco`) alrededor del panel gris `.page-container` (1480px); los botones flotantes quedan dentro del marco y el panel deja 64px abajo. Inicio es la unica excepcion de layout (bloque azul de bienvenida dentro de su propio panel gris); las demas pantallas usan `<PageHeader>`.
- **«Volver» solo en pantallas de detalle, formularios o de segundo nivel**; las que se abren desde el menu no lo llevan.
- Los controles que aparecen/desaparecen no van a media fila: se renderizan siempre (deshabilitados) o van en `RowActionsMenu`.
- Tareas: `TaskDetailModal` / `CreateTaskModal` abren como modal; el estado se cambia desde la lista con `TaskStatusMenu` (optimista, revierte si falla). `/tasks/:id` solo redirige a `/projects/:id?tarea=<id>`.
- Cotizador: el catalogo (izquierda) es un panel de alto fijo (`position: sticky`, `height: calc(100vh - 24px)`, solo `.cot-prod-list` hace scroll); la cotizacion (derecha) scrollea con la pagina. Sin `max-height` con numeros magicos.

## Acciones de fila
- Boton visible = el SIGUIENTE PASO de esa fila; todo lo demas en `RowActionsMenu`. Botones de fila: `btn-secondary icon-btn` + icono lucide (`Pencil`, `Trash2` rojo, `ClipboardList`) con `title` y `aria-label`; nada de «✕», «✎» ni emojis.
- Columna de acciones: `col-acciones` en `<th>` y `<td>` (64px; el texto del `<th>` en `<span className="visually-hidden">`). `col-acciones--ancha` (160px) si hay un boton de texto o hasta tres iconos; `col-acciones--iconos` (172px) hasta cuatro iconos, con `<div className="acciones-iconos">` dentro y un hueco fijo por boton. Varios botones de texto → `RowActionsMenu`.
- Texto que navega dentro de una tabla: `a.enlace-tabla`; nunca `<a>` ni `<button>` sin clase.
- En `.header-actions` un icono solo es `btn-icon-toolbar`.

## Tablas de listado (todas, por defecto)
- **Formato unico:** `className="tasks-table resizable-table"` + `useResizableColumns('<clave>')` (devuelve un callback ref, no `useRef`). Anchos persisten por usuario en `localStorage`; el divisor traga `mousedown` y `click` para no reordenar al arrastrar.
- **Filtros integrados en la cabecera de cada columna** con UN boton que ordena y filtra: `<th>Etiqueta <ColumnFilter cf={cf} col="campo" orden={...} /></th>` (`components/common/ColumnFilter.tsx`, `hooks/useColumnFilters.ts`). Orden: `cf.ordenDe('campo')` en tablas simples, o `ordenDe('campo')` + `<th {...thProps('campo')}>` de `useSortableTable` si ya lo usa; nunca ambos. No dibujar un `⇅` suelto. Texto con `localeCompare(…, 'es')`, numeros como numeros, vacios al final. Los dashboards y las bitacoras de contratacion publica solo ordenan (`SortIcon`).
- Arriba de la tabla solo: buscador, «Columnas», limpiar filtros, exportar. Sin barras de selectores externos.
- **«Columnas»:** `ColumnPickerMenu` + `useColumnPreferences`; la eleccion se guarda por usuario en `UserPreference` (`/users/me/preferences/columnas:<tabla>`), no en `localStorage`; solo **Aplicar** cambia la tabla. Fijar columnas: `pinned`/`maxPinned` al menu, `columnPrefs.set(keys, fijas)` y `data-fijas={columnPrefs.fijas}` en la tabla (maximo 2 fijas en total; solo funciona si la pantalla renderiza en el orden de `visible`; bajo 768px nada se fija).
- **«Tablas vivas»** (`utils/tablasVivas.ts`): todo `.tasks-table-wrapper` fuera de modales scrollea en su propia altura con cabecera fija, scrollbar horizontal visible, arrastre con mouse y primera columna fija. No anadir `overflow`/`max-height` a mano; `data-fijas` (0/1/2) define las fijas.
- **Exportar:** toda tabla de Ventas lleva `<ExportTableButton>` justo despues de `ClearFiltersButton`: pasa `columns`, `defaultKeys`, `rows` y `getValue(row, key)` con TEXTO PLANO; `historial` opcional. Excel/PDF los genera el backend (`POST /ventas/exportar-tabla`, `common/utils/tabla-export.util.ts`); CSV en el navegador con BOM.
- Limpiar filtros: siempre `ClearFiltersButton` (escoba, sin texto, siempre visible, deshabilitado sin filtros).
- **Filtros guardados en `localStorage`:** validar contra las opciones reales antes de consultar (cargar todas las paginas de un select paginado), guardar «sin filtro» como `''` y leer con `??`, y que se puedan limpiar.

## Modales
- Overlays: usar `onClick={onClose}` en `.modal-overlay`; `utils/overlayClickGuard.ts` ya ignora un clic cuyo `mousedown` no empezo en el overlay.
- Ventas, tres tamanos por CONTENIDO: `modal modal-ventas-sm` (470px: confirmaciones, listas de una columna, formularios cortos), `modal-ventas-md` (740px: formularios largos o con rejilla de servicios), `modal-ventas-lg` (970px: editores con tablas o mapas); `xl` (1250px) solo para un gestor de datos cuya tabla debe verse entera (catalogo del Cotizador). Nunca ancho inline ni `modal-lg`/`modal-xl` en Ventas. Los demas modulos migran a estos tamanos al tocarlos.
- Nunca `window.confirm/alert/prompt`: usar un dialogo propio.

## Dashboard comercial (Ventas)
- Un solo sistema: barra con «Cifras de» + UN «Periodo» compartido por las pestanas; tira de KPIs (`KpiFila`/`Contador`), tarjetas `Tarjeta`, rejilla de 16px, graficos SVG en `DashboardGraficos.tsx`.
- **Cada numero debe coincidir con la lista que abre su boton**, con el mismo alcance (`responsable=mine|all|<id>`); las pantallas destino lo leen. Una tarjeta que cuenta por periodo abre su lista con `?desde=&hasta=` y el filtro «Fecha» (`FiltroFecha`, `utils/rangoFechas.ts`) lo muestra y permite limpiarlo.
- No mostrar lo mismo dos veces (filtro y tira de tarjetas del mismo campo). Una fila «Estancados» abre la ficha en el sitio, sin `navigate()`.
- Los dias son dias de Ecuador (UTC-5) en filtros, columnas «Llego» y servidor; nunca comparar el dia UTC de una marca de tiempo.

## Sesion expirada
`auth.service.ts` revisa `exp`; un 401 fuera de `/auth/` cierra sesion y lleva a `/login` con «Tu sesion expiro». `usePermissions` reintenta si falla la carga, conserva la ultima buena y muestra «No se pudieron cargar todos tus modulos» con reintento.

## Estructura
`src/pages/<modulo>/` replica los modulos del backend; `src/services/` son envoltorios finos de una sola instancia Axios con interceptor JWT; toda pagina no trivial se carga con `React.lazy` en `App.tsx`; `ThemeContext` (`CompanyProvider`) da la marca por empresa y `PermissionsContext` el gating por seccion.
