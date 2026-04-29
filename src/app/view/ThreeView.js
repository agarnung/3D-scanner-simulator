import * as THREE from 'three';

import jsyaml from 'js-yaml';

import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';

import EdgePlaneIntersectionService from '../services/EdgePlaneIntersectionService.js';
import FacePlaneIntersectionService from '../services/FacePlaneIntersectionService.js';

export default class ThreeView {
  constructor(container, viewModel) {
    this.container = container;
    this.viewModel = viewModel;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    
    // Prevenir arrastre de imagen del navegador en el canvas
    this.renderer.domElement.style.userSelect = 'none';
    this.renderer.domElement.style.webkitUserSelect = 'none';
    this.renderer.domElement.style.mozUserSelect = 'none';
    this.renderer.domElement.style.msUserSelect = 'none';
    this.renderer.domElement.style.webkitUserDrag = 'none';
    this.renderer.domElement.style.userDrag = 'none';
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.style.pointerEvents = 'auto';
    
    // Prevenir el comportamiento de arrastre por defecto del navegador
    this.renderer.domElement.addEventListener('dragstart', (e) => {
      e.preventDefault();
      return false;
    }, false);
    
    this.renderer.domElement.addEventListener('selectstart', (e) => {
      e.preventDefault();
      return false;
    }, false);
    
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;

    // Configuración inicial de cámara
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    // Luz direccional
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    this.scene.add(directionalLight);

    // Luz ambiental
    const ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(ambientLight);

    // Ejes de referencia
    const axesHelper = new THREE.AxesHelper(5);
    this.scene.add(axesHelper);
    this.scene.add(new THREE.AxesHelper(0.5)); // Ejes XYZ de medio metro

    // Cuadrícula
    const gridHelper = new THREE.GridHelper(10, 100,); // Cuadrícula de 1 metro
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.1;
    this.scene.add(gridHelper);

    this.aoiVisualizations = []; // Array para almacenar visualizaciones de ROI de múltiples sensores

    // Controles de transformación para edición manual
    this.transformControls = null;
    this.editMode = false;
    this.currentEditTarget = null;

    this.loadConfig();
    // NO llamar animate() aquí - el bucle principal está en main.js
  }
  
  /**
   * Actualiza las visualizaciones de ROI para todos los sensores
   */
  updateAOIVisualizations(sensors) {
    // Limpiar visualizaciones anteriores
    this.aoiVisualizations.forEach(viz => {
      this.scene.remove(viz);
      if (viz.geometry) viz.geometry.dispose();
      if (viz.material) viz.material.dispose();
    });
    this.aoiVisualizations = [];
    
    // Crear visualizaciones para cada sensor
    if (sensors && sensors.length > 0) {
      sensors.forEach((sensor, index) => {
        const roiPoints = sensor.getROIPoints();
        if (roiPoints && roiPoints.length > 0) {
          const geometry = new THREE.BufferGeometry().setFromPoints(roiPoints);
          const material = new THREE.LineBasicMaterial({
            color: index === 0 ? 0xffff00 : 0x00ffff, // Amarillo para el primero, cyan para los demás
            transparent: true,
            opacity: 0.7,
            linewidth: 2
          });
          const line = new THREE.Line(geometry, material);
          line.name = `aoi_${sensor.id}`;
          this.scene.add(line);
          this.aoiVisualizations.push(line);
        }
      });
    }
  }

  async loadConfig() {
    try {
      const timestamp = new Date().getTime();
      const response = await fetch(`/configs/simulator.yaml?t=${timestamp}`, {
        cache: 'no-store'
      });
      const yamlText = await response.text();
      const config = jsyaml.load(yamlText);
      this.applyConfig(config);
    } catch (err) {
      console.error('Error cargando configuración:', err);
    }
  }

  applyConfig(config) {
    // Fondo
    if (config.scene?.backgroundColor) {
      this.scene.background = new THREE.Color(config.scene.backgroundColor);
    }

    // Niebla
    if (config.scene?.fog) {
      const fog = config.scene.fog;
      this.scene.fog = new THREE.Fog(fog.color, fog.near, fog.far);
    }

    // Cámara
    if (config.camera) {
      const cam = config.camera;
      if (cam.fov !== undefined) this.camera.fov = cam.fov;
      if (cam.near !== undefined) this.camera.near = cam.near;
      if (cam.far !== undefined) this.camera.far = cam.far;
      if (cam.position) this.camera.position.set(...cam.position);
      if (cam.lookAt) this.camera.lookAt(new THREE.Vector3(...cam.lookAt));
      this.camera.updateProjectionMatrix();
    }

    // Luces
    if (config.lights) {
      // Limpia las luces previas (si es necesario)
      this.scene.children = this.scene.children.filter(obj => !(obj.isLight));

      config.lights.forEach(light => {
        let lightObj;
        const color = new THREE.Color(light.color);
        switch (light.type) {
          case 'ambient':
            lightObj = new THREE.AmbientLight(color, light.intensity);
            break;
          case 'directional':
            lightObj = new THREE.DirectionalLight(color, light.intensity);
            if (light.position) lightObj.position.set(...light.position);
            break;
        }
        if (lightObj) {
          this.scene.add(lightObj);
        }
      });
    }
  }

  
  animate() {
    // NO crear un bucle propio aquí - el bucle principal está en main.js
    // Este método solo renderiza cuando se llama
    this.controls.update();
    
    // Si el viewModel tiene visualización en tiempo real, se actualiza desde allí
    // Este método solo se encarga del renderizado
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Activa o desactiva el modo de edición manual
   */
  setEditMode(enabled) {
    this.editMode = enabled;
    
    if (enabled) {
      // Crear controles de transformación si no existen
      if (!this.transformControls) {
        this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
        
        // Configurar el modo de transformación (translate, rotate, scale)
        this.transformControls.setMode('translate'); // Por defecto traslación
        
        // Deshabilitar OrbitControls cuando se está usando TransformControls
        this.transformControls.addEventListener('dragging-changed', (event) => {
          this.controls.enabled = !event.value;
        });
        
        // Actualizar ROI en tiempo real cuando se mueve un sensor
        this.transformControls.addEventListener('change', () => {
          if (this.currentEditTarget && this.currentEditTarget.startsWith('sensor_')) {
            // Actualizar currentPose del sensor con la nueva posición/rotación del mesh
            const sensorId = this.currentEditTarget.replace('sensor_', '');
            const sensor = this.viewModel.sensors.find(s => s.id === sensorId);
            if (sensor && sensor.mesh && this.transformControls.object === sensor.mesh) {
              // Actualizar currentPose del sensor
              sensor.currentPose.position.copy(sensor.mesh.position);
              sensor.currentPose.rotation.copy(sensor.mesh.rotation);
              
              // Actualizar visualización del ROI inmediatamente
              if (this.viewModel && this.viewModel.sensors) {
                this.updateAOIVisualizations(this.viewModel.sensors);
              }
            }
          }
        });
        
        // En Three.js r169+, TransformControls ya no es Object3D, necesitamos usar getHelper()
        const helper = this.transformControls.getHelper();
        this.scene.add(helper);
      }
      
      // Seleccionar el objeto actual si hay uno
      this.selectEditTarget(this.currentEditTarget || 'object');
    } else {
      // Desactivar controles
      if (this.transformControls) {
        this.transformControls.detach();
        this.currentEditTarget = null;
      }
    }
  }

  /**
   * Selecciona el objeto o sensor a editar
   */
  selectEditTarget(target) {
    if (!this.editMode || !this.transformControls) return;
    
    this.currentEditTarget = target;
    let mesh = null;
    
    if (target === 'object' && this.viewModel.object?.mesh) {
      mesh = this.viewModel.object.mesh;
    } else if (target.startsWith('sensor_')) {
      const sensorId = target.replace('sensor_', '');
      const sensor = this.viewModel.sensors.find(s => s.id === sensorId);
      if (sensor?.mesh) {
        mesh = sensor.mesh;
      }
    }
    
    if (mesh) {
      // Asegurar que el mesh tenga renderOrder correcto para que los controles se vean
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach(mat => {
          if (mat && mat.transparent) {
            mesh.renderOrder = -1;
          }
        });
      }
      
      // Detach primero si hay algo adjunto
      if (this.transformControls.object) {
        this.transformControls.detach();
      }
      
      // Attach al nuevo mesh
      this.transformControls.attach(mesh);
      
      // Asegurar que los controles estén visibles
      this.transformControls.visible = true;
    } else {
      if (this.transformControls.object) {
        this.transformControls.detach();
      }
    }
  }

  /**
   * Obtiene la pose actual del objeto o sensor seleccionado
   */
  getCurrentPose(target) {
    let mesh = null;
    
    if (target === 'object' && this.viewModel.object?.mesh) {
      mesh = this.viewModel.object.mesh;
    } else if (target.startsWith('sensor_')) {
      const sensorId = target.replace('sensor_', '');
      const sensor = this.viewModel.sensors.find(s => s.id === sensorId);
      if (sensor?.mesh) {
        mesh = sensor.mesh;
      }
    }
    
    if (!mesh) return null;
    
    // Convertir rotación de radianes a grados
    return {
      position: [
        mesh.position.x,
        mesh.position.y,
        mesh.position.z
      ],
      rotation: [
        THREE.MathUtils.radToDeg(mesh.rotation.x),
        THREE.MathUtils.radToDeg(mesh.rotation.y),
        THREE.MathUtils.radToDeg(mesh.rotation.z)
      ]
    };
  }

  onWindowResize() {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }
}