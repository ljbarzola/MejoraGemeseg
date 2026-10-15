# Ventas y CRM — Cotizador

Copia fiel del cotizador independiente (`C:\Users\leidy\Documents\COTIZADOR`, JS + Supabase, `cotizador.gemeseg.com`) dentro de Ventas y CRM. Menú **Ventas y CRM → Cotizador**, ruta `/ventas/cotizador`, sección de permisos `VENTAS` (ver = consultar, escribir = guardar/editar el catálogo).

> **Decisión de Leidy (2026-10-15): copia fiel, no rediseño.** Misma lógica de precios, mismas pantallas y mismo PDF. El cotizador independiente **sigue funcionando** (convivencia); no se apaga ni se redirige. Los cambios de lógica que sí se hicieron (puntos 2, 3 y 4) se aplicaron **también** al original, que está en producción con cotizaciones reales.

## 1. Alcance y lo que NO se copió

Copiado: catálogo (equipos, materiales, servicios, servicios de instalación), kits, plantillas, cotizaciones con historial por estados, compartir / edición total, descuento, márgenes por proveedor, IVA, PDF por impresión.

No copiado (anotado, no olvidado):
- El **editor tipo hoja de cálculo** del catálogo en bloque y el **manual de ayuda** del original. El catálogo se edita producto a producto y por lotes desde `CatalogManager` (la API `POST /ventas/cotizador/catalogo/lote` existe y es transaccional).
- Envío por correo: el original tampoco lo tenía; la salida es «Imprimir / Guardar PDF».
- Vincular la cotización a una **oportunidad** (al emitirla pasa a «Cotizada» con su monto; al aceptarla ofrecer el contrato). Es lo siguiente natural; no entra todavía.

## 1b. Diseño y teléfono del asesor (2026-10-15)

- **Teléfono del emisor:** el encabezado de la hoja y del PDF muestra `Tel. <teléfono>`: el del **dueño** de la cotización (campo `ownerPhone`, su teléfono actual en `User.phone`; si la cotización es mía o nueva, el de mi perfil), y si no tiene, **+593 99 897 4909** como en el original (decisión de Leidy; constante `TELEFONO_POR_DEFECTO`). Ver `users.md` punto 8. No se congela en la cotización: si el asesor cambia de número, una reimpresión sale con el nuevo.
- **Diseño (pedido de Leidy: «parecido al original, sin perder la estructura de MejoraGemeseg»):** la barra de acciones va **debajo** del título (barra oscura con el degradado de la app; naranja solo en «Nueva cotización»); la cotización es **una hoja** (encabezado con logo/empresa/teléfono, N.º, fecha y estado editables ahí mismo, cliente, detalle, descuento, condiciones y totales) y **«Márgenes de ganancia» es un segmento ámbar marcado «Interno · no se imprime»** porque son costos que el cliente nunca ve. Campos con el estilo del resto de la app (borde 2 px, foco azul, etiquetas en frase normal, no en mayúsculas); el catálogo conserva su pestaña subrayada y el **divisor arrastrable** del original (ancho en `localStorage` `cotizador:ancho-catalogo`, doble clic lo restablece, flechas del teclado). Formularios de la hoja siempre en 2 columnas iguales (una regla `auto-fit` anterior los partía en 3 en pantallas anchas y los desalineaba: no volver a ella).
- Se quitó la tarjeta duplicada «Datos de la cotización» (N.º y fecha viven en el encabezado de la hoja).

## 2. El producto se identifica por su código, nunca por su posición

En el original la cotización guardaba `catalogIdx` (posición en la lista) y solo a veces `sourceId`: si se borraba un producto, los de abajo se corrían y una cotización vieja apuntaba a **otro** producto. Aquí cada línea guarda el **código** (`EQ-0001`, `MT-0001`, `SV-0001`; instalaciones `INST-001`) y una **copia del precio usado** (`snap`: costo, ganancia sí/no, instalación sí/no, servicio, proveedor).
- Las líneas importadas que solo traían posición quedan con `legacyPosition` y la pantalla avisa al abrir la cotización («Cotización antigua: …»). No se adivina ni se corrige en silencio (había 33 líneas dudosas de 3 vendedores; no se tocaron).
- `sanitizeLines` (backend) rechaza una línea sin código salvo que traiga `legacyPosition`.

## 3. Borrar = desactivar; el código no se reutiliza

- `DELETE /ventas/cotizador/productos/:id` (y `/instalaciones/:id`) solo pone `isActive=false`. El producto sale del catálogo y de las búsquedas; las cotizaciones y kits que lo usaron **no cambian** (se leen con el `snap` guardado).
- **Código nuevo = último + 1**, asignado por el servidor (el DTO ni siquiera acepta `code`). Contador `CotCounter` por empresa y tipo que **solo sube** (`reservarCodigo`: `INSERT … ON CONFLICT DO UPDATE SET lastSeq = GREATEST(lastSeq, máximo existente) + 1`), atómico aunque dos personas guarden a la vez. Borrar el último producto nunca devuelve su código.
- Un producto desactivado no se edita. El código y el tipo de un producto no se pueden cambiar.

## 4. Precio congelado y aviso de cambio

La cotización conserva el precio con que se hizo. Al abrirla, si el catálogo hoy tiene otro costo, sale un aviso («precio cuando cotizaste» vs «precio actual») y el botón **Usar precios actuales**; hasta que se pulse, el total sigue siendo el original. (Pedido de Leidy 2026-10-14 para minimizar el cambio de lo que ya vieron los clientes.)

## 5. Fórmulas (idénticas al original; `frontend/src/utils/cotizador/pricing.ts`, con `pricing.test.ts`)

- Precio antes de IVA de un producto = costo + `round(costo × margen / 100)` si tiene ganancia. Margen por proveedor (por defecto **15 %**, clave «Sin proveedor» para los que no tienen); instalaciones **35 %**; margen individual por línea opcional.
- Servicios: costo efectivo = mensual > 0 ? mensual : anual > 0 ? `round(anual/12, 2)` : unitario; llevan IVA pero no ganancia.
- **Descuento siempre ANTES del IVA** (porcentaje o valor fijo), IVA **15 %** una sola vez sobre el subtotal ya descontado; total = `Number((subtotal + iva).toFixed(2))`. Decisión 2026-10-14: el historial del original restaba el descuento fijo después del IVA y daba otro total que la pantalla y el PDF; se corrigió en los dos (los totales no se guardan, se recalculan, así que no hubo datos que arreglar).
- El PDF (`QuotePrint`) nunca muestra costo, ganancia ni proveedor. Hoja de impresión con CSS propio (`body:has(.cot-page)` oculta chat, avisos y botones flotantes).

## 6. Quién ve y quién modifica (reglas de las políticas del original)

Capa propia además de `VENTAS`; `resolveQuoteAccess` en `cotizador.util.ts`, prioridad **dueño > edición total > compartida > administrador**:

| Acceso | Ve | Modifica / cambia estado | Elimina | Comparte |
|---|---|---|---|---|
| Dueño (`owner`) | sí | sí | sí | sí |
| Edición total (`editor`: el dueño le dio acceso a todas las suyas) | sí | sí (queda a nombre del dueño) | no | no |
| Compartida (`shared`: una cotización) | sí | **no** (solo lectura; puede «Crear copia») | no | no |
| Administrador de la empresa (`admin`) | todas las de su empresa | **no** (solo lectura) | no | no |

Una cotización ajena o de otra empresa responde **404** (no revela que existe). Todo está acotado por `companyId`; el super administrador sin empresa no usa el Cotizador. Al compartir solo se aceptan usuarios **activos de la misma empresa** y no uno mismo.

## 7. Número de cotización

`COT-AAAAMMDD-NNNN`, con secuencia **global** por empresa (`CotQuoteSequence`, no se reinicia por día), fecha de **Ecuador** (UTC-5), única por empresa (`@@unique([companyId, quoteNumber])`). Se puede teclear otro número; si ya existe, responde 409 y el frontend pregunta («Cotización existente»). El filtro global de excepciones descarta campos extra de los errores, por eso existe `GET /cotizaciones/verificar-numero` (devuelve `existe` y, si es tuya, su `id`) en vez de leer un código del 409.

## 8. Datos y arranque

- Modelos Prisma: `CotProduct`, `CotInstallService`, `CotCounter`, `CotQuoteSequence`, `CotKit`, `CotTemplate`, `CotQuote`, `CotQuoteShare`, `CotEditGrant` (sin relaciones a `User`/`Company`, todo por `companyId`/`ownerId` numéricos).
- **Las tablas se crean al arrancar** (`cotizador.schema.ts` → `COTIZADOR_DDL`, DDL idempotente, enganchado en `VentasSchemaService`), como el resto de Ventas, porque el deploy no corre migraciones. `prisma/migrations/20261016_cotizador/migration.sql` existe solo como referencia; no usar `migrate deploy`.
- Líneas, cliente, márgenes y condiciones de la cotización van en columnas `Json` con **tamaño máximo comprobado** (`assertJsonSize`) y lista blanca de campos (`sanitizeLines/Client/Margins/KitComponents`).

## 9. Importar desde el cotizador original

`backend/prisma/import-cotizador.js`: `node prisma/import-cotizador.js --dump <volcado.sql> --company gemeseg [--dry-run] [--replace]`. Lee un volcado SQL del Supabase **exportado** (nunca se conecta a producción de Supabase), mapea usuarios por correo (los que no existan en MejoraGemeseg pasan a un administrador y se avisa), convierte las líneas a código con `snap`, copia el teléfono de cada asesor a `User.phone` si no tiene uno (y no es el número por defecto) y deja el contador de cada tipo en el máximo importado. `--replace` borra antes los datos del Cotizador de esa empresa (solo tablas `Cot*`; **solo para bases de prueba**: sin él, el importador se niega a correr si la empresa ya tiene datos). Comprobado contra 72 cotizaciones con datos de forma real: totales **idénticos** a los del original. Ejecutarlo contra la base real solo con autorización explícita de Leidy y después de un respaldo.

## 10. Pruebas

- Backend (jest): `cotizador.util.spec.ts`, `cotizador-catalogo.service.spec.ts`, `cotizador-cotizaciones.service.spec.ts` (49 pruebas; servicios instanciados con `PrismaService` simulado).
- Frontend: **primer** runner del frontend, **vitest** (`npm test` en `frontend/`, `vitest.config.ts`): `pricing.test.ts` y `quoteState.test.ts` (fórmulas y reglas del carrito).
- De punta a punta se probó con scripts de Playwright y una API real sobre una base local (no están en el repo): 39 pruebas de API y 27 de pantalla, incluida la vista de solo lectura de una compartida, el modo edición total, borrar un producto sin afectar cotizaciones y el aviso de precio cambiado.

## Endpoints (`/ventas/cotizador`, `VENTAS` ver/escribir; rutas fijas antes de las de `:id`)

- Catálogo: `GET catalogo` (`?incluirInactivos=true`), `GET siguiente-codigo?tipo=`, `POST catalogo/lote`, `POST/PATCH/DELETE productos(/:id)`, `POST/PATCH/DELETE instalaciones(/:id)`.
- Kits: `GET/POST kits`, `PATCH/DELETE kits/:id`. Plantillas: `GET/POST plantillas`, `PATCH/DELETE plantillas/:id`.
- Cotizaciones: `GET cotizaciones`, `GET cotizaciones/siguiente-numero`, `GET cotizaciones/verificar-numero`, `POST cotizaciones`, `GET/PATCH/DELETE cotizaciones/:id`, `PATCH cotizaciones/:id/estado`, `POST cotizaciones/:id/copiar`.
- Compartir: `GET cotizaciones/:id/compartidos`, `POST cotizaciones/:id/compartir`, `DELETE cotizaciones/:id/compartir/:userId`, `GET usuarios`, `GET/POST accesos-edicion`, `DELETE accesos-edicion/:userId`.

## Rutas frontend

- `/ventas/cotizador` (`SectionRoute section="VENTAS"`), página `pages/ventas/CotizadorPage.tsx`, componentes en `components/ventas/cotizador/`, lógica pura en `utils/cotizador/` (`types`, `pricing`, `quoteState`, `format`, `draft`), servicio `services/cotizador.service.ts`.

## Modelos de Prisma relevantes

`CotProduct`, `CotInstallService`, `CotCounter`, `CotQuoteSequence`, `CotKit`, `CotTemplate`, `CotQuote`, `CotQuoteShare`, `CotEditGrant`.
