import * as THREE from 'three';
import TransformationService from './TransformationService.js';

export default class ScanExportService {
    // Enfoque simple para asegurar que todas las filas tienen el mismo número de puntos, sin importarme mantener la coherencia espacial
    static equalizeProfilesFillZeros(profiles) {
        if (!profiles || profiles.length === 0) return [];

        const maxPoints = Math.max(...profiles.map(p => p.length));

        // Rellenar con ceros hasta alzanzar ecualizar el máximo de puntos de todos los perfiles
        return profiles.map(profile => {
            const copy = profile.slice();
            while (copy.length < maxPoints) {
                copy.push({ x: 0, y: 0, z: 0 });
            }
            return copy;
        });
    }

    static exportToBinaryRAW(profiles, baseFileName) {
        if (!profiles || profiles.length === 0) return null;

        // Igualar puntos de perfiles rellenando con ceros
        const equalizedProfiles = this.equalizeProfilesFillZeros(profiles);

        const pointCount = equalizedProfiles[0].length;
        const isUniform = equalizedProfiles.every(p => p.length === pointCount);
        if (!isUniform) {
            console.error('Perfiles con distinta longitud después de igualar');
            return null;
        }

        const buffer = new ArrayBuffer(equalizedProfiles.length * pointCount * 3 * 4); // 3 coords * 4 bytes (float32)
        const view = new DataView(buffer);
        let offset = 0;

        for (const profile of equalizedProfiles) {
            for (const point of profile) {
                view.setFloat32(offset, point.x, true); offset += 4;
                view.setFloat32(offset, point.y, true); offset += 4;
                view.setFloat32(offset, 0.0, true); offset += 4; // Asegurarse de que la coordenada Z es siempre cero en coordenadas locales
            }
        }

        return new Blob([buffer], { type: 'application/octet-stream' });
    }

    static exportToCSV(profiles, baseFileName, offsetZ = 0.1, sensorId = null) {
        const lines = [];
        
        // Encabezado con información del sensor si se proporciona
        if (sensorId) {
            lines.push(`# Sensor: ${sensorId}`);
            lines.push(`# Total de perfiles: ${profiles.length}`);
            lines.push(`# Offset Z: ${offsetZ}`);
            lines.push(`# Formato: x, y, z`);
            lines.push('');
        }

        profiles.forEach((profile, i) => {
            const zOffset = i * offsetZ;
            profile.forEach(point => {
                lines.push(`${point.x},${point.y},${0.0 + zOffset}`);
            });
        });

        const csvContent = lines.join('\n');
        return new Blob([csvContent], { type: 'text/csv' });
    }

    // offsetZ es el desplazamiento en Z para cada perfil, para "desenrollar" el escaneo
    static exportUnravelledTXT(profiles, baseFileName, offsetZ = 0.1) {
        const lines = [];

        profiles.forEach((profile, i) => {
            const zOffset = i * offsetZ;
            profile.forEach((point) => {
                lines.push(`${point.x} ${point.y} ${0.0 + zOffset}`); // Asegurarse de que la coordenada Z es siempre cero en coordenadas locales
            });
        });

        return new Blob([lines.join('\n')], { type: 'text/plain' });
    }

    // Reconstrucción 3D correcta del objeto escaneado
    // Aplica las transformaciones inversas a cada perfil para obtener la posición 3D real de cada punto
    // Versión generalizada que soporta transformaciones complejas (no solo rotación en X)
    // También se consideran las transformaciones de los sensores
    static exportReconstructed3D(profiles, baseFileName, objectInitialPose, objectMovements, totalProfiles, profilesBySensor = null, sensors = []) {
        if (!profiles || profiles.length === 0) return null;
        if (!objectInitialPose) {
            console.warn('Pose inicial del objeto no proporcionada, usando valores por defecto');
            objectInitialPose = {
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 }
            };
        }

        const lines = [];
        
        // Convertir objectInitialPose a formato Vector3/Euler si es necesario
        const initialPose = {
            position: objectInitialPose.position instanceof THREE.Vector3 
                ? objectInitialPose.position.clone() 
                : new THREE.Vector3(objectInitialPose.position.x, objectInitialPose.position.y, objectInitialPose.position.z),
            rotation: objectInitialPose.rotation instanceof THREE.Euler
                ? objectInitialPose.rotation.clone()
                : new THREE.Euler(objectInitialPose.rotation.x, objectInitialPose.rotation.y, objectInitialPose.rotation.z, 'XYZ')
        };

        // Usar el número real de perfiles capturados, no el total configurado
        // Esto es crucial si el escaneo se detiene antes de completar todos los perfiles
        const actualProfilesCount = profiles.length;
        
        // Crear un mapa de índice de perfil en profiles[] a {sensorId, scanProfileIndex}
        // Los perfiles se combinan en el orden en que se escanean: para cada perfil i del escaneo, 
        // se agregan los perfiles de todos los sensores en orden (solo si tienen puntos)
        const profileInfo = [];
        if (profilesBySensor && sensors.length > 0) {
            // Obtener el orden de los sensores (basado en el orden en que aparecen en sensors)
            const sensorOrder = sensors.map(s => s.id);
            
            // Reconstruir el mapeo: para cada perfil del escaneo, los sensores se escanean en orden
            const maxProfilesPerSensor = Math.max(...Object.values(profilesBySensor).map(ps => ps.length));
            
            for (let scanProfileIndex = 0; scanProfileIndex < maxProfilesPerSensor; scanProfileIndex++) {
                for (const sensorId of sensorOrder) {
                    const sensorProfiles = profilesBySensor[sensorId];
                    if (sensorProfiles && scanProfileIndex < sensorProfiles.length) {
                        profileInfo.push({
                            sensorId: sensorId,
                            scanProfileIndex: scanProfileIndex
                        });
                    }
                }
            }
        }
        
        profiles.forEach((profile, profileArrayIndex) => {
            // Obtener información del perfil (sensor y índice del escaneo)
            const info = profileInfo[profileArrayIndex] || { sensorId: null, scanProfileIndex: profileArrayIndex };
            const scanProfileIndex = info.scanProfileIndex;
            
            // Calcular la pose del objeto cuando se capturó este perfil
            const objectPoseAtCapture = TransformationService.calculatePoseAtProfile(
                initialPose,
                objectMovements || [],
                scanProfileIndex,  // Usar el índice real del perfil del escaneo
                actualProfilesCount
            );

            // Determinar qué sensor capturó este perfil
            const sensorId = info.sensorId;
            let sensorPoseAtCapture = null;
            let sensorInitialPose = null;
            
            if (sensorId && sensors.length > 0) {
                const sensor = sensors.find(s => s.id === sensorId);
                if (sensor) {
                    // Calcular la pose del sensor cuando se capturó este perfil
                    sensorPoseAtCapture = sensor.calculatePoseAtProfile(scanProfileIndex, actualProfilesCount);
                    sensorInitialPose = {
                        position: sensor.initialPose.position.clone(),
                        rotation: sensor.initialPose.rotation.clone()
                    };
                }
            }

            // Aplicar transformaciones inversas a cada punto
            profile.forEach((point) => {
                let pointVec = new THREE.Vector3(point.x, point.y, point.z);
                
                // PASO 1: Deshacer transformación del sensor (si aplica)
                // El punto está en coordenadas del mundo después de todas las transformaciones
                // Primero lo transformamos de vuelta usando la pose inicial del sensor
                if (sensorPoseAtCapture && sensorInitialPose) {
                    // Transformar de coordenadas del mundo a coordenadas locales del sensor (usando pose de captura)
                    pointVec = TransformationService.transformPointToSensorLocal(pointVec, sensorPoseAtCapture);
                    // Transformar de coordenadas locales del sensor a coordenadas del mundo (usando pose inicial)
                    pointVec = TransformationService.transformPointToWorld(pointVec, sensorInitialPose);
                }
                
                // PASO 2: Deshacer transformación del objeto
                const reconstructedPoint = TransformationService.applyInverseTransformation(
                    pointVec,
                    objectPoseAtCapture,
                    initialPose
                );

                lines.push(`${reconstructedPoint.x} ${reconstructedPoint.y} ${reconstructedPoint.z}`);
            });
        });

        return new Blob([lines.join('\n')], { type: 'text/plain' });
    }

    // Exportar todos los archivos a un ZIP
    static async exportToZip(profiles, profilesBySensor, sensors, folderName, offsetZ, objectInitialPose, objectMovements, totalProfiles) {
        // Usar JSZip desde CDN si está disponible, o crear archivos individuales
        if (typeof JSZip === 'undefined') {
            // Si JSZip no está disponible, cargarlo dinámicamente
            await this.loadJSZip();
        }

        const zip = new JSZip();
        const folder = zip.folder(folderName);

        // Exportar perfiles combinados
        const rawBlob = this.exportToBinaryRAW(profiles, `${folderName}_raw.txt`);
        if (rawBlob) {
            const rawArrayBuffer = await rawBlob.arrayBuffer();
            folder.file(`${folderName}_raw.txt`, rawArrayBuffer);
        }

        const csvBlob = this.exportToCSV(profiles, `${folderName}_data.csv`, offsetZ);
        folder.file(`${folderName}_data.csv`, await csvBlob.text());

        const txtBlob = this.exportUnravelledTXT(profiles, `${folderName}_xyz.txt`, offsetZ);
        folder.file(`${folderName}_xyz.txt`, await txtBlob.text());

        // Exportar reconstrucción 3D
        // IMPORTANTE: Usar profiles.length (perfiles reales capturados) en lugar de totalProfiles
        // para que la reconstrucción sea precisa si el escaneo se detuvo antes de completar
        // Ahora también pasamos información de sensores para aplicar transformaciones inversas correctas
        if (objectInitialPose) {
            const reconstructedBlob = this.exportReconstructed3D(
                profiles, 
                `${folderName}_reconstructed3d.txt`, 
                objectInitialPose, 
                objectMovements, 
                profiles.length,  // Usar el número real de perfiles capturados, no el total configurado
                profilesBySensor,  // Información de qué sensor capturó cada perfil
                sensors           // Información de los sensores (poses iniciales y movimientos)
            );
            if (reconstructedBlob) {
                folder.file(`${folderName}_reconstructed3d.txt`, await reconstructedBlob.text());
            }
        }

        // Exportar perfiles por sensor si hay múltiples sensores
        if (sensors.length > 1 && profilesBySensor && Object.keys(profilesBySensor).length > 0) {
            for (const sensorId of Object.keys(profilesBySensor)) {
                const sensorProfiles = profilesBySensor[sensorId];
                if (sensorProfiles && sensorProfiles.length > 0) {
                    const sensorCsvBlob = this.exportToCSV(sensorProfiles, `${folderName}_${sensorId}_data.csv`, offsetZ, sensorId);
                    folder.file(`${folderName}_${sensorId}_data.csv`, await sensorCsvBlob.text());
                    
                    const sensorTxtBlob = this.exportUnravelledTXT(sensorProfiles, `${folderName}_${sensorId}_xyz.txt`, offsetZ);
                    folder.file(`${folderName}_${sensorId}_xyz.txt`, await sensorTxtBlob.text());
                }
            }
        }

        // Generar y descargar el ZIP
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        this._saveFile(zipBlob, `${folderName}.zip`);
        
        console.log(`Archivos exportados en: ${folderName}.zip`);
    }

    static async loadJSZip() {
        return new Promise((resolve, reject) => {
            if (typeof JSZip !== 'undefined') {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            script.onload = () => resolve();
            script.onerror = () => {
                console.error('No se pudo cargar JSZip. Exportando archivos individuales.');
                reject();
            };
            document.head.appendChild(script);
        });
    }

    static _saveFile(blob, baseFileName) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = baseFileName;
        link.click();
        URL.revokeObjectURL(link.href);
    }
}
