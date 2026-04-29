# TODO

- Ver cómo se puede 1) optimizar el código actual, 2) cambiar el paradigma para ejecutar los cálculos en otro hilo o que todo vaya más fluido. E.g. hacer [Rendering on Demand](https://threejs.org/manual/#en/rendering-on-demand).

- Apartado teoría en el que se ponga la imagen de niveles abstracción del simulador web de agenda 18/06/25 con explicaciones cada una

- Añadir una breve explicación en el readme resumida de cómo aplicamos el patrón MVVM y otros en el proyecto

- Usar una máquina de estados en vez de booleanos para controlar los pasos del escaneo (e.g. `this.scanState = 'IDLE'; // 'STARTING', 'SCANNING', 'STOPPING', 'COMPLETED'`)

- Poner en interfaz qué servicio está cargado de config, o quizá hacer que se pueda cambiar dinámicamente, en vez de por config...

- Arreglar el modo NO X-RAY; sigue pillando los puntos ocluidos. VEr cómo mejorarlo. Hacer raycasting es demasiado pesado.