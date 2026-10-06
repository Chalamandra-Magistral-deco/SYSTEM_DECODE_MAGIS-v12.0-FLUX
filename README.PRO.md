# MANIFIESTO DEL SISTEMA // DECODE_MAGIS
**DOCUMENTO: README.PRO**
**CLASIFICACIÓN: OPERADOR ELITE**

---

## 1.0 EL TELOS DEL SISTEMA

SYSTEM_DECODE_MAGIS es un entorno operativo multimodal de Chalamandra Magistral. Su valor no está en acumular modelos, sino en convertir intención en acciones, análisis y resultados utilizables.

Cada módulo representa una capacidad concreta:

- **MATRIX:** estrategia y abstracción.
- **DEPLOY:** diagnóstico técnico y riesgo.
- **STUDIO:** creación multimodal.
- **LINK:** comunicación de voz en tiempo real.
- **TERMINAL:** interacción directa con IA y búsqueda.

La estética cyberpunk es la interfaz. La arquitectura debe seguir siendo verificable, segura y orientada a producto.

---

## 2.0 ARQUITECTURA DE PRODUCCIÓN

```text
                         ┌────────────────────────────┐
                         │       OPERADOR / USUARIO   │
                         └─────────────┬──────────────┘
                                       │
                         ┌─────────────▼──────────────┐
                         │       MAGIS UI             │
                         │ React + TypeScript + Vite  │
                         └─────────────┬──────────────┘
                                       │
                         ┌─────────────▼──────────────┐
                         │       MAGIS API             │
                         │      Vercel Functions       │
                         └─────────────┬──────────────┘
                 ┌─────────────────────┼─────────────────────┐
                 ▼                     ▼                     ▼
             Gemini                Veo / Image           Live
                 │                     │                     │
                 └─────────────────────┼─────────────────────┘
                                       ▼
                              RESULTADO + TELEMETRÍA
```

La credencial persistente de Gemini permanece en el servidor.

### Núcleos actuales

- **Gemini 2.5 Flash / Flash-Lite:** operaciones rápidas y búsqueda.
- **Gemini 3.8 Flash:** análisis y razonamiento general de alta capacidad.
- **Gemini 3.1 Flash Image:** generación de imagen.
- **Veo 3.1:** generación de video.
- **Gemini 3.8 Flash TTS:** síntesis de voz.
- **Gemini 3.8 Live:** conversación de voz de baja latencia.

Los modelos se seleccionan por capacidad, coste y latencia, no por novedad.

---

## 3.0 PROTOCOLO DE SEGURIDAD

### Regla principal

**NUNCA colocar una API key persistente en JavaScript del navegador, localStorage ni URLs de cliente.**

La app utiliza:

- `api/gemini.js` para workloads de IA.
- `api/live-token.js` para tokens efímeros de Live.
- `api/video.js` para el proxy del resultado de Veo.
- Límites de frecuencia.
- Validación de tamaños y entradas.
- Headers de seguridad en Vercel.

Los tokens efímeros de Live están restringidos al modelo y configuración Live y tienen vida limitada.

---

## 4.0 PROTOCOLO DE MODIFICACIÓN

Antes de cambiar código:

**DIAGNOSTICAR → REPARAR → VALIDAR → PUBLICAR → MEDIR**

Una funcionalidad nueva solo entra cuando tiene una razón de producto.

### Ejemplo: nuevo comando

El Terminal usa un parser sencillo. Cuando crezca, migrar a un registro de comandos explícito:

```text
commands = {
  help,
  about,
  clear,
  ai,
  search
}
```

No agregar comandos para inflar la demo.

### Ejemplo: nuevo módulo de IA

No crear una llamada directa desde un componente. Añadir el flujo:

```text
UI
 ↓
service
 ↓
/api
 ↓
provider
 ↓
validation
 ↓
result
```

---

## 5.0 CRITERIO DE PRODUCTO

MAGIS debe evolucionar hacia:

```text
INPUT
  ↓
TASK ANALYZER
  ↓
EVIDENCE / X-Y-NO GATE
  ↓
CAPABILITY ROUTER
  ↓
MODEL ROUTER
  ↓
EXECUTION
  ↓
VALIDATION
  ↓
TELEMETRY
  ↓
RESULTADO ECONÓMICO
```

Esto conecta MAGIS con la arquitectura mayor de Chalamandra Agent Engine sin obligar a reescribir la interfaz actual.

---

## 6.0 ROADMAP

### P0 — Hardening
Seguridad, modelos vigentes, headers, validación y limpieza técnica.

### P1 — Monetización
Autenticación, créditos, límites por usuario, medición de coste, eventos de conversión y checkout.

### P2 — Escala
Persistencia, observabilidad, router de capacidades/modelos, optimización de margen, upsell y recompra.

---

## 7.0 REGLAS ELITE

**No feature bloat.**

**No claims sin evidencia.**

**No secretos en cliente.**

**No modelos obsoletos.**

**No reescritura por moda.**

**No métricas de vanidad.**

La medida definitiva es:

**¿el sistema funciona, se puede vender, se puede medir y deja margen?**

**FIN.**
