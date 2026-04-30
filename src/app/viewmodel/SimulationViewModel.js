import * as THREE from 'three';

import ModelLoader, { buildBVH, disposeBVH } from '../services/ModelLoader.js';
import Sensor from '../model/Sensor.js';
import TransformationService from '../services/TransformationService.js';

import StartScanCommand from './commands/StartScanCommand.js';
import StopScanCommand from './commands/StopScanCommand.js';
import ResetScanCommand from './commands/ResetScanCommand.js';

import ProfileRenderer2D from '../services/ProfileRenderer2D.js';

import ScanExportService from '../services/ScanExportService.js';

export default class SimulationViewModel {
  constructor({ pointsPerProfile = 300, onShowLoadingPopup, onHideLoadingPopup, config, intersectionService } = {}) {
    this.object = null;
    this.sensors = []; // Array de sensores (soporta múltiples)
    this.config = config || {};
    this.intersectionService = intersectionService; // Servicio de intersección inyectado

    // Funciones callback que se le pasan desde el JS que contiene el contexto del DOM, para notificar el inicio y fin de carga de modelo
    this.onShowLoadingPopup = onShowLoadingPopup || (() => {});
    this.onHideLoadingPopup = onHideLoadingPopup || (() => {});

    this.isRotating = false;
    this.view = null;
    this.modelLoader = new ModelLoader();

    // Variables para el escaneo
    this.profiles = []; // Array para almacenar los perfiles (por sensor)
    this.profilesBySensor = {}; // Perfiles organizados por sensor: {sensorId: [profiles]}
    this.totalPoints = 0;
    
    // Pose inicial del objeto y sus movimientos
    this.objectInitialPose = null;
    this.objectOriginalInitialPose = null; // Pose original que nunca cambia
    this.objectMovements = [];

    // Parámetros de escaneo sincronizado emulando encoder
    this.totalProfiles = 4096; // Total de perfiles que se realizarán (desde YAML)
    this.offsetZ = 0.001; // Offset Z para reconstrucción (desde YAML)
    this.currentProfileCount = 0;

    this.pointsPerProfile = pointsPerProfile; // Número de puntos por perfil (resoulución del láser)

    this.hasStartedScan = false; // Indica si se ha iniciado un escaneo

    // Modo de visualización en tiempo real
    this.realTimeVisualization = false; // Si está activo, muestra movimientos en tiempo real
    this.realTimeProgress = 0; // Progreso actual (0-1) para visualización en tiempo real
    this.realTimeSpeed = 1.0; // Velocidad de la visualización (multiplicador)
    this.realTimeAnimationId = null; // ID del requestAnimationFrame
    this.realTimeStartTime = null; // Tiempo de inicio de la visualización
    this.realTimeDuration = 10.0; // Duración total de la visualización en segundos

    // Modo de escaneo: solo superficie visible (true) o modo rayos X (false)
    this.surfaceOnlyMode = true; // Por defecto, modo realista (solo superficie visible)

    // Comandos
    this.startScanCommand = new StartScanCommand(this);
    this.stopScanCommand = new StopScanCommand(this);
    this.resetScanCommand = new ResetScanCommand(this);

    this.profileRenderer2D = new ProfileRenderer2D();
    
    // Sensor seleccionado para visualización 1D
    this.selectedSensorIndex = 0; // Índice del sensor actualmente visualizado
  }

  setView(view) {
    this.view = view;
    if (this.object) view.scene.add(this.object.mesh);
    // Agregar todos los sensores a la escena
    this.sensors.forEach(sensor => {
      if (sensor.mesh) view.scene.add(sensor.mesh);
    });
  }

  addProfile(profile, sensorId = null) {
    if (profile && profile.length > 0) {
      this.profiles.push(profile);
      this.totalPoints += profile.length;
      
      // Almacenar perfil por sensor si se proporciona sensorId
      if (sensorId) {
        if (!this.profilesBySensor[sensorId]) {
          this.profilesBySensor[sensorId] = [];
        }
        this.profilesBySensor[sensorId].push(profile);
      }

      if (window.updateUI) {
        window.updateUI.profileCountDisplay(this.profiles.length);
        window.updateUI.pointCountDisplay(this.totalPoints);
      }

      console.log(`Perfil añadido${sensorId ? ` (${sensorId})` : ''}. Total: ${this.profiles.length} perfiles, ${this.totalPoints} puntos`);
    }
  }

  clearProfiles() {
    this.profiles = [];
    this.profilesBySensor = {};
    this.totalPoints = 0;

    if (window.updateUI) {
      window.updateUI.profileCountDisplay(0);
      window.updateUI.pointCountDisplay(0);
    }

    console.log('Perfiles limpiados');
  }

  async loadObject(url, fileExtension = null, showErrorAlert = true) {
    
    let loadingShown = false;

    // Mostrar el popup solo si la carga tarda más de 100ms
    const loadingTimeout = setTimeout(() => {
        this.onShowLoadingPopup();
        loadingShown = true;
    }, 100);

    try {
        const model = await this.modelLoader.loadModel(url, fileExtension);

        // Aplicar pose inicial del objeto desde la configuración
        const objectConfig = this.config.object || {};
        const initialPose = objectConfig.initialPose || { position: [0, -0.25, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
        
        model.position.set(...initialPose.position);
        model.rotation.set(
          THREE.MathUtils.degToRad(initialPose.rotation[0] || 0),
          THREE.MathUtils.degToRad(initialPose.rotation[1] || 0),
          THREE.MathUtils.degToRad(initialPose.rotation[2] || 0)
        );
        const initialScale = Array.isArray(initialPose.scale) && initialPose.scale.length === 3
          ? initialPose.scale
          : [1, 1, 1];
        model.scale.set(initialScale[0], initialScale[1], initialScale[2]);
        
        this.object = {
          mesh: model,
        };
        
        // Guardar pose inicial y movimientos (convertir a formato compatible con TransformationService)
        this.objectInitialPose = {
          position: model.position.clone(),
          rotation: model.rotation.clone(),
          scale: model.scale.clone()
        };
        // Guardar también la pose original (que nunca cambia)
        this.objectOriginalInitialPose = {
          position: model.position.clone(),
          rotation: model.rotation.clone(),
          scale: model.scale.clone()
        };
        this.objectMovements = objectConfig.movements || [];
        
        // También guardar en formato simple para compatibilidad
        this.objectInitialPoseSimple = {
          position: {
            x: model.position.x,
            y: model.position.y,
            z: model.position.z
          },
          rotation: {
            x: model.rotation.x,
            y: model.rotation.y,
            z: model.rotation.z
          }
        };
        
        // Construir BVH para acelerar todos los raycasts de oclusión posteriores.
        buildBVH(model);

        if (this.view) this.view.scene.add(model);
        console.log('Objeto cargado:', url);

    } catch (err) {
        console.error('Error cargando modelo:', err);
        if (showErrorAlert) {
        alert('Hubo un error al cargar el modelo.');
        } else {
            console.warn('Modelo no cargado (esto es normal si no hay modelo configurado)');
        }
    } finally {
        clearTimeout(loadingTimeout); // Cancelar el timeout si ya se cargó
        if (loadingShown) this.onHideLoadingPopup();
    }
  }

  removeCurrentObject() {
    if (this.object && this.object.mesh) {
      if (this.view) {
        this.view.scene.remove(this.object.mesh);
      }

      // Liberar BVH antes de liberar geometría.
      disposeBVH(this.object.mesh);

      // Liberar recursos de geometría y material
      this.object.mesh.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((mat) => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });

      this.object = null;
      console.log('Modelo actual eliminado de la escena');
    } else {
      console.warn('No hay modelo cargado para eliminar');
    }
  }

  async loadSensors(sensorConfigs) {
    // Eliminar sensores anteriores si existen
    this.removeAllSensors();
    
    // Cargar múltiples sensores desde la configuración
    if (!sensorConfigs || sensorConfigs.length === 0) {
      console.warn('No hay sensores configurados');
      return;
    }
    
    for (const sensorConfig of sensorConfigs) {
      try {
        // Agregar timestamp para evitar caché en modelos de sensores
        const modelUrl = sensorConfig.model;
        const separator = modelUrl.includes('?') ? '&' : '?';
        const urlWithCacheBust = `${modelUrl}${separator}t=${new Date().getTime()}`;
        
        const model = await this.modelLoader.loadModel(urlWithCacheBust);
        
        // Crear instancia de Sensor con la configuración
        const sensor = new Sensor({
          id: sensorConfig.id,
          mesh: model,
          pointsPerProfile: sensorConfig.pointsPerProfile,
          pose: sensorConfig.pose,
          roi: sensorConfig.roi,
          movements: sensorConfig.movements || []
        });
        
        this.sensors.push(sensor);
        
        if (this.view) {
          this.view.scene.add(model);
          // Actualizar visualizaciones de ROI
          this.view.updateAOIVisualizations(this.sensors);
        }
        console.log(`Sensor cargado: ${sensorConfig.id}`, sensorConfig.model);
      } catch (err) {
        console.error(`[SENSOR] Error cargando sensor ${sensorConfig.id}:`, err);
      }
    }
    
    // Actualizar el display del sensor después de cargar todos
    this.updateSensorDisplay();
  }
  
  /**
   * Elimina todos los sensores de la escena
   */
  removeAllSensors() {
    if (this.view) {
      this.sensors.forEach(sensor => {
        if (sensor.mesh) {
          this.view.scene.remove(sensor.mesh);
          // Liberar recursos
          sensor.mesh.traverse((child) => {
            if (child.isMesh) {
              if (child.geometry) child.geometry.dispose();
              if (child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach((mat) => mat.dispose());
                } else {
                  child.material.dispose();
                }
              }
            }
          });
        }
      });
    }
    this.sensors = [];
  }

  // El escaneo está en sincronía con el encoder virtual, por lo que no se puede rotar continuamente, i.e.:
  // for perfil in perfiles:
  //  aplicar transformaciones del objeto y sensores según movimientos configurados
  //  escanear con cada sensor
  //  esperar siguiente
  async scanStepByStep() {
    if (!this.isRotating || !this.object) {
      console.warn('No se puede escanear: isRotating=', this.isRotating, 'object=', !!this.object);
      return;
    }
    
    if (this.sensors.length === 0) {
      console.warn('No hay sensores configurados para escanear');
      return;
    }

    // Detener visualización en tiempo real si está activa
    if (this.realTimeVisualization) {
      this.stopRealTimeVisualization();
    }

    // Asegurar que tenemos la pose inicial del objeto guardada
    // Si se está reanudando desde una pausa, usar objectInitialPose que ya está guardada
    // Si es la primera vez, guardar la pose actual como inicial
    if (!this.objectInitialPose) {
      this.objectInitialPose = {
        position: this.object.mesh.position.clone(),
        rotation: this.object.mesh.rotation.clone(),
        scale: this.object.mesh.scale.clone()
      };
      // También guardar en formato simple
      this.objectInitialPoseSimple = {
        position: {
          x: this.object.mesh.position.x,
          y: this.object.mesh.position.y,
          z: this.object.mesh.position.z
        },
        rotation: {
          x: this.object.mesh.rotation.x,
          y: this.object.mesh.rotation.y,
          z: this.object.mesh.rotation.z
        }
      };
    }

    // Si se está reanudando desde una pausa, restaurar el objeto a la posición correcta
    // para el perfil actual antes de continuar
    if (this.currentProfileCount > 0 && this.currentProfileCount < this.totalProfiles) {
      const objectPose = TransformationService.calculatePoseAtProfile(
        this.objectInitialPose,
        this.objectMovements,
        this.currentProfileCount,
        this.totalProfiles
      );
      this.object.mesh.position.copy(objectPose.position);
      this.object.mesh.rotation.copy(objectPose.rotation);
      if (this.objectInitialPose.scale) this.object.mesh.scale.copy(this.objectInitialPose.scale);
      this.object.mesh.updateMatrixWorld();
      
      // También restaurar sensores a la posición correcta
      this.sensors.forEach(sensor => {
        const sensorPose = sensor.calculatePoseAtProfile(this.currentProfileCount, this.totalProfiles);
        sensor.applyPose(sensorPose);
      });
    }

    // Guardar la pose inicial del objeto para restaurar después (solo si se completa)
    const initialObjectPose = {
      position: this.objectInitialPose.position.clone(),
      rotation: this.objectInitialPose.rotation.clone(),
      scale: this.objectInitialPose.scale ? this.objectInitialPose.scale.clone() : this.object.mesh.scale.clone()
    };

    try {
      // Continuar desde el perfil actual (permite pausar y reanudar)
      for (let i = this.currentProfileCount; i < this.totalProfiles; i++) {
        if (!this.isRotating) break;

        // Calcular la pose del objeto en este perfil basado en sus movimientos
        const objectPose = TransformationService.calculatePoseAtProfile(
          this.objectInitialPose,
          this.objectMovements,
          i,
          this.totalProfiles
        );
        
        // Aplicar la pose calculada al objeto
        this.object.mesh.position.copy(objectPose.position);
        this.object.mesh.rotation.copy(objectPose.rotation);
        if (this.objectInitialPose.scale) this.object.mesh.scale.copy(this.objectInitialPose.scale);
        this.object.mesh.updateMatrixWorld();

        // Escanear con cada sensor
        for (const sensor of this.sensors) {
          // Calcular la pose del sensor en este perfil
          const sensorPose = sensor.calculatePoseAtProfile(i, this.totalProfiles);
          sensor.applyPose(sensorPose);
        }

        // Actualizar visualizaciones de ROI cuando los sensores se mueven
        // Actualizar con menos frecuencia para mejorar rendimiento
        if (i % 1 === 0 && this.view) {
          this.view.updateAOIVisualizations(this.sensors);
        }

        // Realizar el escaneo con cada sensor
        for (const sensor of this.sensors) {
          // Realizar el escaneo con este sensor
          const profile = this.intersectionService.intersectLaserProfile(
            this.object.mesh,
            sensor,
            sensor.pointsPerProfile,
            this.surfaceOnlyMode
          );

          // Visualizar siempre para el sensor seleccionado (incluso si no hay puntos)
          // Cambiar el i % 1 === 0 a otro valor en vez de 1 para actualizar menos frecuentemente
          if (i % 1 === 0 && sensor === this.sensors[this.selectedSensorIndex]) {
            // Solo visualizar el sensor seleccionado
            this.clearCurrentProfilePointsVisualization();
            
            if (profile && profile.length > 0) {
              // Hay puntos: mostrar el perfil
              this.showProfile(profile);
              this.profileRenderer2D.drawProfile(profile);
            } else {
              // No hay puntos: limpiar visualizaciones
              this.profileRenderer2D.clearCanvas();
            }
          }

          // Solo agregar perfil a la lista si tiene puntos
          if (profile && profile.length > 0) {
            // Solo loggear cada 100 perfiles para reducir overhead
            if (i % 100 === 0) {
              console.log(`Perfil ${i}/${this.totalProfiles} (${sensor.id}) generado con ${profile.length} puntos`);
            }
            this.addProfile(profile, sensor.id);
          }
        }

        this.currentProfileCount++;

        if (window.updateUI) {
          window.updateUI.profileCountDisplay(this.currentProfileCount);
        }

        // Esperar artificialmente un poco para visualizar el proceso
        // con await se puede opcionalmente esperar algo de tiempo (e.g. 20 ms) antes de continuar con el siguiente paso del escaneo.
        // Solo hacer await cada 1 iteraciones para no bloquear innecesariamente
        // Esto permite que el navegador procese otros eventos pero no en cada iteración
        if (i % 1 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    } finally {
      // Solo restaurar poses si el escaneo se completó o se detuvo intencionalmente
      // Si se detuvo (isRotating = false), mantener las poses actuales para poder reanudar
      if (!this.isRotating && this.currentProfileCount < this.totalProfiles) {
        // Escaneo detenido: mantener estado actual (no restaurar)
        console.log(`Escaneo pausado en perfil ${this.currentProfileCount}/${this.totalProfiles}`);
      } else {
        // Escaneo completado: restaurar poses iniciales
      if (this.object && this.object.mesh) {
        this.object.mesh.position.copy(initialObjectPose.position);
        this.object.mesh.rotation.copy(initialObjectPose.rotation);
        if (initialObjectPose.scale) this.object.mesh.scale.copy(initialObjectPose.scale);
        this.object.mesh.updateMatrixWorld();
      }
      
      // Restaurar poses iniciales de los sensores
      this.sensors.forEach(sensor => sensor.resetPose());
      }
      
      // Actualizar UI final
      if (window.updateUI) {
        window.updateUI.profileCountDisplay(this.currentProfileCount);
      }
      
      // Solo marcar como no rotando si se completó o se detuvo
      if (this.currentProfileCount >= this.totalProfiles) {
        this.isRotating = false;
        if (window.updateUI) window.updateUI.scanStatus('Completado');
        this.finishedScan = true;
      }
    }
  }

  showProfile(profile) {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array(profile.length * 3);

    for (let i = 0; i < profile.length; i++) {
      vertices[i * 3] = profile[i].x;
      vertices[i * 3 + 1] = profile[i].y;
      vertices[i * 3 + 2] = profile[i].z;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    const material = new THREE.PointsMaterial({ color: 0xff0000, size: 0.005 });
    const points = new THREE.Points(geometry, material);

    points.name = 'puntos_actuales'; // Identificador para poder limpiarlos de la vista luego y sobreescribirlos

    if (this.view) this.view.scene.add(points);
  }

  clearCurrentProfilePointsVisualization() {
    if (!this.view) return;

    const toRemove = [];

    this.view.scene.traverse((obj) => {
      if (obj.name === 'puntos_actuales') {
        toRemove.push(obj);
      }
    });

    toRemove.forEach((obj) => {
      this.view.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }

  // async marca una función como asíncrona, permitiéndole usar await, y await pausa la ejecución dentro
  // de esa función hasta que la operación (como un escaneo o un retraso con setTimeout) haya terminado
  async startScan(profileCount) {
    if (!profileCount || profileCount <= 0) {
        console.warn('Parámetros inválidos al iniciar escaneo');
        return;
    }

    this.totalProfiles = profileCount;

    // Solo reiniciar contadores si no hay un escaneo iniciado previamente
    // Si se detuvo y se reanuda, mantener el estado actual (currentProfileCount, perfiles, etc.)
    if (!this.hasStartedScan) {
        this.currentProfileCount = 0;
        this.totalPoints = 0;
        this.profiles = [];
        this.profilesBySensor = {};
    }

    // La actualización de poses se hace dentro de scanStepByStep() para asegurar
    // que objectInitialPose esté correctamente inicializado

    this.isRotating = true;

    if (window.updateUI) {
      window.updateUI.scanStatus('Escaneando...');
    }

    await this.scanStepByStep(); // Iniciar/continuar escaneo por encoder (por pasos)
  }

  async exportScanResults(scanName, offsetZ = 0.1) {
    if (!this.profiles || this.profiles.length === 0) {
      console.warn('No hay perfiles para exportar');
      return;
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 16).replace(/[:T]/g, '_'); // YYYY-MM-DD_HH_MM

    // Crear nombre de carpeta/zip
    const folderName = `${scanName}_${dateStr}`;

    // Exportar todos los archivos a un ZIP
    await ScanExportService.exportToZip(
      this.profiles,
      this.profilesBySensor,
      this.sensors,
      folderName,
      offsetZ,
      this.objectInitialPoseSimple,
      this.objectMovements,
      this.totalProfiles
    );
  }

  setWireframeMode(enabled) {
    if (this.object?.mesh) {
      // Recorrer los hijos del objeto y cambiar el modo wireframe de los materiales
      this.object.mesh.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.wireframe = enabled;
          child.material.needsUpdate = true;
        }
      });
    } else {
      console.warn('No hay objeto cargado para cambiar el modo wireframe');
    }
  }

  /**
   * Inicia la visualización en tiempo real de los movimientos
   */
  startRealTimeVisualization() {
    if (this.realTimeVisualization) {
      console.warn('La visualización en tiempo real ya está activa');
      return;
    }

    if (!this.object || this.sensors.length === 0) {
      console.warn('No hay objeto o sensores cargados para visualizar');
      return;
    }

    // Asegurar que tenemos poses iniciales guardadas
    if (!this.objectInitialPose) {
      this.objectInitialPose = {
        position: this.object.mesh.position.clone(),
        rotation: this.object.mesh.rotation.clone(),
        scale: this.object.mesh.scale.clone()
      };
    }

    this.realTimeVisualization = true;
    this.realTimeProgress = 0;
    this.realTimeStartTime = null; // Se inicializará en el primer frame
    
    // Iniciar bucle de animación
    this.realTimeAnimationId = requestAnimationFrame((timestamp) => this.updateRealTimeVisualization(timestamp));
    
    console.log('Visualización en tiempo real iniciada');
  }

  /**
   * Detiene la visualización en tiempo real
   */
  stopRealTimeVisualization() {
    if (!this.realTimeVisualization) {
      return;
    }

    this.realTimeVisualization = false;
    
    if (this.realTimeAnimationId) {
      cancelAnimationFrame(this.realTimeAnimationId);
      this.realTimeAnimationId = null;
    }

    // Restaurar poses iniciales
    this.resetToInitialPoses();
    
    console.log('Visualización en tiempo real detenida');
  }

  /**
   * Actualiza la visualización en tiempo real
   */
  updateRealTimeVisualization(timestamp) {
    if (!this.realTimeVisualization) {
      return;
    }

    // Inicializar tiempo de inicio si es la primera vez
    if (this.realTimeStartTime === null) {
      this.realTimeStartTime = timestamp;
    }

    // Calcular progreso basado en tiempo real
    const elapsed = (timestamp - this.realTimeStartTime) / 1000.0; // Convertir a segundos
    this.realTimeProgress = (elapsed * this.realTimeSpeed) / this.realTimeDuration;

    if (this.realTimeProgress >= 1.0) {
      this.realTimeProgress = 1.0;
    }

    // Calcular perfil actual basado en el progreso
    const currentProfile = Math.min(
      Math.floor(this.realTimeProgress * this.totalProfiles),
      this.totalProfiles - 1
    );
    
    // Actualizar poses del objeto y sensores
    this.updatePosesForProfile(currentProfile);

    // Continuar animación
    this.realTimeAnimationId = requestAnimationFrame((ts) => this.updateRealTimeVisualization(ts));

    // Si llegamos al final, reiniciar automáticamente
    if (this.realTimeProgress >= 1.0) {
      this.realTimeStartTime = null; // Reiniciar para loop continuo
      this.realTimeProgress = 0;
    }
  }

  /**
   * Actualiza las poses del objeto y sensores para un perfil específico
   */
  updatePosesForProfile(profileIndex) {
    if (!this.object || !this.objectInitialPose) {
      return;
    }

    // Asegurar que el índice está en rango
    const safeIndex = Math.max(0, Math.min(profileIndex, this.totalProfiles - 1));

    // Actualizar pose del objeto
    const objectPose = TransformationService.calculatePoseAtProfile(
      this.objectInitialPose,
      this.objectMovements,
      safeIndex,
      this.totalProfiles
    );
    
    if (this.object.mesh) {
      this.object.mesh.position.copy(objectPose.position);
      this.object.mesh.rotation.copy(objectPose.rotation);
      if (this.objectInitialPose.scale) this.object.mesh.scale.copy(this.objectInitialPose.scale);
      this.object.mesh.updateMatrixWorld();
    }

    // Actualizar poses de los sensores
    this.sensors.forEach(sensor => {
      const sensorPose = sensor.calculatePoseAtProfile(safeIndex, this.totalProfiles);
      sensor.applyPose(sensorPose);
    });

    // Actualizar visualizaciones de ROI
    if (this.view) {
      this.view.updateAOIVisualizations(this.sensors);
    }
  }

  /**
   * Restaura las poses iniciales del objeto y sensores
   */
  resetToInitialPoses() {
    if (this.object && this.objectInitialPose) {
      this.object.mesh.position.copy(this.objectInitialPose.position);
      this.object.mesh.rotation.copy(this.objectInitialPose.rotation);
      if (this.objectInitialPose.scale) this.object.mesh.scale.copy(this.objectInitialPose.scale);
      this.object.mesh.updateMatrixWorld();
    } else if (this.object && this.object.mesh) {
      // Si no hay pose inicial guardada, usar la pose actual como inicial
      this.objectInitialPose = {
        position: this.object.mesh.position.clone(),
        rotation: this.object.mesh.rotation.clone(),
        scale: this.object.mesh.scale.clone()
      };
    }

    this.sensors.forEach(sensor => sensor.resetPose());

    if (this.view) {
      this.view.updateAOIVisualizations(this.sensors);
    }
  }

  /**
   * Establece la velocidad de la visualización en tiempo real
   */
  setRealTimeSpeed(speed) {
    this.realTimeSpeed = Math.max(0.1, Math.min(5.0, speed)); // Limitar entre 0.1x y 5x
  }

  /**
   * Cambia al sensor anterior en la visualización 1D
   */
  selectPreviousSensor() {
    if (this.sensors.length === 0) return;
    this.selectedSensorIndex = (this.selectedSensorIndex - 1 + this.sensors.length) % this.sensors.length;
    this.updateSensorDisplay();
    this.redrawCurrentProfile();
  }

  /**
   * Cambia al sensor siguiente en la visualización 1D
   */
  selectNextSensor() {
    if (this.sensors.length === 0) return;
    this.selectedSensorIndex = (this.selectedSensorIndex + 1) % this.sensors.length;
    this.updateSensorDisplay();
    this.redrawCurrentProfile();
  }

  /**
   * Actualiza el número del sensor en la UI
   */
  updateSensorDisplay() {
    const sensorNumberElement = document.getElementById('sensor-number');
    if (sensorNumberElement && this.sensors.length > 0) {
      sensorNumberElement.textContent = this.selectedSensorIndex + 1;
    }
  }

  /**
   * Redibuja el perfil del sensor actualmente seleccionado
   */
  redrawCurrentProfile() {
    if (this.sensors.length === 0 || this.selectedSensorIndex >= this.sensors.length) return;
    
    const selectedSensor = this.sensors[this.selectedSensorIndex];
    const sensorId = selectedSensor.id;
    
    // Buscar el último perfil del sensor seleccionado
    if (this.profilesBySensor[sensorId] && this.profilesBySensor[sensorId].length > 0) {
      const lastProfile = this.profilesBySensor[sensorId][this.profilesBySensor[sensorId].length - 1];
      if (lastProfile && lastProfile.length > 0) {
        this.profileRenderer2D.drawProfile(lastProfile);
      } else {
        // Si no hay perfil, limpiar el canvas
        this.profileRenderer2D.clearCanvas();
      }
    } else {
      // Si no hay perfiles para este sensor, limpiar el canvas
      this.profileRenderer2D.clearCanvas();
    }
  }

  /**
   * Establece la duración de la visualización en tiempo real
   */
  setRealTimeDuration(duration) {
    this.realTimeDuration = Math.max(1.0, Math.min(60.0, duration)); // Limitar entre 1 y 60 segundos
  }
}