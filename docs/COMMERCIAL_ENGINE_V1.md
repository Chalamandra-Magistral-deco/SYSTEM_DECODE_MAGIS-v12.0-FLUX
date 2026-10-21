# Motor comercial unificado v1

## Objetivo

Conservar en un único libro de ventas cada Checkout Session pagada en Stripe, sin mezclar monedas y sin confundir cobro confirmado con entrega del producto. El motor aprovecha la verificación de firma y el flujo idempotente de créditos ya existente.

## Modelo de datos

- `commercial_products`: catálogo privado del servidor. Relaciona el código comercial con el Payment Link, precio esperado, moneda y modo de cumplimiento.
- `sales_receipts`: una fila por Checkout Session cobrada. `provider_session_id` es la clave de idempotencia; conserva el evento inicial, PaymentIntent, producto y nombre histórico, correo cuando Stripe lo entrega, total bruto, subtotal, impuestos, descuentos, moneda y estado de cumplimiento.
- `sales_fulfillment_outbox`: intención durable de cumplimiento o revisión, insertada en la misma transacción que el recibo. La restricción única por recibo y tipo impide duplicar el mismo encargo.
- `purchases` y `credit_ledger`: siguen siendo la autoridad actual para las compras que otorgan créditos. El recibo unificado complementa, no sustituye, el libro de movimientos de créditos.

Las tres entradas Payment Link incluidas en la migración son:

| Código | Producto | Precio inicial esperado | Cumplimiento v1 |
|---|---|---:|---|
| `kit_magistral` | Kit Magistral | USD 397.00 | Revisión/entrega manual |
| `sesion_descubrimiento` | Sesión Descubrimiento | USD 27.00 | Revisión/entrega manual |
| `mapa_tricentrico` | Mapa Tricéntrico | MXN 99.00 | Revisión/entrega manual |

El catálogo guarda IDs de Stripe para estos enlaces. Si se reemplaza un Payment Link, el mapeo debe actualizarse en una migración posterior antes de retirar el enlace anterior.

## Flujo del motor

1. Acepta únicamente POST, limita el cuerpo, verifica la firma Stripe sobre el cuerpo crudo y descarta eventos que no representan un pago confirmado.
2. Una compra MAGIS con `user_id`, `plan_code` y `client_reference_id` coincidentes sigue usando `grant_purchase_credits`. Después registra el recibo comercial con otro RPC idempotente.
3. Un Payment Link identificado registra un recibo y crea una tarea durable de cumplimiento manual.
4. Un enlace desconocido, un importe/moneda que no coinciden o metadatos de crédito incompletos se guardan en estado `review_required`, con una tarea de revisión. No se otorgan créditos a una identidad que no coincide.
5. Se devuelve 2xx solo después de que el recibo y, cuando corresponde, la tarea de salida hayan quedado persistidos. Un fallo técnico de base de datos devuelve 5xx para que Stripe vuelva a intentar.

## Estados

- `completed`: el cumplimiento automatizado ya terminó; en v1 se usa para el flujo de créditos después de que el RPC de créditos tuvo éxito.
- `manual_required`: cobro y recibo persistidos; queda una entrega manual pendiente.
- `review_required`: la venta cobrada se conserva, pero un operador debe resolver el mapeo, la identidad o la diferencia de precio antes de entregar.
- En la outbox, `pending` y `failed` representan tareas pendientes de consumir/reintentar; `completed` solo debe establecerlo un consumidor de la tarea.

## Métricas del modelo económico

- Ventas brutas por producto y moneda: suma de `amount_total_cents` dividida entre 100, agrupando siempre por `currency`.
- Órdenes cobradas: conteo de recibos con `payment_status = 'paid'`.
- Ticket promedio por producto y moneda: ventas brutas / órdenes cobradas.
- Impuestos y descuentos: sumar por separado `amount_tax_cents` y `amount_discount_cents`.
- Backlog operativo: conteo de recibos `manual_required` y `review_required`, más las tareas outbox pendientes o fallidas.

No se deben sumar MXN y USD sin una tabla externa y versionada de tipo de cambio. Este ledger registra importe bruto capturado; no es utilidad neta ni conciliación bancaria. Comisiones Stripe, transferencias, reembolsos, disputas y conversión FX requieren una fase posterior de conciliación con eventos/objetos financieros de Stripe.

## Límite deliberado de v1

Esta entrega construye persistencia e idempotencia, pero no simula que ya se envió un kit, se agendó una sesión ni se entregó un mapa. El consumidor de `sales_fulfillment_outbox`, una interfaz interna para resolver casos y la prueba e2e con un evento Stripe real siguen pendientes. Hasta entonces, las ventas no-credit se deben tratar como trabajo operativo, no como fulfillment automático.

## Verificación antes de producción

1. Aplicar la migración en un entorno de desarrollo y comprobar RLS, restricciones únicas y permisos RPC.
2. Ejecutar las pruebas unitarias del clasificador y el CI del repositorio.
3. En un entorno de prueba, enviar eventos de sesión pagada duplicados y comprobar que solo existe un recibo/outbox por sesión.
4. Probar un enlace conocido, un enlace desconocido y un precio/moneda distintos; confirmar que los últimos dos generan revisión en vez de conceder créditos.
5. Aplicar la migración y desplegar código de la misma revisión solo después de completar esas verificaciones. Esta PR no aplica migraciones ni despliega producción.
