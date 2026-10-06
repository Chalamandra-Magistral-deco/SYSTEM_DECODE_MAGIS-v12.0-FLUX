# SYSTEM_DECODE_MAGIS // v12.0 FLUX

**MAGIS** es el workspace multimodal de Chalamandra Magistral: análisis, búsqueda, generación de imagen/video, voz y conversación Live dentro de una interfaz cyberpunk operativa.

## Estado

La aplicación funciona como una SPA React/Vite desplegada en Vercel. La capa de IA se ejecuta mediante un **gateway server-side** para evitar exponer la credencial persistente de Gemini al navegador.

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
- El comando `login [key]` fue eliminado; las claves ya no se guardan en `localStorage`.
- Hay límites de frecuencia y validación básica de entradas en los endpoints.

**Producción:** configurar `GEMINI_API_KEY` exclusivamente como variable de entorno del proyecto Vercel.

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
App.tsx
main.tsx
components/
services/
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
```

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
- Autenticación de usuario.
- Créditos / límites por usuario.
- Registro de uso y coste por operación.
- Eventos de conversión.
- CTA y checkout conectados a una oferta real.

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
