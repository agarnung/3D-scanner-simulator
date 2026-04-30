import * as THREE from 'three';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';

export default class ModelLoader {
  constructor() {
    this.loaders = {
      gltf: new GLTFLoader(),
      stl: new STLLoader(),
      obj: new OBJLoader(),
      ply: new PLYLoader()
    };
  }

  loadModel(path, fileExtension = null, scale = 1.0) {
    return new Promise((resolve, reject) => {
      // Si se proporciona la extensión explícitamente (útil para URLs blob), usarla
      // Si no, intentar extraerla de la ruta
      let extension;
      if (fileExtension) {
        extension = fileExtension.toLowerCase().replace('.', '');
      } else {
        // Extraer la extensión ignorando query parameters (ej: /model.glb?t=123 -> glb)
        const pathWithoutQuery = path.split('?')[0]; // Eliminar query string
        extension = pathWithoutQuery.split('.').pop().toLowerCase();
      }
      
      // Función auxiliar para aplicar escala a un objeto 3D
      const applyScale = (object) => {
        if (scale !== 1.0 && scale > 0) {
          object.scale.multiplyScalar(scale);
          // Actualizar la matriz para que el scale se aplique correctamente
          object.updateMatrixWorld(true);
        }
      };
      
      switch (extension) {
        case 'glb':
        case 'gltf':
          this.loaders.gltf.load(path, (gltf) => {
            // Extraer meshes del gltf.scene
            const meshes = [];
            gltf.scene.traverse((child) => {
              if (child.isMesh) {
                meshes.push(child);
              }
            });

            if (meshes.length === 0) {
              reject(new Error('No se encontraron meshes en el GLB/GLTF'));
              return;
            }

            const justFirstMesh = true;
            if (justFirstMesh || meshes.length === 1) {
              // Si se quiere devolver solo la primer mesh
              const mesh = meshes[0];
              applyScale(mesh);
              resolve(mesh);
            }
            // O si se quiere devolver un grupo con todas las mesh (TODO)
            else if (justFirstMesh === false) {
                const group = new THREE.Group();
                meshes.forEach(m => {
                  applyScale(m);
                  group.add(m);
                });
                resolve(group);
            }

          }, undefined, reject);
          break;

        case 'obj':
          this.loaders.obj.load(path, (group) => {
            // Aplicar escala al grupo completo
            applyScale(group);
            resolve(group);
          }, undefined, reject);
          break;
        
        case 'stl':
          this.loaders.stl.load(path, (geometry) => {
            // STLLoader devuelve una geometría, necesitamos crear un mesh
            const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
            const mesh = new THREE.Mesh(geometry, material);
            applyScale(mesh);
            resolve(mesh);
          }, undefined, reject);
          break;

        case 'ply':
          this.loaders.ply.load(path, (geometry) => {
            // PLYLoader devuelve una geometría, necesitamos crear un mesh
            geometry.computeVertexNormals();
            const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
            const mesh = new THREE.Mesh(geometry, material);
            applyScale(mesh);
            resolve(mesh);
          }, undefined, reject);
          break;
        
        default:
          reject(new Error(`Formato no soportado: ${extension}`));
      }
    });
  }
}