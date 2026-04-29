// FacePlaneIntersectionService.js
// 
// Debería ser como EdgePlaneIntersectionService.js pero realizando la 
// intersección entre el plano y las caras del modelo, no solo aristas.

import * as THREE from 'three';

export default class FacePlaneIntersectionService {
    static yMaxAOI = 0.05; 
    static yMinAOI = -0.025; 
    static x0AOI = -0.15;  
    static x1AOI = -0.135; 
    static x2AOI = 0.135; 
    static x3AOI = 0.15; 

    // Número de puntos a muestrear entre los extremos del segmento de intersección entre plano y triángulo (valor experimental sintético)
    // Es más por velocidad y por asegurar una precisión mínima, porque la resolución por perfil en sí se ajusta desde la config. del simulador
    static intersectionResolution = 10; 

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
            new THREE.Vector3(roi.x0, roi.yMin, 0), 
            new THREE.Vector3(roi.x1, roi.yMax, 0),
            new THREE.Vector3(roi.x2, roi.yMax, 0),
            new THREE.Vector3(roi.x3, roi.yMin, 0),
            new THREE.Vector3(roi.x0, roi.yMin, 0) 
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

        const globalVertices = this.getWorldVertices(objectMesh);
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

        const yRange = roi.yMax - roi.yMin;
        const xSlopeLeft = (roi.x1 - roi.x0) / yRange;
        const xSlopeRight = (roi.x2 - roi.x3) / yRange;

        const profilePointsMap = new Map();

        for (let i = 0; index ? i < index.count : i < globalVertices.length; i += 3) {
            const [v1, v2, v3] = index ? [
                globalVertices[index.getX(i)],
                globalVertices[index.getX(i + 1)],
                globalVertices[index.getX(i + 2)]
            ] : [
                globalVertices[i],
                globalVertices[i + 1],
                globalVertices[i + 2]
            ];

            // Verificar intersección con el plano láser (en coordenadas del mundo)
            // El plano láser está definido en coordenadas del mundo, así que verificamos directamente
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

            const intersections = this.trianglePlaneIntersection(v1, v2, v3, laserPlane);
            
            for (const pt of intersections) {
                // Transformar punto de intersección a coordenadas locales del sensor
                const ptLocal = sensor ? this.transformToSensorLocal(pt, sensor) : pt;
                
                {                
                    const y = ptLocal.y;
                    if (y < roi.yMin || y > roi.yMax) continue;
                    
                    const xLeft = roi.x0 + xSlopeLeft * (y - roi.yMin);
                    const xRight = roi.x3 + xSlopeRight * (y - roi.yMin);
                
                    if (ptLocal.x < xLeft || ptLocal.x > xRight) continue;
                }
                
                const totalXRange = roi.x3 - roi.x0;
                const sectorSize = totalXRange / pointsPerProfile;

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
        const globalVertices = []; 

        const localVertices = mesh.geometry.attributes.position; 
        
        const tempVec = new THREE.Vector3();
        for (let i = 0; i < localVertices.count; i++) {
            const vertex = new THREE.Vector3().fromBufferAttribute(localVertices, i); 

            vertex.applyMatrix4(mesh.matrixWorld); 
            
            globalVertices.push(vertex);
        }
        
        return globalVertices;
    }
    
    static trianglePlaneIntersection(v1, v2, v3, plane) {
        const intersections = [];

        // Paso 1: encontrar los extremos del segmento de intersección
        const segmentPoints = [];

        const distances = [
            plane.distanceToPoint(v1),
            plane.distanceToPoint(v2),
            plane.distanceToPoint(v3)
        ];

        const vertices = [v1, v2, v3];
        const edges = [
            [0, 1],
            [1, 2],
            [2, 0]
        ];

        for (const [i0, i1] of edges) {
            const a = vertices[i0];
            const b = vertices[i1];
            const da = distances[i0];
            const db = distances[i1];

            // Si un punto está (aproximadamente) sobre el plano, incluirlo
            if (Math.abs(da) < 1e-6) segmentPoints.push(a.clone());
            if (Math.abs(db) < 1e-6) segmentPoints.push(b.clone());

            // Si hay cruce entre a y b
            if (da * db < 0) {
                const t = da / (da - db); // Interpolación lineal
                const p = new THREE.Vector3().lerpVectors(a, b, t);
                segmentPoints.push(p);
            }
        }

        // Paso 2: muestrear a lo largo del segmento, si es que hay 2 extremos
        if (segmentPoints.length === 2) {
            const [start, end] = segmentPoints;

            for (let i = 0; i <= this.intersectionResolution; i++) {
                const t = i / this.intersectionResolution;
                const p = new THREE.Vector3().lerpVectors(start, end, t);
                intersections.push(p);
            }

        } else if (segmentPoints.length === 1) {
            // Punto único (i.e. un vértice sobre el plano)
            intersections.push(segmentPoints[0]);
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