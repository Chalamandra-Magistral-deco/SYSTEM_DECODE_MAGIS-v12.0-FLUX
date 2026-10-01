# SYSTEM_DECODE_MAGIS // v12.0 FLUX

SYSTEM_DECODE_MAGIS es un panel interactivo estilo SO ciberpunk para análisis, diagnóstico y creación multimodal con Google Gemini. Esta release consolida la arquitectura ya construida sobre React + Vite + TypeScript + Tailwind CSS, sin cambiar la identidad visual ni la UX.

## Módulos

| Módulo | Función | Modelo principal |
| --- | --- | --- |
| Matrix Analyzer | Análisis estratégico y planes de acción | `gemini-2.5-flash-lite` |
| Deployment Analyzer | Diagnóstico y razonamiento profundo | `gemini-3.1-pro-preview` |
| Media Studio / VEO | Generación de vídeo | `veo-3.1-fast-generate-preview` |
| Media Studio / Imagen Pro | Generación de imagen | `gemini-3-pro-image` |
| Media Studio / Voice Synth | Síntesis de voz | `gemini-2.5-flash-preview-tts` |
| Media Studio / Video IQ | Análisis de vídeo | `gemini-3.1-pro-preview` |
| Neural Link | Conversación de voz en tiempo real | `gemini-3.8-live` |
| Terminal | Chat IA + búsqueda grounding | `gemini-2.5-flash-lite` / `gemini-2.5-flash` |

## Arquitectura

- **Framework:** React 19
- **Build:** Vite
- **Lenguaje:** TypeScript
- **Estilos:** Tailwind CSS mediante integración local de Vite
- **IA:** `@google/genai`
- **Iconos:** Lucide React
- **Deploy objetivo:** Vercel como SPA estática
- **Entrada:** `index.html → main.tsx → App.tsx`

La lógica de acceso a Gemini está centralizada en `services/geminiService.ts`. Los sonidos de interfaz están centralizados en `services/soundService.ts`.

## Variables de entorno

No se versionan archivos `.env`.

Consulta `.env.example` para la única variable de configuración documentada:

`GEMINI_API_KEY`

**Importante:** Vite puede inyectar esta variable dentro del código cliente. Por eso no debe utilizarse como secreto compartido de una aplicación pública multiusuario.

El flujo previsto del sistema es **BYOK (Bring Your Own Key)**: el operador introduce su propia clave desde el módulo Terminal, que la conserva en `localStorage` del navegador.

## Desarrollo

Instalar dependencias usando el lockfile del proyecto:

```bash
pnpm install --frozen-lockfile
```

Iniciar desarrollo:

```bash
pnpm dev
```

Comprobación estática:

```bash
pnpm lint
```

Build de producción:

```bash
pnpm build
```

Vista previa del build:

```bash
pnpm preview
```

## Release checklist

Antes de publicar:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm build
```

No se mantiene un segundo lockfile: la política del repositorio es `pnpm-lock.yaml`.

## Deploy en Vercel

La aplicación está configurada como SPA mediante `vercel.json`.

Con Vercel CLI:

```bash
pnpm dlx vercel --prod
```

O mediante integración Git:

```text
GitHub main → Vercel → build Vite → dist/
```

## Estructura

```text
.
├── App.tsx
├── main.tsx
├── index.html
├── components/
│   ├── DeploymentAnalyzer.tsx
│   ├── DesktopIcon.tsx
│   ├── LiveConversation.tsx
│   ├── MatrixAnalyzer.tsx
│   ├── MediaStudio.tsx
│   ├── Terminal.tsx
│   └── Window.tsx
├── services/
│   ├── geminiService.ts
│   └── soundService.ts
├── types.ts
├── styles.css
├── vite.config.ts
├── tsconfig.json
├── package.json
├── pnpm-lock.yaml
├── vercel.json
└── .env.example
```

## Notas de release

Esta versión no reescribe la aplicación. Consolida el estado existente, elimina únicamente código interno demostrado como no utilizado, conserva la arquitectura y corrige referencias de modelos que ya no son adecuadas para el estado actual de la Gemini API.

Referencias oficiales:
- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/deprecations
- https://ai.google.dev/gemini-api/docs/veo

## Licencia

MIT.
