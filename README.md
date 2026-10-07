# SYSTEM_DECODE_MAGIS // v12.0 FLUX

**MAGIS** es el workspace multimodal de Chalamandra Magistral: análisis, búsqueda, generación de imagen/video, voz y conversación Live dentro de una interfaz cyberpunk operativa.

## Estado

La aplicación funciona como una SPA React/Vite desplegada en Vercel. El acceso a módulos de IA requiere una sesión Supabase; el gateway valida el usuario y descuenta créditos antes de iniciar cada operación cobrada.

### Flujo de producción

```text
OPERADOR
   ↓
MAGIS UI (React + TypeScript)
   ↓
MAGIS API (Vercel Functions)
   ↓
Gemini / Veo / Image / TTS / Live
   ↓
RESULTADO
```

El objetivo comercial es que MAGIS sea un producto utilizable y medible, no solo una demo visual.

## Módulos

| Módulo | Función | Modelo / servicio |
| :--- | :--- | :--- |
| **Matrix Analyzer** | Análisis estratégico y plan de acción | Gemini 2.5 Flash-Lite |
| **Deployment Analyzer** | Evaluación técnica y de riesgo | Gemini 3.8 Flash |
| **Media Studio** | Imagen, video, voz y análisis de video | Gemini 3.1 Flash Image, Veo 3.1, Gemini 3.8 Flash TTS, Gemini 3.8 Flash |
| **Neural Link** | Conversación de voz en tiempo real | Gemini 3.8 Live |
| **Terminal** | Comandos de IA y búsqueda con grounding | Gemini 2.5 Flash-Lite / Flash |
| **System Specs** | Información del sistema | N/A |

Los modelos se mantienen separados por capacidad para controlar latencia, coste y calidad.

## Seguridad

La credencial persistente `GEMINI_API_KEY` **no se inyecta en el bundle del navegador**.

- `services/geminiService.ts` llama a funciones `/api/*`.
- `api/gemini.js` centraliza las operaciones de IA.
- `api/live-token.js` entrega tokens efímeros para Live.
- `api/video.js` sirve el resultado de Veo sin entregar la clave al cliente.
- `api/feedback.js` persiste estado y valoración de video sin prompts ni contenido generado.
- Los endpoints validan el JWT Supabase y consumen importes de crédito fijados en servidor.
- Los fallos del proveedor activan un reembolso mediante una credencial Supabase server-only.
- Si la aceptación de Veo o su persistencia no puede confirmarse, la operación queda pendiente y no se reembolsa automáticamente; el identificador se devuelve para conciliación manual. Un fallo terminal confirmado se marca `failed` y el reembolso es idempotente.
- El proxy de video requiere sesión autenticada y solo acepta rutas de archivos generados en el host de Google.
- El comando `login [key]` fue eliminado; las claves ya no se guardan en `localStorage`.
- Hay límites de frecuencia por instancia y validación básica; no sustituyen límites distribuidos ni controles avanzados de abuso.

### Deuda técnica de producción

- `api/video.js` materializa el video upstream completo en memoria antes de responder. Migrar a streaming con backpressure/range requiere una validación aparte; el buffer puede elevar el uso de memoria con archivos grandes.
- La conciliación de una aceptación de proveedor incierta requiere revisión manual con el identificador de operación; no existe un reconciliador automático.

### Configuración de entorno

Variables del cliente (solo URL y clave publicable; se incorporan al bundle):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Variables server-side en Vercel:

- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — exclusivamente server-side; nunca usar prefijo `VITE_`.

Aplicar las migraciones de `supabase/migrations/` al proyecto Supabase real. Configurar Auth, dominios de redirección, correo y CSP para el dominio de producción. La CSP incluida permite dominios `*.supabase.co`; los dominios Supabase personalizados requieren actualizarla.

### Tarifas provisionales

El importe lo determina el servidor; el cliente no puede elegir ni reducir el débito:

| Operación | Créditos |
| --- | ---: |
| Texto | 1 |
| Razonamiento | 3 |
| Búsqueda | 1 |
| Imagen | 25 |
| Voz TTS | 5 |
| Inicio de generación de video | 50 |
| Análisis de video | 3 |
| Inicio de sesión Live | 5 |

Son valores provisionales aprobados para esta implementación, todavía no contrastados con costes reales del proveedor. Consultar estado de video no vuelve a cobrar. Checkout, facturación, créditos de pago y conciliación siguen pendientes.

## Desarrollo

Requisitos: Node.js y pnpm.

```bash
pnpm install
pnpm dev
```

Build de producción:

```bash
pnpm build
pnpm preview
```

## Estructura

```text
src/App.tsx
src/main.tsx
src/components/
src/domain/
src/feedback/
src/hooks/
src/services/
src/core/
api/
styles.css
index.html
vercel.json
vite.config.ts
package.json
```

### Capa API

```text
api/gemini.js
  ├─ text
  ├─ thinking
  ├─ search
  ├─ image
  ├─ speech
  ├─ videoStart
  ├─ videoStatus
  └─ videoAnalysis

api/live-token.js
  └─ token efímero para Live

api/video.js
  └─ proxy seguro del resultado Veo

api/feedback.js
  └─ captura autenticada de metadatos operacionales y rating
```

La migración `20261007080000_operation_feedback.sql` crea el registro de feedback y la vista diaria `operation_feedback_daily_metrics` (tasas de éxito/fallo/timeout/reintento y latencia media/p95). El acceso a la tabla y a la vista queda restringido a `service_role`; aplicar la migración antes de desplegar `/api/feedback.js`.

## Principios de producto

**DIAGNOSTICAR → REPARAR → OPTIMIZAR → PUBLICAR → MEDIR → MONETIZAR → ESCALAR**

No introducir funcionalidades solo por aumentar el tamaño del sistema. Cada cambio debe justificar su impacto sobre seguridad, estabilidad, conversión, coste o ingresos.

## Roadmap comercial

### P0 — Hardening
- Credenciales fuera del cliente.
- Modelos vigentes.
- Headers de seguridad.
- Validación de inputs.
- Limpieza de rutas y entrypoints obsoletos.

### P1 — Producto vendible
- Autenticación y débito de créditos por ejecución: base implementada; falta validar migraciones, RLS y despliegue en Supabase real.
- Registro de uso y coste real por operación, límites distribuidos y observabilidad.
- Eventos de conversión.
- CTA, checkout y conciliación conectados a una oferta real.

### P2 — Escala
- Persistencia de uso y margen.
- Observabilidad.
- Control de abuso más robusto.
- Router de capacidades/modelos.
- Upsell y recompra.

## SEO y adquisición

MAGIS es una aplicación, no la superficie principal de SEO. La captación orgánica y publicitaria debe vivir en la web pública de Chalamandra Magistral y conducir al usuario a la oferta y después a MAGIS.

## Licencia

MIT.
