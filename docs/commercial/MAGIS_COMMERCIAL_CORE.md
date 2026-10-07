# MAGIS COMMERCIAL CORE

## OBJETIVO

Convertir MAGIS en un sistema de ejecución:

- vendible
- medible
- controlable
- rentable
- escalable

## PRINCIPIO

NO ACUMULAR IA.
CONSTRUIR SISTEMA.

## ARQUITECTURA

TRÁFICO
↓
PROBLEMA
↓
BÚSQUEDA
↓
GOOGLE
↓
CONTENIDO
↓
OFERTA
↓
CTA
↓
MAGIS
↓
AUTH
↓
USER
↓
PLAN
↓
CREDITS
↓
TASK
↓
TASK ANALYZER
↓
X / Y / NO GATE
↓
CAPABILITY ROUTER
↓
MODEL ROUTER
↓
EXECUTION
↓
VALIDATION
↓
USAGE
↓
AI COST
↓
RESULT
↓
CONVERSION
↓
REVENUE
↓
MARGIN
↓
RECOMPRA / UPSELL
↓
DATOS
↓
NUEVA HIPÓTESIS

## X / Y / NO

X = INPUT + CONTEXTO + EVIDENCIA

Y = CAPACIDAD + MODELO + RECURSOS

NO = BLOQUEADOR

La ejecución solo ocurre cuando:

X = válido
Y = resuelto
NO = vacío

## CONTROL ECONÓMICO

Toda operación debe poder responder:

- quién ejecutó
- qué capacidad utilizó
- qué modelo utilizó
- cuántos créditos consumió
- cuánto costó la IA
- cuánto ingreso produjo
- cuánto margen dejó

## ENTIDADES COMERCIALES

AUTH
USER
PLAN
CREDITS
USAGE
AI_COST
MARGIN
CONVERSION
PURCHASE
ENTITLEMENT
CHECKOUT
UPSELL

## REGLAS

NO FEATURE BLOAT.

NO MODELOS POR MODA.

NO SECRETOS EN CLIENTE.

NO CLAIMS SIN EVIDENCIA.

NO MÉTRICAS DE VANIDAD.

NO EJECUCIÓN SIN CONTROL.

NO COSTO DE IA SIN MEDICIÓN.

NO VENTA SIN TRAZABILIDAD.

## DEFINICIÓN DE ÉXITO

¿FUNCIONA?

¿SE PUEDE VENDER?

¿SE PUEDE MEDIR?

¿SE PUEDE CONTROLAR?

¿DEJA MARGEN?

Si la respuesta es sí:
ESCALAR.

Si la respuesta es no:
DECODIFICAR.


## MVP COMERCIAL ACTIVADO EN CÓDIGO

MAGIS usa los planes existentes como packs de créditos de compra única:

- MAGIS Free — 10 créditos iniciales
- MAGIS Starter — 100 créditos
- MAGIS Pro — 500 créditos

Flujo:

OFERTA
↓
CHECKOUT
↓
STRIPE
↓
WEBHOOK FIRMADO
↓
PURCHASE
↓
GRANT DE CRÉDITOS
↓
CREDIT_LEDGER
↓
USO MAGIS

El precio y los créditos efectivos se validan server-side contra `public.plans`. La acreditación es idempotente mediante `provider_session_id` y `credit_ledger.reference_id`.
