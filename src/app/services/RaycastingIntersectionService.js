import * as THREE from 'three';

export default class RaycastingIntersectionService {
  static yMaxAOI = 0.05;
  static yMinAOI = -0.025;
  static x0AOI = -0.15;
  static x1AOI = -0.135;
  static x2AOI = 0.135;
  static x3AOI = 0.15;

  static EPS = 1e-6;

  static intersectLaserProfile(objectMesh, sensor, pointsPerProfile = 300, surfaceOnlyMode = true) {
    if (!objectMesh || !sensor) {
      console.warn('RaycastingIntersectionService: faltan objectMesh o sensor');
      return [];
    }

    const roi = sensor?.roi || {
      yMax: this.yMaxAOI,
      yMin: this.yMinAOI,
      x0: this.x0AOI,
      x1: this.x1AOI,
      x2: this.x2AOI,
      x3: this.x3AOI
    };

    // 1) Discretizar el perfil en N muestras uniformes a lo largo del ancho útil (X local).
    const samples = Math.max(1, Number(pointsPerProfile) || 1);
    const xStart = roi.x0;
    const xEnd = roi.x3;
    const xRange = xEnd - xStart;
    const xStep = samples > 1 ? xRange / (samples - 1) : 0;

    // 2) Lanzar rayos paralelos en -Y local desde una línea de origen por encima de la ROI.
    // Así emulamos un perfilómetro lineal que barre de forma consistente cada columna del perfil.
    const yOriginLocal = roi.yMax + Math.max(1e-3, (roi.yMax - roi.yMin) * 0.25);
    const rayLength = Math.max(1.0, (roi.yMax - roi.yMin) * 40);

    const rotation = sensor.currentPose.rotation;
    const sensorPosition = sensor.currentPose.position;

    const directionLocal = new THREE.Vector3(0, -1, 0);
    const directionWorld = directionLocal.clone().applyEuler(rotation).normalize();

    const raycaster = new THREE.Raycaster();
    raycaster.firstHitOnly = true;
    raycaster.near = 0;
    raycaster.far = rayLength;

    const profilePoints = [];

    for (let i = 0; i < samples; i++) {
      const xLocal = xStart + xStep * i;
      const originLocal = new THREE.Vector3(xLocal, yOriginLocal, 0);
      const originWorld = originLocal.clone().applyEuler(rotation).add(sensorPosition);

      raycaster.set(originWorld, directionWorld);
      const hits = raycaster.intersectObject(objectMesh, true);
      if (!hits || hits.length === 0) continue;

      // 3) Selección de intersección según modo:
      // - superficie visible: primera colisión (frente visible)
      // - rayos X: primera + última colisión (entrada + salida), si son distintas
      const candidateHits = surfaceOnlyMode
        // Modo visible: primera colisión a lo largo del rayo emitido.
        ? [hits[0]]
        // Modo rayos X: entrada + salida a lo largo del mismo rayo.
        : [hits[0], hits[hits.length - 1]];

      for (let hitIndex = 0; hitIndex < candidateHits.length; hitIndex++) {
        const candidate = candidateHits[hitIndex];
        if (!candidate?.point) continue;

        const hitPointWorld = candidate.point;
        // 4) Validación final en ROI (en sistema local del sensor) para evitar fugas geométricas.
        const hitPointLocal = this.transformToSensorLocal(hitPointWorld, sensor);
        if (!this.isPointInsideROI(hitPointLocal, roi)) continue;

        // Evitar duplicados cuando solo hay una colisión real (primera == última).
        const isDuplicated =
          hitIndex > 0 &&
          profilePoints.length > 0 &&
          profilePoints[profilePoints.length - 1].distanceToSquared(hitPointWorld) < this.EPS * this.EPS;
        if (isDuplicated) continue;

        profilePoints.push(hitPointWorld.clone());
      }
    }

    return profilePoints;
  }

  static isPointInsideROI(ptLocal, roi) {
    if (ptLocal.y < roi.yMin - this.EPS || ptLocal.y > roi.yMax + this.EPS) return false;

    const yRange = roi.yMax - roi.yMin;
    if (Math.abs(yRange) < this.EPS) return false;

    const xSlopeLeft = (roi.x1 - roi.x0) / yRange;
    const xSlopeRight = (roi.x2 - roi.x3) / yRange;
    const xLeft = roi.x0 + xSlopeLeft * (ptLocal.y - roi.yMin);
    const xRight = roi.x3 + xSlopeRight * (ptLocal.y - roi.yMin);

    return ptLocal.x >= (xLeft - this.EPS) && ptLocal.x <= (xRight + this.EPS);
  }

  static transformToSensorLocal(pointWorld, sensor) {
    if (!sensor || !sensor.currentPose) return pointWorld.clone();

    const pointLocal = pointWorld.clone();
    pointLocal.sub(sensor.currentPose.position);

    const inverseQuat = new THREE.Quaternion()
      .setFromEuler(sensor.currentPose.rotation)
      .invert();
    pointLocal.applyQuaternion(inverseQuat);
    return pointLocal;
  }
}