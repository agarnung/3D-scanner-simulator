import * as THREE from 'three';
import TransformationService from '../services/TransformationService.js';
import SensorNoiseService from '../services/SensorNoiseService.js';

export default class Sensor {
  constructor(config) {
    this.id = config.id || 'sensor_default';
    this.mesh = config.mesh || null;
    this.pointsPerProfile = config.pointsPerProfile || 1024;
    this.frequency = config.frequency || 100; // Hz
    
    // Pose inicial del sensor
    this.initialPose = {
      position: new THREE.Vector3(...(config.pose?.position || [0, 0, 0])),
      rotation: new THREE.Euler(
        THREE.MathUtils.degToRad(config.pose?.rotation?.[0] || 0),
        THREE.MathUtils.degToRad(config.pose?.rotation?.[1] || 0),
        THREE.MathUtils.degToRad(config.pose?.rotation?.[2] || 0),
        'XYZ'
      )
    };
    
    // ROI (Region of Interest) del sensor
    this.roi = {
      yMax: config.roi?.yMax || 0.05,
      yMin: config.roi?.yMin || -0.025,
      x0: config.roi?.x0 || -0.15,
      x1: config.roi?.x1 || -0.135,
      x2: config.roi?.x2 || 0.135,
      x3: config.roi?.x3 || 0.15
    };
    
    // Movimientos del sensor (opcional)
    this.movements = config.movements || [];

    // Ruido de adquisición (override por sensor; se combina con defaultNoise de simulación)
    this.noiseOverride = config.noise || null;
    this.defaultNoise = config.defaultNoise || null;
    this._noiseConfig = SensorNoiseService.resolveNoiseConfig(this.defaultNoise, this.noiseOverride);
    
    // Pose actual (se actualiza durante el escaneo)
    this.currentPose = {
      position: this.initialPose.position.clone(),
      rotation: this.initialPose.rotation.clone()
    };
    
    // Aplicar pose inicial al mesh si existe
    if (this.mesh) {
      this.applyPose(this.initialPose);
    }
  }
  
  /**
   * Aplica una pose al sensor (actualiza el mesh y la pose actual)
   */
  applyPose(pose) {
    this.currentPose.position.copy(pose.position);
    this.currentPose.rotation.copy(pose.rotation);
    
    if (this.mesh) {
      this.mesh.position.copy(pose.position);
      this.mesh.rotation.copy(pose.rotation);
      this.mesh.updateMatrixWorld();
    }
  }
  
  /**
   * Resetea el sensor a su pose inicial
   */
  resetPose() {
    this.applyPose(this.initialPose);
  }
  
  /**
   * Obtiene el plano láser del sensor en coordenadas del mundo
   * El plano láser está en el plano XY local del sensor (Z=0 en coordenadas locales)
   */
  getLaserPlane() {
    // El plano láser está en Z=0 en coordenadas locales del sensor
    // Necesitamos transformarlo a coordenadas del mundo
    const normalLocal = new THREE.Vector3(0, 0, 1);
    const pointLocal = new THREE.Vector3(0, 0, 0);
    
    // Transformar normal y punto a coordenadas del mundo
    const normalWorld = normalLocal.clone().applyEuler(this.currentPose.rotation);
    const pointWorld = pointLocal.clone().applyEuler(this.currentPose.rotation).add(this.currentPose.position);
    
    // Crear el plano con normal y punto
    const plane = new THREE.Plane();
    plane.setFromNormalAndCoplanarPoint(normalWorld, pointWorld);
    
    return plane;
  }
  
  /**
   * Obtiene los puntos del trapecio ROI en coordenadas del mundo
   */
  getROIPoints() {
    const pointsLocal = [
      new THREE.Vector3(this.roi.x0, this.roi.yMin, 0),
      new THREE.Vector3(this.roi.x1, this.roi.yMax, 0),
      new THREE.Vector3(this.roi.x2, this.roi.yMax, 0),
      new THREE.Vector3(this.roi.x3, this.roi.yMin, 0),
      new THREE.Vector3(this.roi.x0, this.roi.yMin, 0)
    ];
    
    // Transformar puntos a coordenadas del mundo
    return pointsLocal.map(point => {
      return point.clone().applyEuler(this.currentPose.rotation).add(this.currentPose.position);
    });
  }
  
  /**
   * Calcula la pose del sensor en un perfil específico basado en sus movimientos
   */
  calculatePoseAtProfile(profileIndex, totalProfiles) {
    return TransformationService.calculatePoseAtProfile(
      this.initialPose,
      this.movements,
      profileIndex,
      totalProfiles
    );
  }

  getNoiseConfig() {
    return this._noiseConfig;
  }

  setDefaultNoise(defaultNoise) {
    this.defaultNoise = defaultNoise || null;
    this._noiseConfig = SensorNoiseService.resolveNoiseConfig(this.defaultNoise, this.noiseOverride);
  }

  setNoiseOverride(noiseOverride) {
    this.noiseOverride = noiseOverride || null;
    this._noiseConfig = SensorNoiseService.resolveNoiseConfig(this.defaultNoise, this.noiseOverride);
  }
}