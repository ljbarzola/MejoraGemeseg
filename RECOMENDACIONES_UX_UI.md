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

## Versión
- v1.1 - Julio 2026 (reescripción sin código, solo reglas funcionales)
