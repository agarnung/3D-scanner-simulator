// EdgePlaneIntersectionService.js
// 
// La intersección entre las aristas (puntos estrictamente pertenecientes a las aristas) de los 
// triángulos de la mesh de entrada y el plano láser, modelado como un plano 3D imaginario 
// 
// Condición: El plano láser está colocado justo donde diga aquí el código; la malla sel sensor es solo por pura 
// visualización y debería ir colocada justo en la posición correcta según donde esté el plano láser en la escena
//
// Forma de la ROI del plano láser usada (sin dividiones anguulares, sino cartesianas, simplificadas):
//
//              x1           x2
//              +-------------+      y max (arriba)
//             /               \
//            /                 \
//           /                   \
//          +---------------------+  y min (abajo)
//         x0                     x3

import * as THREE from 'three';

export default class EdgePlaneIntersectionService {
    static yMaxAOI = 0.05; // fin del rango válido en Y
    static yMinAOI = -0.025; // inicio del rango válido en Y
    static x0AOI = -0.15;  // límite izquierdo arriba
    static x1AOI = -0.135;  // límite izquierdo abajo
    static x2AOI = 0.135;  // límite derecho abajo
    static x3AOI = 0.15;  // límite derecho arriba

    // Asumir que el plano láser está contenido en el XY de la escana
    static getTrapezoidPoints(sensor = null) {
        // Si se proporciona un sensor, usar su ROI; si no, usar valores por defecto
        const roi = sensor?.roi || {
            yMax: this.yMaxAOI,
            yMin: this.yMinAOI,
            x0: this.x0AOI,
            x1: this.x1AOI,
            x2: this.x2AOI,
            x3: this.x3AOI
        };
        
        const pointsLocal = [
            new THREE.Vector3(roi.x0, roi.yMin, 0), // Punto inferior izquierdo
            new THREE.Vector3(roi.x1, roi.yMax, 0), // Punto superior izquierdo
            new THREE.Vector3(roi.x2, roi.yMax, 0), // Punto superior derecho
            new THREE.Vector3(roi.x3, roi.yMin, 0), // Punto inferior derecho
            new THREE.Vector3(roi.x0, roi.yMin, 0)  // Cerrar el trapecio
        ];
        
        // Si hay un sensor con pose, transformar a coordenadas del mundo
        if (sensor && sensor.currentPose) {
            return pointsLocal.map(point => {
                return point.clone().applyEuler(sensor.currentPose.rotation).add(sensor.currentPose.position);
            });
        }
        
        return pointsLocal;
    }

    static intersectLaserProfile(objectMesh, sensor, pointsPerProfile = 300, surfaceOnlyMode = true) {
        if (!objectMesh) {
            console.warn('Faltan mallas para calcular intersección');
            return [];
        }

        if (!sensor) {
            console.warn('Sensor no proporcionado, usando valores por defecto');
        }

        // Almacenamiento de las coordenadas globales de los vértices, para que se puedan comparar contra el plano láser correctamente
        const globalVertices = this.getWorldVertices(objectMesh);

        // Obtener las geometrías de ambas mallas
        const objectGeometry = objectMesh.geometry;

        // Obtener el plano láser del sensor (o usar el plano por defecto)
        const laserPlane = sensor ? sensor.getLaserPlane() : new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        
        const index = objectGeometry.index;

        // Obtener ROI del sensor (o usar valores por defecto)
        const roi = sensor?.roi || {
            yMax: this.yMaxAOI,
            yMin: this.yMinAOI,
            x0: this.x0AOI,
            x1: this.x1AOI,
            x2: this.x2AOI,
            x3: this.x3AOI
        };

        // Pre-cálculo de constantes para el trapecio (ROI útil)
        const yRange = roi.yMax - roi.yMin;
        const xSlopeLeft = (roi.x1 - roi.x0) / yRange;
        const xSlopeRight = (roi.x2 - roi.x3) / yRange;

        // Map para guardar el primer punto visible para cada coordenada X (perfil)
        // La clave es un valor X, el valor es el punto con mayor Y (más cercano al sensor, según la posición elegida del plano láser)
        const profilePointsMap = new Map();

        // Recorrer los vértices de la geometría del objeto, de 3 en 3 (cada 3 vértices forman un triángulo)
        for (let i = 0; index ? i < index.count : i < globalVertices.length; i += 3) {
            // Obtener vértices del triángulo en globales según la geometría indexada o no indexada
            const [v1, v2, v3] = index ? [
                // Geometría indexada
                // Revisar cada triángulo del objeto; como la geometría está indexada, se usa el índice para acceder a los vértices
                globalVertices[index.getX(i)],
                globalVertices[index.getX(i + 1)],
                globalVertices[index.getX(i + 2)]
            ] : [
                // Geometría no indexada
                // Revisar cada triángulo del objeto; como la geometría no está indexada, cada 3 vértices forman un triángulo
                globalVertices[i],
                globalVertices[i + 1],
                globalVertices[i + 2]
            ];

            // Verificar intersección con el plano láser (en coordenadas del mundo)
            const z1 = laserPlane.distanceToPoint(v1), z2 = laserPlane.distanceToPoint(v2), z3 = laserPlane.distanceToPoint(v3);
            if ((z1 > 1e-6 && z2 > 1e-6 && z3 > 1e-6) || (z1 < -1e-6 && z2 < -1e-6 && z3 < -1e-6)) continue;

            // Transformar vértices a coordenadas locales del sensor para verificar ROI
            const v1Local = sensor ? this.transformToSensorLocal(v1, sensor) : v1;
            const v2Local = sensor ? this.transformToSensorLocal(v2, sensor) : v2;
            const v3Local = sensor ? this.transformToSensorLocal(v3, sensor) : v3;
            
            // Ignorar triángulos fuera del rango vertical Y (en coordenadas locales del sensor)
            const y1 = v1Local.y, y2 = v2Local.y, y3 = v3Local.y;
            if (y1 < roi.yMin && y2 < roi.yMin && y3 < roi.yMin) continue;
            if (y1 > roi.yMax && y2 > roi.yMax && y3 > roi.yMax) continue;

            // Ignorar triángulos completamente fuera del trapecio láser por X
            let allOutside = true;
            for (const vLocal of [v1Local, v2Local, v3Local]) {
                const y = vLocal.y;
                if (y >= roi.yMin && y <= roi.yMax) {
                    const xLeft = roi.x0 + xSlopeLeft * (y - roi.yMin);
                    const xRight = roi.x3 + xSlopeRight * (y - roi.yMin);
                    if (vLocal.x >= xLeft && vLocal.x <= xRight) {
                        allOutside = false;
                        break;
                    }
                }
            }
            if (allOutside) continue;

            // Calcular intersecciones del triángulo con el plano
            const intersections = this.trianglePlaneIntersection(v1, v2, v3, laserPlane);
            
            // Usar un área de interés (AOI) útil: 
            // Descartar punto si sus coordenadas están fuera del trapecio isósceles definido por (ymin, ymax, x0, x1, x2, x3)
            for (const pt of intersections) {
                // Transformar punto de intersección a coordenadas locales del sensor
                const ptLocal = sensor ? this.transformToSensorLocal(pt, sensor) : pt;
                
                // Si el punto está fuera del rango de trabajo útil (trapecio), ignorarlo
                {                
                    // Fuera de las bases inferior y superior del trapecio
                    const y = ptLocal.y;
                    if (y < roi.yMin || y > roi.yMax) continue;
                    
                    // Fuera de los lados izquierdo y derecho del trapecio
                    // Valores admisibles de x para ymin < y < ymax
                    const xLeft = roi.x0 + xSlopeLeft * (y - roi.yMin);
                    const xRight = roi.x3 + xSlopeRight * (y - roi.yMin);
                
                    if (ptLocal.x < xLeft || ptLocal.x > xRight) continue;
                }
                
                // Simplificación del perfil agrupando los puntos por sectores a lo largo del eje X y 
                // manteniendo dentro de cada sector solo el punto más cercano al sensor

                // Calcular el tamaño del sector automáticamente a partir del AOI
                const totalXRange = roi.x3 - roi.x0;
                const sectorSize = totalXRange / pointsPerProfile;

                // Agrupar los puntos por sector y conservar solo el más cercano al sensor
                // Usar coordenadas locales para el sector
                const sectorKey = Math.floor(ptLocal.x / sectorSize) * sectorSize;
                
                // Guardar el punto en coordenadas del mundo (no locales)
                const ptWorld = pt.clone();

                // En modo superficie visible, calcular distancia real al sensor para mantener solo el más cercano
                if (surfaceOnlyMode && sensor) {
                    const sensorPosition = sensor.currentPose.position;
                    const distanceToSensor = ptWorld.distanceTo(sensorPosition);
                    
                    if (!profilePointsMap.has(sectorKey)) {
                        profilePointsMap.set(sectorKey, { point: ptWorld, distance: distanceToSensor });
                    } else {
                        const existing = profilePointsMap.get(sectorKey);
                        // Mantener solo el punto más cercano al sensor en este sector
                        // Esto elimina automáticamente puntos ocluidos porque están más lejos
                        if (distanceToSensor < existing.distance) {
                            profilePointsMap.set(sectorKey, { point: ptWorld, distance: distanceToSensor });
                        }
                    }
                } else {
                    // Modo rayos X: mantener comportamiento original
                    if (!profilePointsMap.has(sectorKey)) {
                        profilePointsMap.set(sectorKey, { point: ptWorld, distance: 0 });
                    } else {
                        const existing = profilePointsMap.get(sectorKey);
                        const existingLocal = sensor ? this.transformToSensorLocal(existing.point, sensor) : existing.point;
                        if (ptLocal.y > existingLocal.y) {
                            profilePointsMap.set(sectorKey, { point: ptWorld, distance: 0 });
                        }
                    }
                }
            }
        }

        // Extraer solo los puntos del mapa (en modo superficie visible ya están filtrados por distancia)
        const profilePoints = Array.from(profilePointsMap.values()).map(entry => 
            entry.point || entry  // Compatibilidad: si ya es un punto, mantenerlo; si es objeto con .point, extraerlo
        );
        console.log(`Perfil calculado con ${profilePoints.length} puntos (primeras intersecciones visibles)`);
        
        return profilePoints;
    }
    
    static getLocalVertices(geometry) {
        const vertices = [];
        const localVertices = geometry.attributes.position;
        for (let i = 0; i < localVertices.count; i++) {
            const vertex = new THREE.Vector3().fromBufferAttribute(localVertices, i);
            vertices.push(vertex);
        }
        return vertices;
    }

    static getWorldVertices(mesh) {
        const globalVertices = []; // Se guardarán en este array los vértices en coordenadas del mundo

        // Las coordenadas locales de los vértices de la malla son respecto al centro del 
        // objeto, sin aplicar transformación alguna (tipo https://threejs.org/docs/#api/en/core/BufferAttribute)
        // Estas coordenadas se multiplican por la matriz de transformación del objeto para convertirlas coordenadas globales 
        const localVertices = mesh.geometry.attributes.position; 
        
        // Multiplica una copia de toda la geometría con applyMatrix4() de una sola vez
        const tempVec = new THREE.Vector3();
        for (let i = 0; i < localVertices.count; i++) {
            const vertex = new THREE.Vector3().fromBufferAttribute(localVertices, i); // Crear un vector 3D con las coordenadas del vértice i

            // mesh.matrixWorld es la matriz que representa la posición, rotación y escala del objeto en el mundo
            vertex.applyMatrix4(mesh.matrixWorld); // Aplicar la transformación al vértice para pasar de locales a globales
            
            globalVertices.push(vertex);
        }
        
        return globalVertices;
    }
    
    // In:
    //  - Un triángulo definido por sus 3 vértices (v1, v2, v3)
    //  - Un plano definido por un vector normal y una distancia al origen
    // Out:
    //  - Los puntos (reales) globales DE LAS ARISTAS del triángulo donde cortan al plano
    //    (puede haber 0, 1 o 2 intersecciones) 
    static trianglePlaneIntersection(v1, v2, v3, plane) {
        const intersections = []; // Aquí se guardarán los puntos donde las aristas del triángulo cortan el plano
        
        // Calcular distancias (perpendiculares) de cada vértice al plano
        // El valor puede ser:
        //  - Positivo: el punto está por un lado del plano
        //  - Negativo: el punto está por el otro lado del plano
        //  - Cero: el punto está sobre el plano
        // Esto permite saber si una arista corta el plano, pues sus extremos tendrán signos opuestos
        const d1 = plane.distanceToPoint(v1);
        const d2 = plane.distanceToPoint(v2);
        const d3 = plane.distanceToPoint(v3);
        
        // Cada arista se representa por punto inicial, final y las distancias de sus extremos al plano
        const edges = [
            { start: v1, end: v2, d1: d1, d2: d2 },
            { start: v2, end: v3, d1: d2, d2: d3 },
            { start: v3, end: v1, d1: d3, d2: d1 }
        ];
        
        // Revisar si cada arista del triángulo interseca al plano (i.e. si los signos de las distancias son diferentes)
        const tempVec = new THREE.Vector3();
        for (const edge of edges) {
            if (edge.d1 * edge.d2 < 0 || edge.d1 === 0 || edge.d2 === 0) {
                // Se trata de interpolar el punto P(t) de la arista v1-v2 con la restricción de que pertenezca al plano
                // P(t) = v1 + t * (v2 - v1), con t en [0, 1]
                // Encontrado t, interpolar en la arista (v1 == inicio, v1 == final)
                // (desarrollar geometría del plano)
                const t = edge.d1 / (edge.d1 - edge.d2);
                tempVec.copy(edge.end).sub(edge.start).multiplyScalar(t).add(edge.start);
                intersections.push(tempVec.clone()); // solo clonar cuando se va a usar
            }
        }

        return intersections;
    }
    
    /**
     * Transforma un punto de coordenadas del mundo a coordenadas locales del sensor
     */
    static transformToSensorLocal(pointWorld, sensor) {
        if (!sensor || !sensor.currentPose) {
            return pointWorld.clone();
        }
        
        const pointLocal = pointWorld.clone();
        
        // Trasladar al origen del sensor
        pointLocal.sub(sensor.currentPose.position);
        
        // Aplicar rotación inversa
        const inverseRotation = new THREE.Euler(
            -sensor.currentPose.rotation.x,
            -sensor.currentPose.rotation.y,
            -sensor.currentPose.rotation.z,
            'ZYX'
        );
        pointLocal.applyEuler(inverseRotation);
        
        return pointLocal;
    }
}