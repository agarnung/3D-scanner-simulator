import * as THREE from 'three';
import RaycastingIntersectionService from './RaycastingIntersectionService.js';

/**
 * Aplica ruido sintético a las adquisiciones del sensor (puntos de perfil).
 * Diseñado para extenderse con nuevos tipos (impulsional, estructurado, etc.).
 */
export default class SensorNoiseService {
  static SUPPORTED_TYPES = ['gaussian'];

  /**
   * Resuelve la configuración efectiva de ruido (simulación + override por sensor).
   * @param {Object|null} defaultNoise - simulation.acquisitionNoise
   * @param {Object|null} sensorNoise - sensors[].noise
   */
  static resolveNoiseConfig(defaultNoise = null, sensorNoise = null) {
    const base = {
      enabled: false,
      type: 'gaussian',
      stdDev: 0,
      seed: null
    };

    const merged = { ...base, ...(defaultNoise || {}), ...(sensorNoise || {}) };
    merged.enabled = !!merged.enabled;
    merged.type = merged.type || 'gaussian';
    merged.stdDev = this.normalizeStdDev(merged.stdDev);

    if (merged.seed !== null && merged.seed !== undefined && merged.seed !== '') {
      merged.seed = Number(merged.seed);
    } else {
      merged.seed = null;
    }

    return merged;
  }

  /**
   * Normaliza stdDev a desviaciones por eje en coordenadas locales del sensor.
   * Acepta escalar (aplicado en Y, eje de medición del perfilómetro) o { x, y, z }.
   */
  static normalizeStdDev(stdDev) {
    if (typeof stdDev === 'number') {
      const value = Math.max(0, stdDev);
      return { x: 0, y: value, z: 0 };
    }

    if (stdDev && typeof stdDev === 'object') {
      return {
        x: Math.max(0, Number(stdDev.x) || 0),
        y: Math.max(0, Number(stdDev.y) || 0),
        z: Math.max(0, Number(stdDev.z) || 0)
      };
    }

    return { x: 0, y: 0, z: 0 };
  }

  static hasActiveNoise(noiseConfig) {
    if (!noiseConfig?.enabled) return false;
    const std = noiseConfig.stdDev || {};
    return (std.x || 0) > 0 || (std.y || 0) > 0 || (std.z || 0) > 0;
  }

  /**
   * Aplica ruido a un perfil capturado.
   * @param {THREE.Vector3[]} profilePoints - Puntos en coordenadas del mundo
   * @param {import('../model/Sensor.js').default} sensor
   * @param {number} profileIndex - Índice del perfil (para semillas deterministas)
   */
  static apply(profilePoints, sensor, profileIndex = 0) {
    if (!profilePoints?.length || !sensor) return profilePoints;

    const noiseConfig = sensor.getNoiseConfig();
    if (!this.hasActiveNoise(noiseConfig)) return profilePoints;

    const handler = this._handlers[noiseConfig.type];
    if (!handler) {
      console.warn(`SensorNoiseService: tipo de ruido no soportado "${noiseConfig.type}"`);
      return profilePoints;
    }

    return handler.call(this, profilePoints, sensor, noiseConfig, profileIndex);
  }

  static _handlers = {
    gaussian: function applyGaussianNoise(profilePoints, sensor, noiseConfig, profileIndex) {
      const stdDev = noiseConfig.stdDev;
      const rng = this._createRng(noiseConfig.seed, profileIndex, sensor.id);

      const noisyProfile = [];
      for (let pointIndex = 0; pointIndex < profilePoints.length; pointIndex++) {
        const local = RaycastingIntersectionService.transformToSensorLocal(profilePoints[pointIndex], sensor);

        local.x += this._gaussianSample(rng) * stdDev.x;
        local.y += this._gaussianSample(rng) * stdDev.y;
        local.z += this._gaussianSample(rng) * stdDev.z;

        noisyProfile.push(this._transformToWorld(local, sensor));
      }

      return noisyProfile;
    }
  };

  static _transformToWorld(pointLocal, sensor) {
    return pointLocal
      .clone()
      .applyEuler(sensor.currentPose.rotation)
      .add(sensor.currentPose.position);
  }

  static _createRng(seed, profileIndex, sensorId) {
    let state = 0x9e3779b9;

    if (seed !== null && Number.isFinite(seed)) {
      state = (Math.imul(seed >>> 0, 0x85ebca6b) + profileIndex * 0x9e3779b1) >>> 0;
    } else {
      state = (Date.now() ^ (profileIndex * 0x27d4eb2d)) >>> 0;
    }

    for (let i = 0; i < sensorId.length; i++) {
      state = (Math.imul(state ^ sensorId.charCodeAt(i), 0x01000193)) >>> 0;
    }

    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Box-Muller para N(0,1). */
  static _gaussianSample(rng) {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
}
