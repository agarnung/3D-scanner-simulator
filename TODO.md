# TODO

- Implementar o bien la aceleración con WebGPU o bien con WebWorkers:

#### Nota sobre aceleración GPU (compute shaders WebGPU)

Se exploró la posibilidad de ejecutar la búsqueda de intersecciones arista-plano del servicio **Edge** mediante compute shaders WGSL en WebGPU, con la idea de paralelizar el trabajo por triángulo en la GPU.

La implementación fue técnicamente correcta, pero **resultó más lenta que la versión CPU + BVH** por una razón estructural: la arquitectura actual procesa perfiles de forma incremental, uno a uno, actualizando la visualización 3D en tiempo real tras cada perfil. Esto implica dos barreras de sincronización GPU↔CPU por perfil (`mapAsync` para leer el contador de puntos y después los puntos mismos), con una penalización fija de ~3–8 ms por barrera independientemente del tamaño de la mesh. La CPU con BVH resuelve el mismo perfil en 1–3 ms.

Para que los compute shaders fuesen beneficiosos habría que reenfocar la arquitectura:
- **Despachar todos los perfiles a la vez** (un solo dispatch con N_triángulos × N_perfiles threads) y hacer un único readback al final del escaneo completo.
- Esto sacrificaría la **visualización incremental en tiempo real**, que es una de las características principales del simulador.
- Adicionalmente, el cuello de botella real no es encontrar intersecciones sino el **raycast de oclusión por candidato** (que requeriría también una BVH en GPU para ser útil).

La alternativa adoptada para acelerar el escaneo sin perder la visualización en tiempo real son **Web Workers** (ver sección siguiente).

#### Aceleración con Web Workers (scan paralelo)

El simulador soporta paralelizar el cálculo de perfiles de escaneo usando **Web Workers**, una API estándar del navegador que lanza hilos reales del sistema operativo (uno por núcleo de CPU).

**Cómo funciona:**
- Al cargar una malla, se crea un pool de N workers (hasta `navigator.hardwareConcurrency`, máximo 8).
- Cada worker recibe una copia de la geometría y construye su propio BVH de forma independiente (coste único, ~100–300 ms al inicio).
- Durante el escaneo, los perfiles se agrupan en lotes de `N × 4` y se distribuyen entre los workers usando `Promise.all`, logrando concurrencia real.
- La visualización 3D incremental se actualiza tras cada lote (no hay pérdida de feedback visual).
- **Speedup teórico**: lineal con el número de núcleos (4 núcleos → ~4× más rápido; 8 núcleos → ~8×).

Se activa con el checkbox **"Scan paralelo (Web Workers)"** en la GUI. El estado se persiste en `simulator.yaml` como `useParallelScan: true`.
