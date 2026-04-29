import * as THREE from 'three';

/**
 * Servicio para manejar transformaciones (rotaciones y traslaciones) de objetos y sensores
 */
export default class TransformationService {
  /**
   * Calcula la pose de un objeto en un perfil específico basado en sus movimientos
   * @param {Object} initialPose - Pose inicial {position: Vector3, rotation: Euler}
   * @param {Array} movements - Lista de movimientos a aplicar
   * @param {number} profileIndex - Índice del perfil actual
   * @param {number} totalProfiles - Total de perfiles del escaneo
   * @returns {Object} Pose calculada {position: Vector3, rotation: Euler}
   */
  static calculatePoseAtProfile(initialPose, movements, profileIndex, totalProfiles) {
    const pose = {
      position: initialPose.position.clone(),
      rotation: initialPose.rotation.clone()
    };
    
    if (!movements || movements.length === 0) {
      return pose;
    }
    
    // Aplicar movimientos acumulados hasta este perfil
    for (const movement of movements) {
      const startProfile = movement.startProfile || 0;
      const endProfile = startProfile + (movement.duration || totalProfiles);
      
      if (profileIndex >= startProfile && profileIndex < endProfile) {
        // Movimiento en progreso
        const progress = (profileIndex - startProfile) / (endProfile - startProfile);
        const value = movement.value * progress;
        
        this.applyMovement(pose, movement, value);
      } else if (profileIndex >= endProfile) {
        // Movimiento completado, aplicar valor completo
        this.applyMovement(pose, movement, movement.value);
      }
    }
    
    return pose;
  }
  
  /**
   * Aplica un movimiento a una pose
   * @param {Object} pose - Pose a modificar {position: Vector3, rotation: Euler}
   * @param {Object} movement - Movimiento {type: 'rotation'|'translation', axis: 'x'|'y'|'z', value: number}
   * @param {number} value - Valor del movimiento a aplicar
   */
  static applyMovement(pose, movement, value) {
    if (movement.type === 'rotation') {
      const axis = movement.axis || 'x';
      const angleRad = THREE.MathUtils.degToRad(value);
      
      if (axis === 'x') {
        pose.rotation.x += angleRad;
      } else if (axis === 'y') {
        pose.rotation.y += angleRad;
      } else if (axis === 'z') {
        pose.rotation.z += angleRad;
      }
    } else if (movement.type === 'translation') {
      const axis = movement.axis || 'x';
      
      if (axis === 'x') {
        pose.position.x += value;
      } else if (axis === 'y') {
        pose.position.y += value;
      } else if (axis === 'z') {
        pose.position.z += value;
      }
    }
  }
  
  /**
   * Aplica una transformación inversa a un punto para reconstruir su posición original
   * @param {THREE.Vector3} point - Punto en coordenadas del mundo después de transformaciones
   * @param {Object} pose - Pose que se aplicó cuando se capturó el punto {position: Vector3, rotation: Euler}
   * @param {Object} initialPose - Pose inicial del objeto {position: Vector3, rotation: Euler}
   * @returns {THREE.Vector3} Punto transformado inversamente
   */
  static applyInverseTransformation(point, pose, initialPose) {
    // Crear una copia del punto
    let transformedPoint = point.clone();
    
    // 1. Trasladar al origen (centro de rotación/traslación)
    transformedPoint.sub(pose.position);
    
    // 2. Aplicar rotación inversa (en orden inverso y con signos opuestos)
    const inverseRotation = new THREE.Euler(
      -pose.rotation.x,
      -pose.rotation.y,
      -pose.rotation.z,
      'ZYX' // Orden inverso para deshacer la rotación
    );
    
    // Aplicar rotación inversa alrededor de cada eje
    // Rotación inversa alrededor de Z
    if (inverseRotation.z !== 0) {
      const cosZ = Math.cos(inverseRotation.z);
      const sinZ = Math.sin(inverseRotation.z);
      const x = transformedPoint.x;
      const y = transformedPoint.y;
      transformedPoint.x = x * cosZ - y * sinZ;
      transformedPoint.y = x * sinZ + y * cosZ;
    }
    
    // Rotación inversa alrededor de Y
    if (inverseRotation.y !== 0) {
      const cosY = Math.cos(inverseRotation.y);
      const sinY = Math.sin(inverseRotation.y);
      const x = transformedPoint.x;
      const z = transformedPoint.z;
      transformedPoint.x = x * cosY + z * sinY;
      transformedPoint.z = -x * sinY + z * cosY;
    }
    
    // Rotación inversa alrededor de X
    if (inverseRotation.x !== 0) {
      const cosX = Math.cos(inverseRotation.x);
      const sinX = Math.sin(inverseRotation.x);
      const y = transformedPoint.y;
      const z = transformedPoint.z;
      transformedPoint.y = y * cosX - z * sinX;
      transformedPoint.z = y * sinX + z * cosX;
    }
    
    // 3. Trasladar de vuelta a la posición inicial
    transformedPoint.add(initialPose.position);
    
    return transformedPoint;
  }
  
  /**
   * Transforma un punto de coordenadas locales del sensor a coordenadas del mundo
   * @param {THREE.Vector3} pointLocal - Punto en coordenadas locales del sensor
   * @param {Object} sensorPose - Pose del sensor {position: Vector3, rotation: Euler}
   * @returns {THREE.Vector3} Punto en coordenadas del mundo
   */
  static transformPointToWorld(pointLocal, sensorPose) {
    const pointWorld = pointLocal.clone();
    
    // Aplicar rotación del sensor
    pointWorld.applyEuler(sensorPose.rotation);
    
    // Aplicar traslación del sensor
    pointWorld.add(sensorPose.position);
    
    return pointWorld;
  }
  
  /**
   * Transforma un punto de coordenadas del mundo a coordenadas locales del sensor
   * @param {THREE.Vector3} pointWorld - Punto en coordenadas del mundo
   * @param {Object} sensorPose - Pose del sensor {position: Vector3, rotation: Euler}
   * @returns {THREE.Vector3} Punto en coordenadas locales del sensor
   */
  static transformPointToSensorLocal(pointWorld, sensorPose) {
    const pointLocal = pointWorld.clone();
    
    // Trasladar al origen del sensor
    pointLocal.sub(sensorPose.position);
    
    // Aplicar rotación inversa
    const inverseRotation = new THREE.Euler(
      -sensorPose.rotation.x,
      -sensorPose.rotation.y,
      -sensorPose.rotation.z,
      'ZYX'
    );
    pointLocal.applyEuler(inverseRotation);
    
    return pointLocal;
  }
}

