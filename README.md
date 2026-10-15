# SYSTEM_DECODE_MAGIS // v12.0 FLUX

**MAGIS** es un espacio de trabajo multimodal de Chalamandra Magistral. Reúne herramientas de análisis, búsqueda con fuentes, generación de imagen y video, síntesis de voz y conversación de voz en tiempo real en una interfaz de escritorio interactiva.

La aplicación combina una SPA en React y TypeScript con funciones serverless en Vercel. Supabase gestiona autenticación, perfiles y créditos; las funciones de servidor conectan los módulos con Gemini, Veo y, opcionalmente, Stripe. Las credenciales privadas permanecen en el servidor.

## Qué puedes hacer

| Módulo | Uso |
| --- | --- |
| **Matrix Analyzer** | Explorar una pregunta y generar análisis estratégico |
| **Matrix Decoder** | Calcular el código Matrix a partir de una fecha |
| **Deployment Analyzer** | Analizar decisiones técnicas y riesgos |
| **Terminal** | Consultar Gemini y realizar búsquedas con grounding |
| **Media Studio** | Generar imágenes, videos y voz; analizar videos |
| **Neural Link** | Iniciar una conversación de voz en tiempo real |
| **Billing** | Consultar la parte comercial y adquirir créditos cuando Stripe está configurado |

El acceso a los módulos requiere una sesión Supabase válida y una cuenta activa. Las operaciones de IA que consumen créditos se autorizan y cobran en el servidor.

## Tecnologías

- **Interfaz:** React 19, TypeScript, Vite 6.
- **Estilos:** Tailwind CSS 4 y CSS global en `src/styles.css`.
- **Autenticación y datos:** Supabase Auth, Supabase JS y migraciones SQL.
- **IA:** Google GenAI SDK y API de Gemini/Veo a través de funciones server-side.
- **Pagos opcionales:** Stripe Checkout y webhook firmado.
- **Pruebas:** Vitest.
- **Despliegue:** Vercel.

## Empezar en local

Requisitos: Node.js y pnpm.

```bash
pnpm install
pnpm dev
```

Vite inicia la interfaz en `http://localhost:3000`. Para ejecutar la aplicación conectada, configura las variables de Supabase del cliente y las variables de servidor en Vercel. El servidor de Vite no emula las funciones `api/`; por tanto, las rutas `/api/*` necesitan un entorno Vercel para probar el flujo completo.

### Comandos

| Comando | Descripción |
| --- | --- |
| `pnpm dev` | Inicia el servidor Vite de desarrollo |
| `pnpm build` | Genera el build de producción en `dist/` |
| `pnpm preview` | Sirve localmente el build generado |
| `pnpm test` | Ejecuta las pruebas con Vitest |

## Configuración

Configura las variables en Vercel o en el entorno que corresponda. No añadas secretos a Git ni a variables `VITE_*`: Vite las incorpora al bundle del navegador.

| Variable | Dónde | Necesidad |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Build del cliente | Necesaria para conectar el navegador con Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Build del cliente | Necesaria para autenticación desde el navegador; es una clave publicable |
| `GEMINI_API_KEY` | Servidor | Necesaria para las operaciones Gemini/Veo |
| `SUPABASE_URL` | Servidor | URL del proyecto para las funciones API |
| `SUPABASE_PUBLISHABLE_KEY` | Servidor | Clave pública usada por el servidor al verificar sesiones de usuario |
| `SUPABASE_SECRET_KEY` | Servidor | Operaciones privilegiadas de créditos, feedback y compras |
| `STRIPE_SECRET_KEY` | Servidor | Opcional: crea sesiones de Stripe Checkout |
| `STRIPE_WEBHOOK_SECRET` | Servidor | Opcional: verifica los webhooks de Stripe |
| `MAGIS_APP_URL` | Servidor | Opcional: URL HTTPS para el retorno de Checkout |
| `STRIPE_PRICE_<PLAN_CODE>` | Servidor | Opcional: Price ID por cada plan de pago activo, con el código del plan en mayúsculas |

Las variables `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY` y `STRIPE_*` son privadas y solo deben configurarse en el entorno server-side. Las funciones aún aceptan algunos nombres heredados como fallback; para nuevas configuraciones usa los nombres de esta tabla.

Para habilitar la aplicación con datos reales, configura Supabase Auth y aplica las migraciones de `supabase/migrations/`. Para habilitar pagos, configura también los planes en Supabase, sus Price IDs de Stripe y el webhook que apunta a `/api/stripe-webhook`.

## Arquitectura

### Mapa del proyecto

```text
.
├── index.html                    # HTML, metadatos y carga de la aplicación
├── src/
│   ├── main.tsx                  # Entrada React
│   ├── App.tsx                   # Sesión, escritorio y estado de ventanas
│   ├── components/               # Módulos y componentes de interfaz
│   ├── domain/                   # Reglas, estados y errores del dominio
│   │   └── algorithm/            # Algoritmo Matrix y prueba
│   ├── feedback/                 # Contrato, política y servicio de feedback
│   ├── hooks/                    # Hooks de operaciones asíncronas
│   ├── services/                 # Clientes de API, Gemini, Supabase y sonido
│   ├── styles.css                # Estilos globales y tema Tailwind
│   └── types.ts                  # Tipos compartidos de la interfaz
├── api/                          # Funciones serverless de Vercel
├── lib/
│   └── commercial.js             # Autorización, créditos y operaciones de video
├── public/                       # Archivos estáticos
├── supabase/
│   ├── config.toml               # Configuración local de Supabase
│   └── migrations/               # Esquema y cambios versionados de base de datos
├── docs/commercial/              # Documentación de principios comerciales
├── package.json
├── pnpm-lock.yaml
├── vite.config.ts
├── tsconfig.json
└── vercel.json
```

### Entrada y ejecución

1. `index.html` carga `src/main.tsx`, que monta la aplicación React.
2. `src/App.tsx` recupera la sesión Supabase y muestra el acceso o el escritorio MAGIS. Los módulos se cargan bajo demanda.
3. Los componentes llaman a los servicios de `src/services/`. `apiClient.ts` adjunta el token de sesión a las solicitudes protegidas.
4. Vercel expone cada archivo `api/*.js` como una ruta `/api/*`. Las funciones verifican identidad y estado de cuenta; las operaciones cobradas consultan créditos en el servidor antes de llamar al proveedor.
5. La respuesta vuelve al módulo que inició la operación. Feedback se envía por separado y contiene metadatos operacionales, no prompts ni contenido generado.

### Servicios del servidor

| Ruta | Responsabilidad |
| --- | --- |
| `/api/gemini` | Texto, razonamiento, búsqueda, imagen, voz, video y análisis de video |
| `/api/live-token` | Emite un token temporal para la sesión Live |
| `/api/video` | Descarga el video generado tras comprobar sesión y propiedad |
| `/api/feedback` | Persiste estado operacional y rating |
| `/api/checkout` | Crea una sesión de Stripe Checkout |
| `/api/stripe-webhook` | Valida el webhook y acredita compras de forma idempotente |

`src/services/geminiService.ts` centraliza las llamadas de IA del navegador. `lib/commercial.js` concentra las operaciones server-side compartidas de autorización, créditos y propiedad de video.

### Estilos

`src/styles.css` es la hoja global. Usa Tailwind CSS 4, define los tokens visuales con `@theme` y carga Rajdhani y Share Tech Mono. Los componentes aplican las clases de Tailwind directamente; no hay un segundo framework de estilos.

## Datos, créditos y seguridad

- Supabase proporciona la sesión. Las funciones API verifican el token y que el perfil de usuario esté activo.
- Las tarifas se fijan en el servidor en `lib/commercial.js`; el cliente no elige el importe.
- Las operaciones confirmadas como fallidas pueden activar un reembolso. Si el inicio de un video fue aceptado por el proveedor pero no pudo registrarse con certeza, queda pendiente de conciliación y no se reembolsa automáticamente.
- El estado de la operación de video se asocia al usuario. Tanto el sondeo como la descarga requieren autorización.
- Stripe Checkout solo se considera pagado tras recibir un webhook con firma válida; el webhook acredita créditos mediante una operación idempotente.
- Los headers de seguridad y la CSP se configuran en `vercel.json`. Si se cambia el dominio o se añaden proveedores externos, revisa la política CSP.

Tarifas configuradas actualmente: texto 1 crédito, razonamiento 3, búsqueda 1, imagen 25, síntesis de voz 5, inicio de video 50, análisis de video 3 y token Live 5. El sondeo de estado de video no vuelve a cobrar. Son valores de implementación, no estimaciones del coste real del proveedor.

## Build y despliegue

`pnpm build` ejecuta `vite build` y produce los archivos estáticos en `dist/`. Vercel publica ese directorio y despliega los archivos de `api/` como funciones serverless. `vercel.json` configura los headers de respuesta.

Antes del despliegue:

1. Configura las variables de cliente y servidor en el proyecto de Vercel.
2. Aplica las migraciones de `supabase/migrations/` y configura Auth, correo y dominios de redirección.
3. Para pagos, configura planes y precios en Stripe y Supabase y registra `/api/stripe-webhook` como endpoint de webhook.
4. Comprueba que la CSP en `vercel.json` permite los orígenes realmente utilizados.

## Pruebas

```bash
pnpm test
pnpm build
```

## Notas de mantenimiento

- `dist/` es un artefacto generado; la fuente está en `src/`, `api/` y `lib/`.
- `README.PRO.md` y `docs/commercial/MAGIS_COMMERCIAL_CORE.md` explican visión y principios de producto; no representan módulos ejecutables adicionales.
- La documentación anterior mencionaba `src/core/` y un `styles.css` en la raíz. La estructura vigente está en el mapa de arriba.
- El código mantiene aliases temporales para `API_KEY`, variables `VITE_SUPABASE_*` del lado servidor y `SUPABASE_SERVICE_ROLE_KEY`. Para nuevas instalaciones, usa `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY`.
- El límite de frecuencia actual se conserva en memoria por instancia serverless; no equivale a un límite distribuido. La conciliación de un inicio de video incierto es manual.

## Licencia

MIT. Consulta [`LICENSE`](LICENSE).
