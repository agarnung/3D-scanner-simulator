import SimulationViewModel from '../app/viewmodel/SimulationViewModel.js';
import ThreeView from '../app/view/ThreeView.js';
import ConfigValidationService from '../app/services/ConfigValidationService.js';

import jsyaml from 'js-yaml';

const INTERSECTION_METHODS = {
    edge: {
        label: 'Edge',
        description: 'Interseccion plano-aristas. Rapido y aproximado.'
    },
    face: {
        label: 'Face',
        description: 'Interseccion plano-caras. Mas denso y detallado.'
    },
    raycasting: {
        label: 'Raycasting',
        description: 'Rayos por muestra. Mejor oclusion/superficie visible.'
    }
};

async function loadIntersectionServiceByMethod(method) {
    if (method === 'face') {
        const { default: service } = await import('../app/services/FacePlaneIntersectionService.js');
        return service;
    }

    if (method === 'raycasting') {
        const { default: service } = await import('../app/services/RaycastingIntersectionService.js');
        return service;
    }

    const { default: service } = await import('../app/services/EdgePlaneIntersectionService.js');
    return service;
}

// Funciones de popup de carga (deben estar antes de initializeApp)
let loadingShown = false;
let popup = null; // Se inicializará después de que el DOM esté listo

function showLoadingPopup() {
  if (!popup) {
    popup = document.getElementById('loadingPopup');
  }
  if (popup && !loadingShown) {
    loadingShown = true;
    popup.classList.add('active');
  }
}

function hideLoadingPopup() {
  if (!popup) {
    popup = document.getElementById('loadingPopup');
  }
  if (popup && loadingShown) {
    loadingShown = false;
    popup.classList.remove('active');
  }
}

// Cargar configuración con cache busting para forzar recarga
async function loadConfig() {
    const timestamp = new Date().getTime();
    const response = await fetch(`/configs/simulator.yaml?t=${timestamp}`, {
        cache: 'no-store' // Forzar que no use caché
    });
    
    if (!response.ok) {
        throw new Error(`Error al cargar configuración: ${response.status} ${response.statusText}`);
    }
    
    const yamlText = await response.text();
    return jsyaml.load(yamlText);
}

async function saveIntersectionMethodToYAML(method) {
    const currentConfig = await loadConfig();
    currentConfig.simulation = currentConfig.simulation || {};
    currentConfig.simulation.intersectionMethod = method;

    const response = await fetch('/api/save-config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(currentConfig)
    });

    if (!response.ok) {
        throw new Error(`Error al guardar método de intersección: ${response.statusText}`);
    }
}

async function saveVisibilityPrefilterToYAML(enabled) {
    const currentConfig = await loadConfig();
    currentConfig.simulation = currentConfig.simulation || {};
    currentConfig.simulation.visibilityPrefilterEnabled = !!enabled;

    const response = await fetch('/api/save-config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(currentConfig)
    });

    if (!response.ok) {
        throw new Error(`Error al guardar prefiltro de visibilidad: ${response.statusText}`);
    }
}

async function saveRendererBackendToYAML(backend) {
    const currentConfig = await loadConfig();
    currentConfig.simulation = currentConfig.simulation || {};
    currentConfig.simulation.rendererBackend = backend;

    const response = await fetch('/api/save-config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(currentConfig)
    });

    if (!response.ok) {
        throw new Error(`Error al guardar backend de render: ${response.statusText}`);
    }
}

async function saveAcquisitionNoiseToYAML(acquisitionNoise) {
    const currentConfig = await loadConfig();
    currentConfig.simulation = currentConfig.simulation || {};
    currentConfig.simulation.acquisitionNoise = acquisitionNoise;

    const response = await fetch('/api/save-config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(currentConfig)
    });

    if (!response.ok) {
        throw new Error(`Error al guardar ruido de adquisición: ${response.statusText}`);
    }
}

function metersToMicrometers(valueMeters) {
    return Math.round((Number(valueMeters) || 0) * 1e6);
}

function micrometersToMeters(valueMicrometers) {
    return Math.max(0, Number(valueMicrometers) || 0) / 1e6;
}

function getStdDevYFromNoiseConfig(acquisitionNoise) {
    if (!acquisitionNoise?.stdDev) return 0;
    if (typeof acquisitionNoise.stdDev === 'number') {
        return acquisitionNoise.stdDev;
    }
    return Number(acquisitionNoise.stdDev.y) || 0;
}

function buildAcquisitionNoiseFromUI(enabled, stdDevMicrometers) {
    return {
        enabled: !!enabled,
        type: 'gaussian',
        stdDev: micrometersToMeters(stdDevMicrometers)
    };
}

function applyAcquisitionNoiseToViewModel(viewModel, acquisitionNoise) {
    if (!viewModel) return;
    viewModel.setAcquisitionNoise(acquisitionNoise);
}

function syncAcquisitionNoiseUIFromConfig(currentConfig, viewModel) {
    const enabledToggle = document.getElementById('acquisition-noise-enabled');
    const stdDevInput = document.getElementById('acquisition-noise-stddev');
    if (!enabledToggle || !stdDevInput) return;

    const acquisitionNoise = currentConfig?.simulation?.acquisitionNoise || {
        enabled: false,
        type: 'gaussian',
        stdDev: 0
    };

    enabledToggle.checked = !!acquisitionNoise.enabled;
    stdDevInput.value = metersToMicrometers(getStdDevYFromNoiseConfig(acquisitionNoise));
    stdDevInput.disabled = !acquisitionNoise.enabled;
    applyAcquisitionNoiseToViewModel(viewModel, acquisitionNoise);
}

function applyVisibilityPrefilterSettingToService(serviceClass, enabled) {
    if (!serviceClass) return;
    if (Object.prototype.hasOwnProperty.call(serviceClass, 'enableVisibilityPrefilter')) {
        serviceClass.enableVisibilityPrefilter = !!enabled;
    }
}

// Cargar lista de modelos disponibles dinámicamente desde el servidor
async function loadAvailableModels() {
    try {
        const response = await fetch('/api/models', {
            cache: 'no-store'
        });
        if (!response.ok) {
            throw new Error(`Error al cargar modelos: ${response.statusText}`);
        }
        const data = await response.json();
        return data.models || data || [];
    } catch (error) {
        console.error('Error cargando lista de modelos:', error);
        return [];
    }
}

// Poblar el selector de modelos con los modelos disponibles
async function populateModelSelector() {
    const modelSelector = document.getElementById('model-selector');
    if (!modelSelector) {
        console.warn('Selector de modelos no encontrado');
        return;
    }

    // Limpiar opciones existentes (excepto la primera)
    modelSelector.innerHTML = '<option value="">Seleccionar modelo</option>';

    try {
        const models = await loadAvailableModels();
        
        if (models.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No hay modelos disponibles';
            option.disabled = true;
            modelSelector.appendChild(option);
            console.warn('No se encontraron modelos en /public/models/');
            return;
        }

        // Agregar cada modelo como opción
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.name;
            option.textContent = model.name.replace(/\.[^/.]+$/, ''); // Nombre sin extensión
            modelSelector.appendChild(option);
        });

        console.log(`${models.length} modelos disponibles cargados`);
    } catch (error) {
        console.error('Error poblando selector de modelos:', error);
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Error cargando modelos';
        option.disabled = true;
        modelSelector.appendChild(option);
    }
}

// Cargar configuración y servicio de intersección
async function initializeApp() {
  const config = await loadConfig();

  // Validar configuración
  const validation = ConfigValidationService.validateConfig(config);
  if (!validation.valid) {
    console.error('Errores en la configuración:');
    validation.errors.forEach(error => console.error(`  - ${error}`));
    alert(`Errores en la configuración:\n${validation.errors.join('\n')}`);
  }
  if (validation.warnings.length > 0) {
    console.warn('Advertencias en la configuración:');
    validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
  }

  const requestedMethod = config.simulation?.intersectionMethod || 'edge';
  const selectedMethod = INTERSECTION_METHODS[requestedMethod] ? requestedMethod : 'edge';
  if (requestedMethod !== selectedMethod) {
    console.warn(`Metodo de interseccion no soportado: ${requestedMethod}. Se usa "${selectedMethod}"`);
  }
  const IntersectionService = await loadIntersectionServiceByMethod(selectedMethod);
  config.simulation = config.simulation || {};
  config.simulation.intersectionMethod = selectedMethod;

  const appContainer = document.getElementById('app');
  const requestedRendererBackend = config.simulation?.rendererBackend || 'auto';
  const viewModel = new SimulationViewModel({
      pointsPerProfile: config.sensors?.[0]?.pointsPerProfile || 1024,
      onShowLoadingPopup: showLoadingPopup,
      onHideLoadingPopup: hideLoadingPopup,
      config: config,
      intersectionService: IntersectionService
  });
  const view = await ThreeView.create(appContainer, viewModel, {
      rendererBackend: requestedRendererBackend
  });
  viewModel.setView(view);
  
  return { config, viewModel, view };
}

// Variables globales
let config, viewModel, view;

// Inicializar la aplicación cuando el DOM esté listo
async function init() {
  try {
    console.log('Inicializando aplicación...');
    
    // Esperar a que el DOM esté listo
    if (document.readyState === 'loading') {
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve);
      });
    }
    
    // Inicializar la aplicación
    const result = await initializeApp();
    config = result.config;
    viewModel = result.viewModel;
    view = result.view;
    
    console.log('Aplicación inicializada correctamente');
    
    // Cargar lista de modelos disponibles y poblar el selector
    await populateModelSelector();
    
    // Cargar modelos iniciales
    await loadDefaultModels(config, viewModel);
    
    // Configurar event listeners
    setupEventListeners();
    
    // Iniciar bucle de actualización
    let statsInstance = null;
    function updateLoop() {
      if (!statsInstance) {
        statsInstance = new Stats();
        statsInstance.showPanel(0);
        statsInstance.dom.style.position = 'fixed';
        statsInstance.dom.style.right = 'auto';    
        statsInstance.dom.style.top = 'auto';   
        statsInstance.dom.style.left = '5px';   
        statsInstance.dom.style.bottom = '5px';  
        statsInstance.dom.classList.add('stats');
        document.body.appendChild(statsInstance.dom);
      }
      statsInstance.begin();
      view.animate();
      statsInstance.end();
      requestAnimationFrame(updateLoop);
    }
    updateLoop();
    
  } catch (error) {
    console.error('Error inicializando aplicación:', error);
    alert('Error al inicializar la aplicación. Revisa la consola para más detalles.');
  }
}

// Iniciar cuando el script se carga
init();

// Cargar modelos por defecto
async function loadDefaultModels(currentConfig, currentViewModel) {
    try {
        console.log('Cargando configuración y modelos desde YAML...');
        
        // Recargar configuración para asegurar que es la más reciente
        const freshConfig = await loadConfig();
        
        // Actualizar config en viewModel
        currentViewModel.config = freshConfig;
        
        // Recargar servicio de intersección si cambió el método
        const requestedMethod = freshConfig.simulation?.intersectionMethod || 'edge';
        const selectedMethod = INTERSECTION_METHODS[requestedMethod] ? requestedMethod : 'edge';
        const IntersectionService = await loadIntersectionServiceByMethod(selectedMethod);
        freshConfig.simulation = freshConfig.simulation || {};
        freshConfig.simulation.intersectionMethod = selectedMethod;
        currentViewModel.intersectionService = IntersectionService;
        
        // Cargar objeto (elimina el anterior si existe)
        // Solo cargar si existe y no mostrar error si falla (carga silenciosa al inicio)
        if (freshConfig.models?.object) {
            currentViewModel.removeCurrentObject();
            // Agregar timestamp para evitar caché
            const modelUrl = freshConfig.models.object;
            const separator = modelUrl.includes('?') ? '&' : '?';
            const urlWithCacheBust = `${modelUrl}${separator}t=${new Date().getTime()}`;
            // showErrorAlert = false para no mostrar alert al cargar desde YAML al inicio
            await currentViewModel.loadObject(urlWithCacheBust, null, false);
        }
        
        // Cargar sensores (elimina los anteriores)
        if (freshConfig.sensors && freshConfig.sensors.length > 0) {
            await currentViewModel.loadSensors(freshConfig.sensors);
            // Actualizar selector de edición si existe
            if (window.updateEditTargetSelector) {
                window.updateEditTargetSelector();
            }
        } else {
            console.warn('No hay sensores configurados en el YAML');
        }
        
        // Actualizar parámetros de simulación
        if (freshConfig.simulation) {
            currentViewModel.totalProfiles = freshConfig.simulation.defaultProfiles || 4096;
            currentViewModel.offsetZ = freshConfig.simulation.offsetZ || 0.001;
        }
        
        console.log('Modelos cargados correctamente');
        return freshConfig;
    } catch (error) {
        console.error('Error cargando modelos:', error);
        return currentConfig;
    }
}

// Función para recargar la configuración y los modelos
async function reloadConfiguration() {
    console.log('Recargando configuración...');
    try {
        // Detener cualquier escaneo o visualización en curso
        if (viewModel.isRotating) {
            viewModel.stopScanCommand.execute();
        }
        if (viewModel.realTimeVisualization) {
            viewModel.stopRealTimeVisualization();
        }
        
        // Limpiar perfiles
        viewModel.clearProfiles();
        
        // Recargar lista de modelos disponibles
        await populateModelSelector();
        
        // Recargar modelos (actualiza config también)
        const freshConfig = await loadDefaultModels(config, viewModel);
        if (freshConfig) {
            // Actualizar referencia global de config
            Object.assign(config, freshConfig);
            syncAcquisitionNoiseUIFromConfig(config, viewModel);
        }
        
        console.log('Configuración recargada correctamente');
        if (window.updateUI) {
            window.updateUI.scanStatus('Configuración recargada');
        }
    } catch (error) {
        console.error('Error al recargar configuración:', error);
        alert('Error al recargar la configuración. Revisa la consola para más detalles.');
    }
}

// Función para configurar todos los event listeners
function setupEventListeners() {
    // Elementos de la interfaz
    const startButton = document.getElementById('start-scan');
    const stopButton = document.getElementById('stop-scan');
    const resetButton = document.getElementById('reset-scan');
    const scanStatus = document.getElementById('scan-status');
    const profileCountDisplay = document.getElementById('profile-count-display');
    const pointCountDisplay = document.getElementById('point-count-display');
    const saveScanButton = document.getElementById('save-scan');
    const scanNameInput = document.getElementById('scan-name');
    const reloadConfigButton = document.getElementById('reload-config');
    const modelSelector = document.getElementById('model-selector');
    const modelUploadInput = document.getElementById('model-upload');
    const uploadModelBtn = document.getElementById('upload-model-btn');
    const visualizationRadio = document.querySelectorAll('input[name="viewmode"]');
    const startRealtimeBtn = document.getElementById('start-realtime');
    const stopRealtimeBtn = document.getElementById('stop-realtime');
    const realtimeSpeedInput = document.getElementById('realtime-speed');
    const realtimeSpeedDisplay = document.getElementById('realtime-speed-display');
    const sensorPrevBtn = document.getElementById('sensor-prev');
    const sensorNextBtn = document.getElementById('sensor-next');
    const editModeToggle = document.getElementById('edit-mode-toggle');
    const editControls = document.getElementById('edit-controls');
    const editButtons = document.getElementById('edit-buttons');
    const editTargetSelect = document.getElementById('edit-target');
    const saveInitialPoseBtn = document.getElementById('save-initial-pose');
    const transformModeControls = document.getElementById('transform-mode-controls');
    const transformModeRadios = document.querySelectorAll('input[name="transform-mode"]');
    const transformScaleRadio = document.getElementById('transform-scale');
    const surfaceOnlyModeCheckbox = document.getElementById('surface-only-mode');
    const rendererBackendSelect = document.getElementById('renderer-backend-selector');
    const rendererBackendActiveBadge = document.getElementById('renderer-backend-active');
    const visibilityPrefilterToggle = document.getElementById('visibility-prefilter-toggle');
    const acquisitionNoiseEnabledToggle = document.getElementById('acquisition-noise-enabled');
    const acquisitionNoiseStdDevInput = document.getElementById('acquisition-noise-stddev');
    const intersectionMethodSelect = document.getElementById('intersection-method-selector');

    const updateRendererBackendBadge = (activeBackend, pending = false) => {
        if (!rendererBackendActiveBadge) return;
        const normalized = activeBackend === 'webgpu' ? 'WebGPU' : 'WebGL';
        rendererBackendActiveBadge.textContent = pending
            ? `Backend activo: ${normalized} (cambio pendiente de recarga)`
            : `Backend activo: ${normalized}`;
    };

    if (view?.rendererBackend) {
        updateRendererBackendBadge(view.rendererBackend);
    }

    // Cargar valores por defecto desde la configuración
    if (config.simulation && viewModel) {
        viewModel.totalProfiles = config.simulation.defaultProfiles || 4096;
        viewModel.offsetZ = config.simulation.offsetZ || 0.001;
    }

    const loadModelByName = async (modelName) => {
        if (!modelName) return;

        // Agregar timestamp para evitar caché
        const timestamp = new Date().getTime();
        const modelPath = `/models/${modelName}?t=${timestamp}`;

        // Extraer el nombre base del archivo (sin extensión) y actualizar el campo de nombre del escaneo
        const baseName = modelName.replace(/\.[^/.]+$/, '');
        if (scanNameInput && baseName) {
            scanNameInput.value = baseName;
        }

        let loadingShown = false;
        const loadingTimeout = setTimeout(() => {
            showLoadingPopup();
            loadingShown = true;
        }, 100);

        try {
            viewModel.removeCurrentObject();
            await viewModel.loadObject(modelPath);
        } finally {
            clearTimeout(loadingTimeout);
            if (loadingShown) hideLoadingPopup();
        }
    };

    // Controles de la interfaz
    startButton.addEventListener('click', async () => {
  if (viewModel.finishedScan) {
    console.warn('El escaneo ya ha finalizado. Reinicia para empezar de nuevo.');
    return;
  }

  // Obtener número de perfiles desde la configuración YAML
  const profileCount = viewModel.totalProfiles || config.simulation?.defaultProfiles || 4096;

  // Los movimientos se toman de la configuración YAML
  // Si no hay movimientos configurados, crear un movimiento de rotación por defecto
  if (!viewModel.objectMovements || viewModel.objectMovements.length === 0) {
    const defaultRotation = config.simulation?.defaultRotationDeg || 360;
    viewModel.objectMovements = [{
      type: 'rotation',
      axis: 'x',
      value: defaultRotation,
      duration: profileCount,
      startProfile: 0
    }];
  }

  // Asignar el número de perfiles al ViewModel
  viewModel.totalProfiles = profileCount;
  
  console.log('Iniciando escaneo con', profileCount, 'perfiles');

  updateScanStatus('Escaneando...');
  startButton.disabled = true;

  viewModel.startScanCommand.execute();

  startButton.disabled = false;
});

stopButton.addEventListener('click', () => {
    viewModel.stopScanCommand.execute();
    updateScanStatus('Detenido');
});

resetButton.addEventListener('click', () => {
    viewModel.resetScanCommand.execute();
    updateScanStatus('Reiniciado');
    updateProfileCountDisplay(0);
    updatePointCountDisplay(0);
});

saveScanButton.addEventListener('click', async () => {
  const scanName = scanNameInput.value.trim();

  // Obtener offsetZ desde la configuración YAML
  const offsetZ = viewModel.offsetZ || config.simulation?.offsetZ || 0.001;

  if (!scanName) {
    alert('Introduce un nombre para el escaneo');
    return;
  }

  saveScanButton.disabled = true;
  saveScanButton.textContent = 'Exportando...';
  
  try {
    await viewModel.exportScanResults(scanName, offsetZ);
    saveScanButton.textContent = 'Guardar Escaneo';
  } catch (error) {
    console.error('Error al exportar:', error);
    alert('Error al exportar el escaneo. Revisa la consola para más detalles.');
    saveScanButton.textContent = 'Guardar Escaneo';
  } finally {
    saveScanButton.disabled = false;
  }
});

modelSelector.addEventListener('change', async (e) => {
    const modelName = e.target.value;
    if (!modelName) return;
    try {
        await loadModelByName(modelName);
    } catch (err) {
        console.error('Error cargando modelo:', err);
        alert('Hubo un error al cargar el modelo.');
    }
});

// Botón de carga de modelo
uploadModelBtn.addEventListener('click', () => {
    modelUploadInput.click();
});

modelUploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validar extensión del archivo
    const validExtensions = ['.glb', '.gltf', '.obj', '.stl', '.ply'];
    const fileExtensionWithDot = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!validExtensions.includes(fileExtensionWithDot)) {
        alert('Formato de archivo no soportado. Por favor, selecciona un archivo .glb, .gltf, .obj, .stl o .ply');
        e.target.value = ''; // Limpiar el input
        return;
    }

    // Crear URL del objeto para cargarlo
    const objectURL = URL.createObjectURL(file);
    
    // Obtener la extensión del archivo (sin el punto para pasarla al loader)
    const fileExtension = file.name.split('.').pop().toLowerCase();

    let loadingShown = false;

    // Mostrar el popup solo si la carga tarda más de 100ms
    const loadingTimeout = setTimeout(() => {
        showLoadingPopup();
        loadingShown = true;
    }, 100);

    try {
        // Extraer el nombre base del archivo (sin extensión) y actualizar el campo de nombre del escaneo
        const baseName = file.name.replace(/\.[^/.]+$/, ''); // Eliminar extensión
        if (scanNameInput && baseName) {
            scanNameInput.value = baseName;
        }

        viewModel.removeCurrentObject();
        await viewModel.loadObject(objectURL, fileExtension);
        // Limpiar el selector de modelos para indicar que se está usando un modelo cargado
        modelSelector.value = '';
    } catch (err) {
        console.error('Error cargando modelo:', err);
        alert('Hubo un error al cargar el modelo.');
    } finally {
        clearTimeout(loadingTimeout);
        if (loadingShown) hideLoadingPopup();
        // Liberar la URL del objeto después de cargar
        URL.revokeObjectURL(objectURL);
        // Limpiar el input para permitir cargar el mismo archivo de nuevo
        e.target.value = '';
    }
});

visualizationRadio.forEach(el => {
    el.addEventListener('change', () => {
        if (viewModel) viewModel.setWireframeMode(el.value === 'wireframe' ? true : false);
    });
});

// Controles de visualización en tiempo real
if (startRealtimeBtn) {
    startRealtimeBtn.addEventListener('click', () => {
        if (viewModel) {
            // Asegurar que tenemos los parámetros de escaneo configurados
            if (viewModel.totalProfiles === 0) {
                // Usar valores por defecto si no están configurados
                viewModel.totalProfiles = config.simulation?.defaultProfiles || 4096;
            }
            
            viewModel.startRealTimeVisualization();
            startRealtimeBtn.disabled = true;
            if (stopRealtimeBtn) stopRealtimeBtn.disabled = false;
        }
    });
}

if (stopRealtimeBtn) {
    stopRealtimeBtn.addEventListener('click', () => {
        if (viewModel) {
            viewModel.stopRealTimeVisualization();
            if (startRealtimeBtn) startRealtimeBtn.disabled = false;
            stopRealtimeBtn.disabled = true;
        }
    });
    stopRealtimeBtn.disabled = true; // Inicialmente deshabilitado
}

if (realtimeSpeedInput && realtimeSpeedDisplay) {
    // Inicializar display
    realtimeSpeedDisplay.textContent = realtimeSpeedInput.value + 'x';
    
    realtimeSpeedInput.addEventListener('input', (e) => {
        const speed = parseFloat(e.target.value);
        realtimeSpeedDisplay.textContent = speed.toFixed(1) + 'x';
        if (viewModel) {
            viewModel.setRealTimeSpeed(speed);
        }
    });
}

    // Botón para recargar configuración
    if (reloadConfigButton) {
        reloadConfigButton.addEventListener('click', async () => {
            reloadConfigButton.disabled = true;
            reloadConfigButton.textContent = 'Recargando...';
            await reloadConfiguration();
            reloadConfigButton.disabled = false;
            reloadConfigButton.textContent = 'Recargar Configuración';
        });
    }

    // Controles de modo superficie visible
    if (surfaceOnlyModeCheckbox) {
        // Inicializar con el valor por defecto del ViewModel
        if (viewModel) {
            surfaceOnlyModeCheckbox.checked = viewModel.surfaceOnlyMode;
        }
        
        surfaceOnlyModeCheckbox.addEventListener('change', (e) => {
            if (viewModel) {
                viewModel.surfaceOnlyMode = e.target.checked;
                console.log(`Modo superficie visible: ${viewModel.surfaceOnlyMode ? 'activado' : 'desactivado (rayos X)'}`);
            }
        });
    }

    // Selector de servicio de intersección activo
    if (intersectionMethodSelect) {
        const selectedMethod = config?.simulation?.intersectionMethod || 'edge';
        intersectionMethodSelect.value = INTERSECTION_METHODS[selectedMethod] ? selectedMethod : 'edge';

        const updateIntersectionMethodTooltip = () => {
            const methodKey = intersectionMethodSelect.value;
            const methodInfo = INTERSECTION_METHODS[methodKey];
            if (methodInfo) {
                intersectionMethodSelect.title = methodInfo.description;
            }
        };
        updateIntersectionMethodTooltip();

        intersectionMethodSelect.addEventListener('change', async (e) => {
            const method = e.target.value;
            if (!INTERSECTION_METHODS[method]) {
                console.warn(`Metodo de interseccion no soportado: ${method}`);
                return;
            }

            try {
                const serviceClass = await loadIntersectionServiceByMethod(method);
                if (viewModel) {
                    viewModel.intersectionService = serviceClass;
                }
                if (visibilityPrefilterToggle) {
                    applyVisibilityPrefilterSettingToService(serviceClass, visibilityPrefilterToggle.checked);
                }

                config.simulation = config.simulation || {};
                config.simulation.intersectionMethod = method;
                updateIntersectionMethodTooltip();

                // Persistir la selección en simulator.yaml
                await saveIntersectionMethodToYAML(method);
                console.log(`Servicio de interseccion activo y guardado en YAML: ${method}`);
            } catch (error) {
                console.error('Error cambiando método de intersección:', error);
                alert('No se pudo guardar el método de intersección en simulator.yaml');
            }
        });
    }

    // Toggle de prefiltro de visibilidad (aplica a Face/Edge)
    if (visibilityPrefilterToggle) {
        const initialPrefilterEnabled = config?.simulation?.visibilityPrefilterEnabled !== false;
        visibilityPrefilterToggle.checked = initialPrefilterEnabled;
        if (viewModel?.intersectionService) {
            applyVisibilityPrefilterSettingToService(viewModel.intersectionService, initialPrefilterEnabled);
        }

        visibilityPrefilterToggle.addEventListener('change', async (e) => {
            const enabled = e.target.checked;
            if (viewModel?.intersectionService) {
                applyVisibilityPrefilterSettingToService(viewModel.intersectionService, enabled);
            }

            config.simulation = config.simulation || {};
            config.simulation.visibilityPrefilterEnabled = enabled;

            try {
                await saveVisibilityPrefilterToYAML(enabled);
                console.log(`Prefiltro de visibilidad ${enabled ? 'activado' : 'desactivado'} y guardado en YAML`);
            } catch (error) {
                console.error('Error guardando prefiltro de visibilidad:', error);
                alert('No se pudo guardar el prefiltro de visibilidad en simulator.yaml');
            }
        });
    }

    const persistAcquisitionNoise = async (acquisitionNoise) => {
        config.simulation = config.simulation || {};
        config.simulation.acquisitionNoise = acquisitionNoise;
        applyAcquisitionNoiseToViewModel(viewModel, acquisitionNoise);

        try {
            await saveAcquisitionNoiseToYAML(acquisitionNoise);
            console.log('Ruido de adquisición guardado en YAML:', acquisitionNoise);
        } catch (error) {
            console.error('Error guardando ruido de adquisición:', error);
            alert('No se pudo guardar el ruido de adquisición en simulator.yaml');
        }
    };

    if (acquisitionNoiseEnabledToggle && acquisitionNoiseStdDevInput) {
        syncAcquisitionNoiseUIFromConfig(config, viewModel);

        acquisitionNoiseEnabledToggle.addEventListener('change', async (e) => {
            const enabled = e.target.checked;
            acquisitionNoiseStdDevInput.disabled = !enabled;
            const acquisitionNoise = buildAcquisitionNoiseFromUI(enabled, acquisitionNoiseStdDevInput.value);
            await persistAcquisitionNoise(acquisitionNoise);
        });

        acquisitionNoiseStdDevInput.addEventListener('change', async (e) => {
            const acquisitionNoise = buildAcquisitionNoiseFromUI(
                acquisitionNoiseEnabledToggle.checked,
                e.target.value
            );
            await persistAcquisitionNoise(acquisitionNoise);
        });
    }

    // Selector de backend de render (requiere recarga para re-crear renderer)
    if (rendererBackendSelect) {
        const currentBackend = config?.simulation?.rendererBackend || 'auto';
        rendererBackendSelect.value = ['auto', 'webgl', 'webgpu'].includes(currentBackend)
            ? currentBackend
            : 'auto';

        rendererBackendSelect.addEventListener('change', async (e) => {
            const backend = e.target.value;
            if (!['auto', 'webgl', 'webgpu'].includes(backend)) return;

            config.simulation = config.simulation || {};
            config.simulation.rendererBackend = backend;

            try {
                await saveRendererBackendToYAML(backend);
                if (view?.rendererBackend) {
                    updateRendererBackendBadge(view.rendererBackend, true);
                }
                alert('Backend de render guardado. Recarga la página para aplicarlo.');
            } catch (error) {
                console.error('Error guardando backend de render:', error);
                alert('No se pudo guardar el backend de render en simulator.yaml');
            }
        });
    }

    // Controles de edición manual
    if (editModeToggle) {
        editModeToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            if (view && view.setEditMode) {
                view.setEditMode(enabled);
            }
            if (editControls) editControls.style.display = enabled ? 'block' : 'none';
            if (editButtons) editButtons.style.display = enabled ? 'block' : 'none';
            if (transformModeControls) transformModeControls.style.display = enabled ? 'block' : 'none';
            
            // Actualizar selector de objetos/sensores
            if (enabled && window.updateEditTargetSelector) {
                window.updateEditTargetSelector();
            }
        });
    }

    // Controles de modo de transformación (traslación/rotación)
    if (transformModeRadios) {
        transformModeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (view && view.transformControls && e.target.checked) {
                    view.transformControls.setMode(e.target.value);
                }
            });
        });
    }

    if (editTargetSelect) {
        editTargetSelect.addEventListener('change', (e) => {
            const isObjectTarget = e.target.value === 'object';
            if (transformScaleRadio) {
                transformScaleRadio.disabled = !isObjectTarget;
                if (!isObjectTarget && transformScaleRadio.checked) {
                    const translateRadio = document.getElementById('transform-translate');
                    if (translateRadio) {
                        translateRadio.checked = true;
                        if (view && view.transformControls) {
                            view.transformControls.setMode('translate');
                        }
                    }
                }
            }

            if (view && view.selectEditTarget) {
                view.selectEditTarget(e.target.value);
            }
        });
    }

    if (saveInitialPoseBtn) {
        saveInitialPoseBtn.addEventListener('click', async () => {
            if (!view || !view.currentEditTarget) {
                alert('Selecciona un objeto o sensor para editar');
                return;
            }
            
            const pose = view.getCurrentPose(view.currentEditTarget);
            if (!pose) {
                alert('No se pudo obtener la pose actual');
                return;
            }
            
            try {
                saveInitialPoseBtn.disabled = true;
                saveInitialPoseBtn.textContent = 'Guardando...';
                const selectedModelNameBeforeReload = modelSelector ? modelSelector.value : '';
                
                await saveInitialPoseToYAML(view.currentEditTarget, pose);
                
                // Recargar configuración automáticamente para aplicar los cambios
                await reloadConfiguration();

                // Restaurar automáticamente el modelo que el usuario tenía seleccionado
                // para no obligar a re-elegirlo tras guardar pose.
                if (selectedModelNameBeforeReload) {
                    const existsInSelector = Array.from(modelSelector.options).some(
                        option => option.value === selectedModelNameBeforeReload
                    );
                    if (existsInSelector) {
                        modelSelector.value = selectedModelNameBeforeReload;
                        await loadModelByName(selectedModelNameBeforeReload);
                    }
                }
                
                alert('Pose inicial guardada y aplicada correctamente');
                saveInitialPoseBtn.textContent = 'Guardar Pose Inicial';
            } catch (error) {
                console.error('Error guardando pose inicial:', error);
                alert('Error al guardar la pose inicial. Revisa la consola para más detalles.');
                saveInitialPoseBtn.textContent = 'Guardar Pose Inicial';
            } finally {
                saveInitialPoseBtn.disabled = false;
            }
        });
    }

    // Función para actualizar el selector de objetos/sensores (hacerla accesible globalmente)
    window.updateEditTargetSelector = function() {
        if (!editTargetSelect) return;
        
        // Limpiar opciones excepto "Objeto"
        editTargetSelect.innerHTML = '<option value="object">Objeto</option>';
        
        // Agregar sensores
        if (viewModel && viewModel.sensors) {
            viewModel.sensors.forEach(sensor => {
                const option = document.createElement('option');
                option.value = `sensor_${sensor.id}`;
                option.textContent = `Sensor: ${sensor.id}`;
                editTargetSelect.appendChild(option);
            });
        }
    };

    // Función para guardar la pose inicial en el YAML
    async function saveInitialPoseToYAML(target, pose) {
        // Cargar configuración actual
        const currentConfig = await loadConfig();
        
        // Actualizar la pose según el target
        if (target === 'object') {
            if (!currentConfig.object) {
                currentConfig.object = {};
            }
            const normalizedScale = Array.isArray(pose.scale) && pose.scale.length === 3
                ? pose.scale
                : [1, 1, 1];

            currentConfig.object.initialPose = {
                position: pose.position,
                rotation: pose.rotation,
                scale: normalizedScale
            };
        } else if (target.startsWith('sensor_')) {
            const sensorId = target.replace('sensor_', '');
            if (!currentConfig.sensors) {
                currentConfig.sensors = [];
            }
            const sensor = currentConfig.sensors.find(s => s.id === sensorId);
            if (sensor) {
                // Para sensores, persistimos pose (posición/rotación); el escalado se reserva al objeto.
                sensor.pose = {
                    position: pose.position,
                    rotation: pose.rotation
                };
            } else {
                console.warn(`Sensor ${sensorId} no encontrado en la configuración`);
            }
        }
        
        // Enviar al servidor para guardar
        const response = await fetch('/api/save-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(currentConfig)
        });
        
        if (!response.ok) {
            throw new Error(`Error al guardar configuración: ${response.statusText}`);
        }
    }

    // Funciones para actualizar la interfaz
    function updateScanStatus(status) {
        scanStatus.textContent = status;
        scanStatus.style.color = (status === 'Escaneando...' || status === 'Completado') ? '#2ecc71' : '#e74c3c';
    }

    function updateProfileCountDisplay(count) {
        profileCountDisplay.textContent = `Perfiles: ${count}`;
    }

    function updatePointCountDisplay(count) {
        pointCountDisplay.textContent = `Puntos totales: ${count}`;
    }

    // Exponer funciones para que el viewModel pueda actualizar la interfaz
    window.updateUI = {
        scanStatus: updateScanStatus,
        profileCountDisplay: updateProfileCountDisplay,
        pointCountDisplay: updatePointCountDisplay
    };

    // Manejar redimensionamiento
    window.addEventListener('resize', () => view.onWindowResize());

    // Controles de selección de sensor para visualización 1D
    if (sensorPrevBtn) {
        sensorPrevBtn.addEventListener('click', () => {
            if (viewModel) {
                viewModel.selectPreviousSensor();
            }
        });
    }

    if (sensorNextBtn) {
        sensorNextBtn.addEventListener('click', () => {
            if (viewModel) {
                viewModel.selectNextSensor();
            }
        });
    }

    // Actualizar el número del sensor inicial
    if (viewModel) {
        viewModel.updateSensorDisplay();
    }
}
