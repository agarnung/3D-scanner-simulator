/**
 * Servicio para validar configuraciones del simulador
 */
export default class ConfigValidationService {
  /**
   * Valida la configuración completa del simulador
   * @param {Object} config - Configuración cargada desde YAML
   * @returns {Object} - { valid: boolean, errors: string[], warnings: string[] }
   */
  static validateConfig(config) {
    const errors = [];
    const warnings = [];

    // Validar estructura básica
    if (!config) {
      errors.push('La configuración está vacía o no se pudo cargar');
      return { valid: false, errors, warnings };
    }

    // Validar sensores
    if (!config.sensors || !Array.isArray(config.sensors) || config.sensors.length === 0) {
      errors.push('Debe haber al menos un sensor configurado');
    } else {
      config.sensors.forEach((sensor, index) => {
        const sensorErrors = this.validateSensor(sensor, index);
        errors.push(...sensorErrors);
      });
    }

    // Validar objeto
    if (config.object) {
      const objectErrors = this.validateObject(config.object);
      errors.push(...objectErrors);
    } else {
      warnings.push('No se ha configurado el objeto. Se usará la configuración por defecto.');
    }

    // Validar simulación
    if (config.simulation) {
      const simErrors = this.validateSimulation(config.simulation);
      errors.push(...simErrors);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Valida la configuración de un sensor
   */
  static validateSensor(sensor, index) {
    const errors = [];
    const prefix = `Sensor ${index + 1}`;

    if (!sensor.id) {
      errors.push(`${prefix}: Falta el campo 'id'`);
    }

    if (!sensor.model) {
      errors.push(`${prefix}: Falta el campo 'model' (ruta al modelo 3D)`);
    }

    if (!sensor.pointsPerProfile || sensor.pointsPerProfile <= 0) {
      errors.push(`${prefix}: 'pointsPerProfile' debe ser un número positivo`);
    }

    // Validar pose
    if (sensor.pose) {
      if (!Array.isArray(sensor.pose.position) || sensor.pose.position.length !== 3) {
        errors.push(`${prefix}: 'pose.position' debe ser un array de 3 elementos [x, y, z]`);
      }
      if (!Array.isArray(sensor.pose.rotation) || sensor.pose.rotation.length !== 3) {
        errors.push(`${prefix}: 'pose.rotation' debe ser un array de 3 elementos [rotX, rotY, rotZ]`);
      }
    } else {
      errors.push(`${prefix}: Falta la configuración 'pose'`);
    }

    // Validar ROI
    if (sensor.roi) {
      const roi = sensor.roi;
      const requiredFields = ['yMax', 'yMin', 'x0', 'x1', 'x2', 'x3'];
      for (const field of requiredFields) {
        if (typeof roi[field] !== 'number') {
          errors.push(`${prefix}: 'roi.${field}' debe ser un número`);
        }
      }
      
      // Validar que yMax > yMin
      if (roi.yMax <= roi.yMin) {
        errors.push(`${prefix}: 'roi.yMax' debe ser mayor que 'roi.yMin'`);
      }
    }

    // Validar movimientos
    if (sensor.movements && Array.isArray(sensor.movements)) {
      sensor.movements.forEach((movement, movIndex) => {
        const movErrors = this.validateMovement(movement, `${prefix}, movimiento ${movIndex + 1}`);
        errors.push(...movErrors);
      });
    }

    return errors;
  }

  /**
   * Valida la configuración del objeto
   */
  static validateObject(object) {
    const errors = [];

    if (object.initialPose) {
      if (!Array.isArray(object.initialPose.position) || object.initialPose.position.length !== 3) {
        errors.push('Objeto: \'initialPose.position\' debe ser un array de 3 elementos [x, y, z]');
      }
      if (!Array.isArray(object.initialPose.rotation) || object.initialPose.rotation.length !== 3) {
        errors.push('Objeto: \'initialPose.rotation\' debe ser un array de 3 elementos [rotX, rotY, rotZ]');
      }
      if (object.initialPose.scale !== undefined) {
        if (!Array.isArray(object.initialPose.scale) || object.initialPose.scale.length !== 3) {
          errors.push('Objeto: \'initialPose.scale\' debe ser un array de 3 elementos [sx, sy, sz]');
        } else if (object.initialPose.scale.some(s => typeof s !== 'number' || s <= 0)) {
          errors.push('Objeto: \'initialPose.scale\' debe contener valores numéricos positivos');
        }
      }
    }

    if (object.movements && Array.isArray(object.movements)) {
      object.movements.forEach((movement, index) => {
        const movErrors = this.validateMovement(movement, `Objeto, movimiento ${index + 1}`);
        errors.push(...movErrors);
      });
    }

    return errors;
  }

  /**
   * Valida un movimiento (rotación o traslación)
   */
  static validateMovement(movement, prefix) {
    const errors = [];

    if (!movement.type) {
      errors.push(`${prefix}: Falta el campo 'type' (debe ser 'rotation' o 'translation')`);
      return errors;
    }

    if (movement.type !== 'rotation' && movement.type !== 'translation') {
      errors.push(`${prefix}: 'type' debe ser 'rotation' o 'translation'`);
    }

    if (!['x', 'y', 'z'].includes(movement.axis)) {
      errors.push(`${prefix}: 'axis' debe ser 'x', 'y', o 'z'`);
    }

    if (typeof movement.value !== 'number') {
      errors.push(`${prefix}: 'value' debe ser un número`);
    }

    if (movement.duration !== undefined && (typeof movement.duration !== 'number' || movement.duration <= 0)) {
      errors.push(`${prefix}: 'duration' debe ser un número positivo`);
    }

    if (movement.startProfile !== undefined && (typeof movement.startProfile !== 'number' || movement.startProfile < 0)) {
      errors.push(`${prefix}: 'startProfile' debe ser un número no negativo`);
    }

    return errors;
  }

  /**
   * Valida la configuración de simulación
   */
  static validateSimulation(simulation) {
    const errors = [];

    if (simulation.intersectionMethod && !['edge', 'face', 'raycasting'].includes(simulation.intersectionMethod)) {
      errors.push('Simulación: \'intersectionMethod\' debe ser \'edge\', \'face\' o \'raycasting\'');
    }

    if (simulation.defaultRotationDeg !== undefined && (typeof simulation.defaultRotationDeg !== 'number' || simulation.defaultRotationDeg <= 0)) {
      errors.push('Simulación: \'defaultRotationDeg\' debe ser un número positivo');
    }

    if (simulation.defaultProfiles !== undefined && (typeof simulation.defaultProfiles !== 'number' || simulation.defaultProfiles <= 0)) {
      errors.push('Simulación: \'defaultProfiles\' debe ser un número positivo');
    }

    if (simulation.visibilityPrefilterEnabled !== undefined && typeof simulation.visibilityPrefilterEnabled !== 'boolean') {
      errors.push('Simulación: \'visibilityPrefilterEnabled\' debe ser booleano');
    }

    return errors;
  }

  /**
   * Valida que los movimientos no excedan el número total de perfiles
   */
  static validateMovementsAgainstProfiles(movements, totalProfiles) {
    const warnings = [];

    if (!movements || movements.length === 0) return warnings;

    movements.forEach((movement, index) => {
      const startProfile = movement.startProfile || 0;
      const duration = movement.duration || totalProfiles;
      const endProfile = startProfile + duration;

      if (endProfile > totalProfiles) {
        warnings.push(
          `Movimiento ${index + 1}: termina en el perfil ${endProfile} pero solo hay ${totalProfiles} perfiles. ` +
          `Se truncará al final del escaneo.`
        );
      }
    });

    return warnings;
  }
}

