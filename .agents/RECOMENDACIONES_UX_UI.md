# Recomendaciones UX/UI - GEMESEG Mejora

Reglas funcionales de UX/UI para aplicar de forma consistente en todo el sistema.

---

## 1. Login y Pantalla de Inicio

### Regla: Pantalla Limpia sin Identidad de Empresa

- La pantalla de login no debe mostrar logo de ninguna empresa.
- Debe iniciar con colores genéricos y un placeholder neutral (sin marca).
- La identidad de la empresa (logo, colores, nombre) solo se carga cuando el usuario ingresa su correo con dominio válido (`@dominioempresa.com`).
- Una vez detectado el dominio, se aplica el tema de la empresa de forma inmediata.
- El Navbar muestra el logo de la empresa una vez autenticado. Si no hay logo configurado, muestra el nombre de la empresa como texto.

---

## 2. Validación de Formularios

### Regla: Indicar Exactamente Qué Falta

Cuando el usuario presione "Crear" o "Guardar" y haya campos requeridos vacíos:

- Marcar en rojo el borde del campo faltante.
- Mostrar un mensaje debajo del campo indicando que es requerido.
- Hacer scroll automático al primer campo faltante.
- Poner el cursor (foco) en ese campo.
- Limpiar el indicador de error cuando el usuario empiece a interactuar con el campo.
- No confiar únicamente en un mensaje genérico arriba del formulario — el usuario debe saber exactamente qué campo le falta.

---

## 3. Impresión de Documentos

### Regla: Solo Datos de la Empresa Actual

- Al imprimir cualquier documento (kárdex, liquidación, embarque), ocultar el menú de navegación, la barra lateral y los botones de acción.
- Mostrar únicamente el logo y nombre de la empresa del usuario actual.
- Nunca mostrar datos, nombres o logos de otras empresas.
- El encabezado de impresión debe incluir: logo de empresa, nombre de empresa, y título del documento.
- Las tablas deben mantener los mismos colores del sistema (verde entradas, rojo salidas, azul saldos).
- Usar espaciado compacto, sin sombras, bordes sólidos.

---

## 4. Navegación y Botones "Volver"

### Regla: Preservar Contexto de Navegación

- Todos los botones "← Volver" deben regresar a la pantalla de origen, no a una ruta fija.
- Si el usuario llegó desde una lista, debe volver a esa lista.
- Si no hay contexto de origen, usar un fallback lógico (ej: desde "Nueva Recepción" volver a "Recepciones").

---

## 5. Formato de Fechas

### Regla: Formato Local Consistente

- Mostrar todas las fechas en formato local (DD/MM/YYYY).
- Nunca mostrar fechas en formato ISO al usuario.
- Los campos de entrada de fecha usan formato ISO internamente, pero se muestran en formato local.

---

## 6. Unidades de Medida

### Regla: Siempre Mostrar la Unidad

- En tablas de kárdex, incluir columna de unidades junto a la cantidad.
- En listados, mostrar la unidad original de entrada del lote.
- En formularios, los labels deben indicar la unidad seleccionada actualmente.
- En tarjetas de conversión, mostrar la fórmula completa (ej: `1.5 T × 1,000 kg/T = 1,500 kg`).

---

## 7. Layout de Formularios

### Regla: Formularios Amplios con Conversión Visible

- Los formularios deben tener un ancho máximo de 900px.
- Los campos deben distribuirse en filas con wrap (no desbordarse).
- Las tarjetas de conversión de unidades deben ser siempre visibles cuando apliquen.
- Los campos deben tener un ancho mínimo de 200px para evitar campos demasiado estrechos.

---

## 8. Empresas y Multitenancy

### Regla: Aislamiento Total entre Empresas

- Cada empresa solo ve sus propios datos, logo, nombre y configuración.
- El tema de la empresa (colores, logo) se aplica vía el contexto del sistema y persiste en localStorage.
- Cuando se actualiza el logo o los colores de la empresa, el cambio debe reflejarse inmediatamente en todo el sistema (Navbar, impresiones, etc.).
- Las secciones que no aplican a una empresa deben ocultarse completamente del menú.

---

## 9. Mensajes de Error

### Regla: Errores Accionables

- Los mensajes de error deben decir qué falló y cómo corregirlo.
- Evitar mensajes genéricos como "Error al crear" sin contexto.
- Ejemples de buenos mensajes:
  - "Complete los campos requeridos marcados en rojo"
  - "El número de guía ya existe"
  - "La contraseña debe tener al menos 7 caracteres"

---

## 10. Estados Vacíos

### Regla: Mensaje Descriptivo con Acción Sugerida

- Cuando no hay datos, mostrar un ícono contextual y un mensaje claro.
- Si hay una acción posible (ej: crear el primer registro), mostrar un botón de acción.
- Ejemplo: "No hay recepciones registradas" con botón "+ Nueva Recepción".

---

## 11. Configuración de Empresa

### Regla: Cambios Reflejados en Tiempo Real

- Cuando el administrador sube un logo o cambia colores, el cambio debe verse inmediatamente en el Navbar y en todo el sistema.
- No requerir recarga de página para ver los cambios.
- La vista previa en la pantalla de configuración debe reflejar exactamente lo que verá el usuario.

---

## 12. Custodias - Cambio de Estado

### Regla: Select Inline con Colores

- El cambio de estado se hace desde la lista directamente (dropdown inline).
- Cada estado tiene un color distinctivo: amarillo (LISTO), azul (EN_CAMINO), verde (LLEGÓ).
- El dropdown muestra el color del estado actual como borde y fondo.
- Al cambiar estado, la UI se actualiza inmediatamente sin recargar la pagina.
- Solo se pueden seleccionar estados validos del flujo.

---

## 13. Custodias - Impresion de Orden

### Regla: Confirmacion Post-Registro

- Despues de registrar una custodia, mostrar modal de confirmacion.
- El modal ofrece dos opciones: "Imprimir PDF" o "Ahora no".
- El PDF de Orden de Custodia incluye: datos generales, ruta, personal, y bloque de firmas (Cliente, Chofer, Custodio 1, Custodio 2).
- El PDF se abre en nueva pestana para impresion directa.

---

## 14. Custodias - Seleccion de Personal

### Regla: Busqueda con Empleados de Drive

- El formulario de custodias usa un componente de busqueda (EmpleadoSelect).
- Muestra empleados del folder "Custodios" de Google Drive + candidatos con puesto "Custodio".
- Permite busqueda por nombre o cedula.
- Exclusion automatica: chofer y custodios deben ser personas distintas.
- Opcion "+ Manual" para ingreso directo si el empleado no esta en la lista.

---

## 15. Encabezado de Página con Botones de Acción

### Regla: Volver Aparte, Título a la Izquierda, Acciones a la Derecha

Patrón de referencia: `ReclutamientoPage.tsx`, replicado en `AdministrativeStaff.tsx`, `EntidadesList.tsx`, `GuardiasList.tsx` y, desde 2026-09-10, en el módulo de Documentación (`ContractsList.tsx`, `ContractTemplateConfig.tsx`, `GenerarDocumento.tsx`) — estos tres partieron con un header de una sola fila (Volver + título mezclados a la izquierda) y se corrigieron a este patrón tras revisión del usuario. Usar esta misma estructura en cualquier pantalla nueva que tenga botón "Volver" + acciones de cabecera (sincronizar, configurar, etc.), en vez de mezclarlos todos en una sola fila.

- El botón "← Volver" va **en su propia fila, arriba de todo**, alineado a la izquierda (`alignSelf: 'flex-start'`) — nunca mezclado con los botones de acción a la derecha.
- Debajo, una fila con `justifyContent: 'space-between'`: el eyebrow + `<h1>` del título a la izquierda, y un contenedor `.header-actions` a la derecha con los botones de acción.
- El `.page-header-row` exterior necesita `flexDirection: 'column', alignItems: 'stretch'` para apilar la fila del "Volver" sobre la fila de título+acciones.
- **Orden de los botones dentro de `.header-actions`**: primero la acción "más usada"/de refresco (ej. "Sincronizar"), después la de configuración (ej. "Configurar Drive"). Todos como `.btn-secondary` — no mezclar un `.btn-secondary` con un `.auth-btn` en el mismo grupo, se ven con proporciones distintas.
- `.header-actions` ya existe en `styles.css` (`display:flex; flex-wrap:wrap; gap:10px; justify-content:flex-end`) — hace que los botones se acomoden en filas completas en pantallas angostas en vez de apretarse o partirse a la mitad.
- Iconos: usar `lucide-react` (ya instalado), nunca emojis sueltos. `ArrowLeft` para Volver, `RefreshCw` para sincronizar (con `className={syncing ? 'spin' : undefined}` para el giro de carga — la clase `.spin` ya existe en `styles.css`), `Settings` para configurar.
- Ejemplo mínimo:
```tsx
<div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
  <button className="cacao-back-btn" onClick={() => navigate('/ruta-anterior')} style={{ alignSelf: 'flex-start' }}>
    <ArrowLeft size={16} strokeWidth={2.4} /> Volver
  </button>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
    <div>
      <p className="page-eyebrow">EYEBROW</p>
      <h1>Título de la página</h1>
    </div>
    <div className="header-actions">
      <button className="btn-secondary" onClick={handleSync} disabled={syncing}>
        <RefreshCw size={16} className={syncing ? 'spin' : undefined} /> {syncing ? 'Sincronizando...' : 'Sincronizar'}
      </button>
      <button className="btn-secondary" onClick={openConfigModal}>
        <Settings size={16} /> Configurar
      </button>
    </div>
  </div>
</div>
```

---

## 16. Inputs/Selects Sueltos Dentro de un Modal

### Regla: No Dejar un `<input>`/`<select>` Fuera de `.form-group`

Encontrado en `EntidadesList.tsx` (modal "Requisitos Generales", 2026-09-09): un formulario dentro de un modal tenía sus `<input>`/`<select>` sueltos (solo con `style` inline para el tamaño/flex), sin envolverlos en un `<div className="form-group">`. El estilo real de los campos (`padding`, `border: 2px solid var(--borde-input)`, `border-radius: 12px`, etc.) vive en las reglas `.form-group input`/`.form-group select` de `styles.css` — sin ese wrapper, el campo cae al estilo nativo del navegador (borde cuadrado, línea negra fina, sin color), y se ve roto aunque el resto del modal esté bien.

- Al armar un formulario inline dentro de un modal (no solo el típico `.form-group` con `<label>` arriba), sigue envolviendo cada `<input>`/`<select>`/`<textarea>` en un `<div className="form-group">`, aunque no lleve `<label>`.
- Como red de seguridad adicional, `styles.css` ahora define el mismo estilo para cualquier `input`/`select`/`textarea` dentro de `.modal-body` (sin necesidad de `.form-group`) — así que este bug específico no debería repetirse, pero seguir usando `.form-group` es el patrón preferido por consistencia con el resto de la app.

---

## 17. Bordes de Input Visibles y Secciones Diferenciadas Dentro de un Modal

### Regla: `--borde-input`, no `--gris-claro`, para bordes de campos — y agrupar campos relacionados en tarjetas con encabezado, no solo con una línea

Encontrado en `GuardiaFichaModal.tsx` (2026-09-09), reportado por el usuario como "formato terrible, no se diferencian los bordes de los inputs". Causa raíz: `.form-group input`/`.form-group select` (y varios otros campos: `.form-textarea`, `.admin-search`, `.filter-select`, `.chat-input`, `.role-select`) usaban `border: 2px solid var(--gris-claro)` — pero `--gris-claro` es `#E6E6E6`, casi blanco, pensado para **fondos**, no para bordes. Sobre el fondo blanco de un modal, ese borde es casi invisible. Se agregó `--borde-input: #A0AEC0` (definida en `:root`, `styles.css`) — un gris con contraste real — y se migraron todos los selectores de campo real (no botones/chips/cards, esos conservan `--gris-claro` a propósito) a usarla.

- **Cualquier campo de formulario nuevo** (input/select/textarea) hereda esto automáticamente vía `.form-group input`/`.form-group select`, o vía el fallback de `.modal-body` (regla §16) — no hace falta hacer nada extra.
- **Si vas a definir un borde de campo a mano** (inline `style`, o una clase nueva), usa `var(--borde-input)`, nunca `var(--gris-claro)` — ese token es para fondos/botones/chips, no para algo que el usuario tiene que distinguir como "un campo donde escribir".
- **Agrupar campos relacionados**: cuando un modal tiene dos o más grupos de campos conceptualmente distintos (ej. "Datos personales" vs "Datos laborales" en `GuardiaFichaModal.tsx`), envolver cada grupo en una tarjeta propia — fondo `#f8fafc`, borde `1px solid #dfe3ea`, `border-radius: 14px`, con un encabezado ícono+título (ver `SeccionCard` en `GuardiaFichaModal.tsx`, o `RequisitoRow`/las secciones de nivel en `EntidadesList.tsx` para el mismo patrón aplicado a listas) — en vez de solo un `<hr>`/`border-top` entre secciones. Una línea horizontal no comunica agrupación con suficiente fuerza visual; una tarjeta con fondo e ícono sí.

---

## 18. Tarjetas de KPI — Ícono en Línea, no en su Propia Fila

### Regla: Ícono + Valor en la Misma Fila, Nunca una Línea Dedicada Solo al Ícono

Encontrado en `PersonalDashboard.tsx` (2026-09-10), reportado por el usuario: "no tiene sentido que haya una línea solo para un ícono". La primera versión de `KpiCard` apilaba verticalmente ícono → valor → etiqueta, dejando una fila entera ocupada solo por el emoji.

- El ícono va a la izquierda, en la misma fila que el valor+etiqueta (`display:'flex', alignItems:'center', gap`), no arriba en su propia línea.
- Aplica a cualquier tarjeta de KPI/resumen nueva en el sistema (Dashboard general, Dashboard de RRHH, futuros dashboards de Cacao/Ventas/Custodias) — no repetir el layout apilado.

---

## 19. Botón de Ayuda en Dashboards de Módulo

### Regla: "?" en la Esquina Superior Derecha, Modal con Explicación Funcional (no Técnica)

Agregado en `PersonalDashboard.tsx` (2026-09-10) a pedido del usuario, como primer caso de un patrón a repetir en otros módulos si se pide:

- Botón `.btn-secondary` con ícono `HelpCircle` (`lucide-react`) y texto "Ayuda", ubicado en el `.page-header-row` del dashboard del módulo (a la derecha del título, gracias a `justify-content:space-between` que ya trae esa clase).
- Abre un modal (`modal modal-lg`, ver `RrhhHelpModal.tsx` como referencia) que explica **cada submódulo en lenguaje funcional**: qué es, para qué sirve, cómo se conecta con los demás — nunca nombres de tablas, endpoints, ni detalles de implementación. Está dirigido a quien usa el sistema, no a quien lo programa.
- Mantener este contenido sincronizado a mano cuando un submódulo se agrega, renombra o se quita de la navegación (ej. al fusionar Asignaciones+Movimientos en Historial, o al quitar Bitácoras del menú) — es texto para el usuario final, no se genera solo.

---

## Versión
- v1.6 - Septiembre 2026 (tarjetas de KPI sin línea dedicada al ícono + botón de Ayuda en dashboards de módulo)
- v1.5 - Septiembre 2026 (bordes de input visibles + tarjetas de sección en modales)
- v1.4 - Septiembre 2026 (añadida regla de inputs sueltos en modales)
- v1.3 - Septiembre 2026 (añadido patrón de encabezado con acciones)
