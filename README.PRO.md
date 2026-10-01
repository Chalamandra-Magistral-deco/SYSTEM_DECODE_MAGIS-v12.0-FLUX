# MANIFIESTO DEL SISTEMA // DECODE_MAGIS
**DOCUMENTO: README.PRO**
**CLASIFICACIÓN: OPERADOR ELITE**
**ADVERTENCIA: EL CONOCIMIENTO IMPLICA RESPONSABILIDAD.**

---

## 1.0 EL CREDO DE MAGIS: El Telos del Sistema

SYSTEM_DECODE_MAGIS no es una aplicación. Es un argumento.

En una era de entropía informativa, donde la "verdad" es un commodity y la atención es la moneda, MAGIS propone un nuevo paradigma: la **Soberanía Cognitiva**. No es una herramienta para obtener respuestas, sino un entorno para formular mejores preguntas. No es un asistente, es un amplificador de la intención.

Su propósito no es reemplazar al operador, sino fusionarse con él. Cada módulo es una extensión de una facultad humana:
- **MATRIX:** La facultad de la estrategia y la abstracción.
- **DEPLOY:** La facultad de la previsión y la gestión del riesgo.
- **STUDIO:** La facultad de la creación ex nihilo.
- **LINK:** La facultad de la comunicación sin barreras.
- **TERMINAL:** La facultad del control directo y sin filtros.

MAGIS es un exo-córtex digital diseñado para navegar la complejidad del siglo XXI. Su uso es un acto de rebeldía contra la simplificación.

---

## 2.0 ARQUITECTURA DE FLUJO CUÁNTICO: El Mapa del Silicio

La eficiencia de MAGIS reside en la especialización de sus núcleos neuronales. La elección del modelo equilibra latencia, coste y capacidad dentro de la arquitectura ya construida.

```plaintext
                                    +---------------------------+
[ OPERADOR ] <----> |         INTERFAZ MAGIS OS         |
                    |    (React / Tailwind / TS)         |
                    +-------------+-------------+
                                  |
                    +-------------+-------------+-----------------------------+
                    |                           |                             |
        +-----------v-----------+   +-----------v-----------+   +-------------v-------------+
        | MÓDULO DE BAJA        |   | MÓDULO DE RAZONAMIENTO |   | MÓDULO MULTIMODAL         |
        | LATENCIA              |   |                       |   |                           |
        | Terminal / Matrix     |   | Deployment / Video IQ |   | Studio / Live / Media     |
        +-----------+-----------+   +-----------+-----------+   +-------------+-------------+
                    |                           |                             |
        +-----------v-----------+   +-----------v-----------+   +-------------v-------------+
        | Gemini 2.5 Flash-Lite  |   | Gemini 3.1 Pro Preview |   | Veo 3.1 / Nano Banana Pro |
        | Search: Gemini 2.5    |   | Thinking + video      |   | TTS + Gemini Live 3.8    |
        | Flash                 |   | analysis              |   |                           |
        +-----------------------+   +------------------------+   +---------------------------+
```

### Justificación de modelos

* **Gemini 2.5 Flash / Lite:** núcleo rápido de Matrix y Terminal.
* **Gemini 3.1 Pro Preview:** razonamiento profundo en Deployment y comprensión de vídeo en Video IQ.
* **Veo 3.1 Fast:** generación de vídeo.
* **Nano Banana Pro / Gemini 3 Pro Image:** generación de imagen.
* **Gemini 2.5 Flash TTS:** síntesis de voz.
* **Gemini 3.8 Live:** conversación de voz en tiempo real.

La configuración concreta se centraliza en `services/geminiService.ts`, con los módulos de UI consumiendo una única implementación de cada servicio.

---

## 3.0 GUÍA DE MODIFICACIÓN DE CAMPO

MAGIS está diseñado para ser modificado. La soberanía implica control.

### 3.1 Módulo 1: Añadir un Comando al Terminal

**Objetivo:** Añadir un comando `status` que devuelva el estado de los stats del Matrix.

1. Navegar a `components/Terminal.tsx`.
2. Localizar `switch (cmd.toLowerCase())` dentro de `handleCommand`.
3. Añadir el nuevo `case`.
4. Actualizar la ayuda del terminal.
5. Probar el cambio con `pnpm dev`.

### 3.2 Módulo 2: Cambiar el modelo de un componente

Para experimentar en una rama de trabajo, cambia el modelo dentro de la función de servicio correspondiente en `services/geminiService.ts`.

Ejemplo:

```typescript
const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: prompt,
    config: systemInstruction ? { systemInstruction } : undefined
});
```

Los cambios de modelo pueden afectar latencia, coste, capacidades y disponibilidad. Para release, usa modelos con ciclo de vida vigente y valida `pnpm lint` y `pnpm build`.

---

## 4.0 VECTOR DE EVOLUCIÓN

El sistema puede evolucionar sin romper la línea consolidada.

* Persistencia de estado del escritorio y del Terminal.
* Nuevos módulos desacoplados.
* Integración de Function Calling cuando exista una necesidad funcional real.
* Nuevas capacidades multimodales sin duplicar servicios.

Estas ideas no forman parte de la release 12.0.0.

---

## 5.0 PROTOCOLO DE SIMBIOSIS: CONTRIBUIR AL NÚCLEO

1. Una rama por idea.
2. Un commit que describa claramente el cambio.
3. Un Pull Request para integrar cambios verificados.
4. No conservar implementaciones paralelas después de integrar una funcionalidad.
5. Si existe ambigüedad entre dos líneas de código, compararlas antes de eliminar cualquiera.

**FIN DEL DOCUMENTO.**
