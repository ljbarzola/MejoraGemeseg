import { useNavigate } from 'react-router-dom';

const STEPS = [
  {
    num: 1,
    title: 'Maestros (Configuración Inicial)',
    icon: '⚙️',
    color: '#4a5568',
    description: 'Antes de usar el sistema, configure los catálogos base que alimentarán todos los demás módulos.',
    details: [
      { label: 'Proveedores', desc: 'Registre cada proveedor con nombre, RUC, condición de pago y datos bancarios. Los proveedores aparecerán al crear recepciones y liquidaciones.', path: '/cacao/suppliers' },
      { label: 'Clientes / Exportadores', desc: 'Registre los destinos de exportación: nombre, país, contacto. Se usarán al crear embarques.', path: '/cacao/clients' },
      { label: 'Calidades de Cacao', desc: 'Defina las calidades (Convencional, Orgánico, Fino de Aroma, etc.) con sus descuentos por humedad e impurezas, y si tienen precio fijo o provisional.', path: '/cacao/qualities' },
    ],
    tip: 'Registre primero los proveedores y calidades. El sistema viene con 5 calidades predefinidas.',
  },
  {
    num: 2,
    title: 'Recepción de Cacao (Ingreso a Inventario)',
    icon: '📦',
    color: '#2b6cb0',
    description: 'Cada vez que un proveedor entrega cacao, registre una recepción. El sistema generará automáticamente un lote que viajará por todo el sistema.',
    details: [
      { label: 'Datos que registra', desc: 'Fecha, proveedor, guía de remisión, unidad de medida (TON/KG/SACO), peso bruto, tara, humedad %, impurezas %, calidad, precio provisional y diferencial pactado.' },
      { label: 'Conversión automática', desc: 'Si registra en Toneladas o Sacos, el sistema convierte automáticamente a Kilogramos para el kárdex y el lote. La unidad original queda registrada para consulta.' },
      { label: 'Lote generado', desc: 'El sistema asigna un código (ej: LOTE-2026-001) que identificará este cacao en liquidaciones, fijaciones, kárdex y embarques.' },
      { label: 'Precio', desc: 'Si la calidad tiene precio fijo, se asigna automáticamente. Si es provisional, puede dejarlo vacío y fijarlo después.' },
    ],
    path: '/cacao/receptions/new',
    tip: 'Siempre verifique que la guía de remisión sea única. El peso neto se calcula automáticamente (Bruto - Tara).',
  },
  {
    num: 3,
    title: 'Liquidación de Compra',
    icon: '📋',
    color: '#6b46c1',
    description: 'Cierra la recepción: aplica descuentos de calidad, calcula el valor neto a pagar al proveedor y genera la cuenta por pagar.',
    details: [
      { label: 'Proceso', desc: 'Seleccione el proveedor y el periodo. El sistema muestra los lotes pendientes de liquidar de ese proveedor.' },
      { label: 'Descuentos', desc: 'Por cada lote se aplican los descuentos de humedad e impurezas definidos en la calidad. Se muestra el desglose completo.' },
      { label: 'Resultado', desc: 'Peso neto descontado × precio/kg = subtotal por lote. Total = monto a pagar al proveedor. Se genera automáticamente la CxP.' },
      { label: 'Agrupación', desc: 'Una liquidación puede agrupar varios lotes del mismo proveedor en un periodo determinado.' },
    ],
    path: '/cacao/settlements/new',
    tip: 'Revise el desglose de descuentos antes de confirmar. Una vez creada, la liquidación genera la CxP automáticamente.',
  },
  {
    num: 4,
    title: 'Fijación de Precio',
    icon: '💰',
    color: '#b7791f',
    description: 'Para lotes comprados a precio provisional, fije el precio definitivo cuando el mercado lo permita. Esto es su control de riesgo de precio.',
    details: [
      { label: 'Tabla de exposición', desc: 'Muestra todos los lotes con precio provisional pendiente de fijar, junto con el precio referencia del día y la fecha límite.' },
      { label: 'Cómo fijar', desc: 'Ingrese el precio de referencia (ej: precio ICE Cocoa) y el diferencial pactado. El sistema calcula el precio fijo = referencia + diferencial.' },
      { label: 'Resultado', desc: 'El lote actualiza su costo promedio. Si ya tiene liquidación, se recalcula. El diferencial "dormido" desde la recepción finalmente se ejecuta.' },
    ],
    path: '/cacao/price-fixings',
    tip: 'Monitoree la tabla de exposición regularmente. Los lotes con fecha límite cercana son prioridad.',
  },
  {
    num: 5,
    title: 'Kárdex de Inventario (Costeo)',
    icon: '📊',
    color: '#e53e3e',
    description: 'El kárdex registra cada movimiento de entrada y salida por lote, manteniendo un saldo actualizado en kilogramos y valor.',
    details: [
      { label: 'Método', desc: 'Costeo promedio ponderado. Cada entrada recalcula el costo promedio del lote.' },
      { label: 'Entradas', desc: 'Se registran automáticamente al crear una recepción. Muestra el peso en kg y la unidad original.' },
      { label: 'Salidas', desc: 'Se registran automáticamente al crear un embarque. Descuenta del saldo del lote.' },
      { label: 'Saldo', desc: 'Siempre muestra la cantidad y el valor acumulado. Puede filtrar por lote específico.' },
    ],
    path: '/cacao/kardex',
    tip: 'El kárdex siempre está en kilogramos, sin importar la unidad de compra o venta.',
  },
  {
    num: 6,
    title: 'Embarque / Exportación (Salida de Inventario)',
    icon: '🚢',
    color: '#2f855a',
    description: 'Registra la venta o exportación de cacao. Descuenta del kárdex por lote, calcula el costo de venta y genera la cuenta por cobrar.',
    details: [
      { label: 'Datos que registra', desc: 'Fecha, cliente, referencia del contrato, unidad de venta (TON/KG/SACO), lotes a embarcar con cantidades.' },
      { label: 'Conversión', desc: 'Si vende en Sacos, el sistema convierte a kg para validar contra el kárdex y registrar la salida.' },
      { label: 'Precio de venta', desc: 'Se auto-calcula del precio fijo + margen, pero es editable. El margen se muestra en tiempo real.' },
      { label: 'Resultado', desc: 'Descuenta del kárdex, actualiza el estado del lote (si se agota se cierra), y genera la CxC.' },
    ],
    path: '/cacao/shipments/new',
    tip: 'Verifique que el lote tenga suficiente saldo antes de embarcar. El sistema valida esto automáticamente.',
  },
  {
    num: 7,
    title: 'Cuentas por Pagar (CxP)',
    icon: '📤',
    color: '#c53030',
    description: 'Generadas automáticamente por las liquidaciones de compra. Controla pagos parciales, saldos y antigüedad.',
    details: [
      { label: 'Origen', desc: 'Cada liquidación crea una CxP con el monto total a pagar al proveedor.' },
      { label: 'Pagos', desc: 'Registre pagos parciales o totales. El sistema actualiza el saldo automáticamente.' },
      { label: 'Filtros', desc: 'Puede ver por proveedor, estado (pendiente/pagado), y antigüedad de saldos.' },
    ],
    path: '/cacao/payables',
    tip: 'Revise la antigüedad de saldos para identificar pagos vencidos.',
  },
  {
    num: 8,
    title: 'Cuentas por Cobrar (CxC)',
    icon: '📥',
    color: '#276749',
    description: 'Generadas automáticamente por los embarques/exportaciones. Controla cobros, saldos y antigüedad.',
    details: [
      { label: 'Origen', desc: 'Cada embarque crea una CxC con el monto total a cobrar al cliente.' },
      { label: 'Cobros', desc: 'Registre cobros parciales o totales. El sistema actualiza el saldo automáticamente.' },
      { label: 'Filtros', desc: 'Puede ver por cliente, estado, y antigüedad de saldos.' },
    ],
    path: '/cacao/receivables',
    tip: 'Monitoree los saldos vencidos para mejorar la gestión de cobro.',
  },
];

const FLOW = [
  { from: 'Proveedor', to: 'Recepción', label: 'Entrega cacao', color: '#2b6cb0' },
  { from: 'Recepción', to: 'Lote', label: 'Se genera lote', color: '#2c7a7b' },
  { from: 'Lote', to: 'Liquidación', label: 'Se aplica descuentos', color: '#6b46c1' },
  { from: 'Liquidación', to: 'CxP', label: 'Se genera deuda', color: '#c53030' },
  { from: 'Lote', to: 'Fijación', label: 'Se fija precio', color: '#b7791f' },
  { from: 'Lote', to: 'Embarque', label: 'Se vende/exporta', color: '#2f855a' },
  { from: 'Embarque', to: 'CxC', label: 'Se genera cobro', color: '#276749' },
  { from: 'Embarque', to: 'Kárdex', label: 'Descuenta inventario', color: '#e53e3e' },
];

export default function CacaoHelpGuide() {
  const navigate = useNavigate();

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/cacao')}>← Volver</button>
          <div>
            <p className="page-eyebrow">CACAO</p>
            <h1>Guía del Sistema de Inventario</h1>
          </div>
        </div>
      </div>

      {/* Intro */}
      <div style={{
        padding: '24px 28px',
        background: 'linear-gradient(135deg, #2d3748 0%, #1a365d 100%)',
        borderRadius: '14px',
        color: 'white',
        marginBottom: '24px',
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px', marginTop: 0 }}>Bienvenido al Módulo de Cacao</h2>
        <p style={{ fontSize: '14px', lineHeight: 1.7, margin: 0, opacity: 0.9 }}>
          Este sistema controla el flujo completo de inventario de cacao de Mikacao S.A.: desde la recepción del grano del proveedor hasta la exportación al cliente final.
          Cada paso está conectado: un cambio en recepción afecta el lote, el lote afecta la liquidación, la liquidación genera la CxP, y así sucesivamente.
        </p>
      </div>

      {/* Flujo visual */}
      <div style={{
        padding: '24px 28px',
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        marginBottom: '24px',
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#2d3748', marginTop: 0, marginBottom: '16px' }}>Flujo del Sistema</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
          {FLOW.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                padding: '6px 12px',
                backgroundColor: `${f.color}12`,
                border: `1px solid ${f.color}40`,
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                color: f.color,
              }}>{f.from}</span>
              <span style={{ fontSize: '11px', color: '#a0aec0', maxWidth: '80px', textAlign: 'center', lineHeight: 1.2 }}>
                {f.label}
                <span style={{ color: f.color, fontSize: '14px' }}> → </span>
              </span>
              <span style={{
                padding: '6px 12px',
                backgroundColor: `${f.color}12`,
                border: `1px solid ${f.color}40`,
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                color: f.color,
              }}>{f.to}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pasos detallados */}
      <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#2d3748', marginBottom: '16px' }}>Guía Paso a Paso</h2>

      {STEPS.map((step) => (
        <div key={step.num} style={{
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          marginBottom: '16px',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '18px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            borderBottom: '1px solid #f0f0f0',
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: `${step.color}12`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              flexShrink: 0,
            }}>
              {step.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', color: '#a0aec0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Paso {step.num}
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#2d3748', margin: 0 }}>{step.title}</h3>
            </div>
            {step.path && (
              <button
                onClick={() => navigate(step.path, { state: { from: '/cacao/guia' } })}
                style={{
                  padding: '8px 16px',
                  backgroundColor: step.color,
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Ir →
              </button>
            )}
          </div>

          {/* Body */}
          <div style={{ padding: '18px 24px' }}>
            <p style={{ fontSize: '14px', color: '#4a5568', lineHeight: 1.6, margin: '0 0 14px 0' }}>{step.description}</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px', marginBottom: '14px' }}>
              {step.details.map((d, i) => (
                <div key={i} style={{
                  padding: '12px 14px',
                  backgroundColor: '#f7fafc',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}>
                  <strong style={{ color: '#2d3748' }}>{d.label}:</strong>{' '}
                  <span style={{ color: '#718096' }}>{d.desc}</span>
                  {'path' in d && d.path && (
                    <span
                      onClick={() => navigate(d.path, { state: { from: '/cacao/guia' } })}
                      style={{ color: step.color, cursor: 'pointer', marginLeft: '6px', fontWeight: 600, textDecoration: 'underline' }}
                    >
                      Ver →
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div style={{
              padding: '10px 14px',
              backgroundColor: '#fffbeb',
              border: '1px solid #f6e05e',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#975a16',
            }}>
              <strong>💡 Tip:</strong> {step.tip}
            </div>
          </div>
        </div>
      ))}

      {/* Glossary */}
      <div style={{
        padding: '24px 28px',
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        marginTop: '8px',
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#2d3748', marginTop: 0, marginBottom: '16px' }}>Glosario</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
          {[
            { term: 'Lote', def: 'Unidad de cacao que viaja por todo el sistema. Se genera automáticamente al crear una recepción.' },
            { term: 'Kárdex', def: 'Registro de cada movimiento de entrada/salida de inventario por lote. Siempre en kilogramos.' },
            { term: 'Costo Promedio', def: 'Costo por kilogramo calculado con el método de promedio ponderado.' },
            { term: 'Diferencial', def: 'Monto pactado ($/T) sobre el precio de referencia del mercado. Se usa en la fijación de precio.' },
            { term: 'Fijación', def: 'Proceso de convertir un precio provisional en precio definitivo usando el mercado de referencia.' },
            { term: 'Liquidación', def: 'Cierre contable de una recepción: aplica descuentos y calcula lo que se debe al proveedor.' },
            { term: 'CxP', def: 'Cuenta por Pagar. Deuda con proveedores generada por liquidaciones de compra.' },
            { term: 'CxC', def: 'Cuenta por Cobrar. Derecho de cobro generado por embarques/exportaciones.' },
            { term: 'Unidad de Medida', def: 'TON (Toneladas = 1000 kg), KG (Kilogramos), SACO (Sacos, configurable, default 90 kg).' },
            { term: 'Guía de Remisión', def: 'Documento fiscal que acompaña al cacao al momento de la entrega. Número único por recepción.' },
          ].map((g, i) => (
            <div key={i} style={{ fontSize: '13px' }}>
              <strong style={{ color: '#2d3748' }}>{g.term}:</strong>{' '}
              <span style={{ color: '#718096' }}>{g.def}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
