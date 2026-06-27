# Reconstrucción 3D de Nubes de Puntos: Teoría y Matemáticas

## Índice

1. [Introducción](#introducción)
2. [Sistema de Coordenadas](#sistema-de-coordenadas)
3. [Proceso de Captura](#proceso-de-captura)
4. [Transformaciones Durante la Captura](#transformaciones-durante-la-captura)
5. [Proceso de Reconstrucción](#proceso-de-reconstrucción)
6. [Matemáticas de las Transformaciones](#matemáticas-de-las-transformaciones)
7. [Algoritmo Completo de Reconstrucción](#algoritmo-completo-de-reconstrucción)
8. [Manejo de Múltiples Sensores](#manejo-de-múltiples-sensores)
9. [Ejemplo Numérico](#ejemplo-numérico)

---

## Introducción

La reconstrucción 3D de nubes de puntos es el proceso inverso a la captura: dado un conjunto de puntos medidos en coordenadas del mundo después de aplicar todas las transformaciones (rotaciones y traslaciones) del objeto y los sensores, debemos recuperar las posiciones originales de estos puntos en el espacio 3D.

Este documento explica en detalle el flujo matemático completo, desde la captura hasta la reconstrucción, incluyendo todas las transformaciones y sus inversas.

---

## Sistema de Coordenadas

### Coordenadas Locales del Sensor

Cada sensor tiene su propio sistema de coordenadas locales:
- **Origen**: Posición del sensor en el espacio
- **Ejes**: 
  - **X**: Horizontal en el plano del láser
  - **Y**: Vertical en el plano del láser
  - **Z**: Perpendicular al plano del láser (profundidad)

El plano láser está definido en **Z = 0** en coordenadas locales del sensor.

### Coordenadas del Mundo

Sistema de coordenadas global donde:
- Todos los objetos y sensores están posicionados
- Las transformaciones (rotaciones y traslaciones) se aplican
- Los puntos de intersección se calculan inicialmente

### Transformación entre Sistemas

Un punto **P_local** en coordenadas locales del sensor se transforma a coordenadas del mundo **P_world** mediante:

```
P_world = R_sensor · P_local + T_sensor
```

Donde:
- **R_sensor**: Matriz de rotación del sensor (3×3)
- **T_sensor**: Vector de traslación del sensor (3×1)

---

## Proceso de Captura

### 1. Configuración Inicial

Al inicio del escaneo, tenemos:

- **Pose inicial del objeto**: `O_initial = {P_obj_init, R_obj_init}`
  - `P_obj_init`: Posición inicial (Vector3)
  - `R_obj_init`: Rotación inicial (Euler angles)

- **Pose inicial de cada sensor**: `S_i_initial = {P_sensor_i_init, R_sensor_i_init}`
  - `P_sensor_i_init`: Posición inicial del sensor i
  - `R_sensor_i_init`: Rotación inicial del sensor i

### 2. Movimientos Configurados

Durante el escaneo, tanto el objeto como los sensores pueden tener movimientos:

**Movimientos del objeto**:
```
M_obj = [
  {type: 'rotation', axis: 'x', value: θ_x, startProfile: p_start, duration: d},
  {type: 'translation', axis: 'y', value: Δy, startProfile: p_start, duration: d},
  ...
]
```

**Movimientos de cada sensor**:
```
M_sensor_i = [
  {type: 'rotation', axis: 'z', value: φ_z, startProfile: p_start, duration: d},
  ...
]
```

### 3. Cálculo de Poses en Cada Perfil

Para cada perfil de índice `i` (donde `i ∈ [0, totalProfiles-1]`):

#### 3.1. Pose del Objeto en el Perfil i

La pose del objeto se calcula aplicando todos los movimientos acumulados hasta el perfil `i`:

```
O_i = calculatePoseAtProfile(O_initial, M_obj, i, totalProfiles)
```

**Algoritmo**:
1. Inicializar: `O_i = O_initial`
2. Para cada movimiento `m ∈ M_obj`:
   - Si `i` está dentro del rango del movimiento `[p_start, p_start + duration)`:
     - Calcular progreso: `progress = (i - p_start) / duration`
     - Aplicar movimiento parcial: `applyMovement(O_i, m, m.value * progress)`
   - Si `i >= p_start + duration`:
     - Aplicar movimiento completo: `applyMovement(O_i, m, m.value)`

**Resultado**: `O_i = {P_obj_i, R_obj_i}`

#### 3.2. Pose de Cada Sensor en el Perfil i

Similar al objeto, para cada sensor `j`:

```
S_j_i = calculatePoseAtProfile(S_j_initial, M_sensor_j, i, totalProfiles)
```

**Resultado**: `S_j_i = {P_sensor_j_i, R_sensor_j_i}`

### 4. Aplicación de Transformaciones al Objeto

El objeto se transforma en la escena 3D:

```
mesh.position = P_obj_i
mesh.rotation = R_obj_i
mesh.updateMatrixWorld()
```

Esto actualiza la matriz de transformación del objeto: `M_obj_i` (matriz 4×4).

### 5. Cálculo de Intersecciones

Para cada sensor `j` en el perfil `i`:

#### 5.1. Plano Láser en Coordenadas del Mundo

El plano láser del sensor está definido en coordenadas locales como `Z = 0`. En coordenadas del mundo:

**Normal del plano** (en coordenadas del mundo):
```
n_world = R_sensor_j_i · [0, 0, 1]^T
```

**Punto del plano** (origen del sensor en coordenadas del mundo):
```
P_plane = P_sensor_j_i
```

**Ecuación del plano**:
```
n_world · (P - P_plane) = 0
```

#### 5.2. Intersección con la Geometría del Objeto

Para cada triángulo de la malla del objeto:

1. **Vértices en coordenadas del mundo**:
   ```
   v1_world = M_obj_i · v1_local
   v2_world = M_obj_i · v2_local
   v3_world = M_obj_i · v3_local
   ```

2. **Verificar intersección con el plano láser**:
   - Calcular distancias: `d1 = n_world · (v1_world - P_plane)`, etc.
   - Si los signos de `d1, d2, d3` no son todos iguales → hay intersección

3. **Calcular punto de intersección**:
   ```
   P_intersection = línea_intersect_plano(v1_world, v2_world, v3_world, plano_láser)
   ```

4. **Transformar a coordenadas locales del sensor** (para verificar ROI):
   ```
   P_local = transformToSensorLocal(P_intersection, S_j_i)
   ```

5. **Verificar si está dentro del ROI** (Region of Interest):
   - Verificar si `P_local` está dentro del trapecio definido por el ROI
   - Si está dentro → agregar a perfil

#### 5.3. Almacenamiento de Puntos

Los puntos se almacenan **en coordenadas del mundo**:

```
profile[i][j] = P_intersection_world
```

Opcionalmente, si `simulation.acquisitionNoise.enabled` (o `sensors[].noise`) está activo, cada punto pasa por `SensorNoiseService` antes del almacenamiento:

```
P_noisy_local = P_local + ε,   ε ~ N(0, σ²) por eje
P_noisy_world = transformToWorld(P_noisy_local, sensor)
profile[i][j] = P_noisy_world
```

Donde:
- `i`: Índice del perfil del escaneo
- `j`: Índice del punto dentro del perfil

**Importante**: Los puntos almacenados están en coordenadas del mundo después de aplicar:
1. ✅ Transformación del objeto (rotación/traslación)
2. ✅ Transformación del sensor (rotación/traslación)

---

## Transformaciones Durante la Captura

### Cadena de Transformaciones

Cuando se captura un punto, la siguiente cadena de transformaciones se aplica implícitamente:

```
P_local_object → [Transformación Objeto] → P_world_object → [Intersección] → P_intersection_world
```

Donde:
1. **P_local_object**: Punto en coordenadas locales del objeto (geometría original)
2. **Transformación Objeto**: Rotación y traslación del objeto según su pose en el perfil `i`
3. **P_world_object**: Punto en coordenadas del mundo después de transformar el objeto
4. **Intersección**: El punto de intersección se calcula en coordenadas del mundo
5. **P_intersection_world**: Punto final almacenado (en coordenadas del mundo)

### Matriz de Transformación del Objeto

La transformación del objeto se representa como una matriz 4×4:

```
M_obj_i = [R_obj_i  P_obj_i]
          [0  0  0   1    ]
```

Donde `R_obj_i` es la matriz de rotación 3×3 y `P_obj_i` es el vector de traslación 3×1.

**Aplicación**:
```
P_world = M_obj_i · P_local
```

En coordenadas homogéneas:
```
[P_world_x]   [R_11  R_12  R_13  T_x]   [P_local_x]
[P_world_y] = [R_21  R_22  R_23  T_y] · [P_local_y]
[P_world_z]   [R_31  R_32  R_33  T_z]   [P_local_z]
[    1    ]   [ 0     0     0     1 ]   [    1    ]
```

---

## Proceso de Reconstrucción

La reconstrucción es el proceso **inverso** a la captura. Dado un punto `P_stored` almacenado en coordenadas del mundo después de todas las transformaciones, queremos recuperar `P_original`, que es la posición del punto en el espacio 3D con el objeto en su pose inicial.

### Objetivo

Recuperar la posición original del punto **antes** de aplicar cualquier transformación:

```
P_stored → [Transformaciones Inversas] → P_original
```

Donde `P_original` es el punto en coordenadas del mundo con:
- Objeto en su pose inicial
- Sensores en su pose inicial

---

## Matemáticas de las Transformaciones

### Rotación 3D

Una rotación en 3D se puede representar de varias formas:

#### 1. Ángulos de Euler

Tres rotaciones alrededor de los ejes X, Y, Z en un orden específico:

```
R = R_z(γ) · R_y(β) · R_x(α)
```

Donde:
- `R_x(α)`: Rotación alrededor del eje X por ángulo α
- `R_y(β)`: Rotación alrededor del eje Y por ángulo β
- `R_z(γ)`: Rotación alrededor del eje Z por ángulo γ

**Matrices de rotación elementales**:

```
R_x(α) = [1     0        0   ]
         [0  cos(α)  -sin(α)]
         [0  sin(α)   cos(α)]

R_y(β) = [ cos(β)  0  sin(β)]
         [   0     1    0   ]
         [-sin(β)  0  cos(β)]

R_z(γ) = [cos(γ)  -sin(γ)  0]
         [sin(γ)   cos(γ)  0]
         [  0       0     1]
```

#### 2. Orden de Aplicación

En Three.js, el orden por defecto es **XYZ** (aplicar primero X, luego Y, luego Z):

```
P_rotated = R_z(γ) · (R_y(β) · (R_x(α) · P))
```

### Rotación Inversa

Para deshacer una rotación, debemos:
1. Aplicar las rotaciones en **orden inverso**
2. Con **ángulos opuestos** (signos negativos)

Si la rotación original es:
```
R = R_z(γ) · R_y(β) · R_x(α)
```

La rotación inversa es:
```
R⁻¹ = R_x(-α) · R_y(-β) · R_z(-γ)
```

**Propiedad**: `R · R⁻¹ = I` (matriz identidad)

### Traslación

Una traslación se representa como:
```
P_translated = P + T
```

Donde `T` es el vector de traslación `[T_x, T_y, T_z]^T`.

### Traslación Inversa

Para deshacer una traslación:
```
P_original = P_translated - T
```

### Transformación Compuesta (Rotación + Traslación)

Una transformación completa (rotación seguida de traslación):
```
P_transformed = R · P + T
```

**Orden importante**: Primero rotación, luego traslación.

### Transformación Inversa Compuesta

Para deshacer una transformación compuesta:

1. **Deshacer traslación**:
   ```
   P_step1 = P_transformed - T
   ```

2. **Deshacer rotación**:
   ```
   P_original = R⁻¹ · P_step1
   ```

**Combinado**:
```
P_original = R⁻¹ · (P_transformed - T)
```

---

## Algoritmo Completo de Reconstrucción

### Entrada

- `profiles`: Array de perfiles, cada perfil es un array de puntos `{x, y, z}` en coordenadas del mundo
- `objectInitialPose`: `{position: Vector3, rotation: Euler}` - Pose inicial del objeto
- `objectMovements`: Array de movimientos del objeto
- `profilesBySensor`: `{sensorId: [profiles]}` - Perfiles organizados por sensor
- `sensors`: Array de objetos Sensor con `initialPose` y `movements`

### Paso 1: Mapeo de Perfiles a Sensores

Para cada perfil en `profiles[]`, necesitamos saber:
- Qué sensor lo capturó
- En qué índice del escaneo se capturó

**Algoritmo**:
```javascript
profileInfo = []
sensorOrder = sensors.map(s => s.id)
maxProfilesPerSensor = max(profilesBySensor[sensorId].length for all sensorId)

for scanProfileIndex = 0 to maxProfilesPerSensor - 1:
    for sensorId in sensorOrder:
        if profilesBySensor[sensorId][scanProfileIndex] exists:
            profileInfo.push({
                sensorId: sensorId,
                scanProfileIndex: scanProfileIndex
            })
```

### Paso 2: Reconstrucción por Perfil

Para cada perfil `profile` en `profiles[]` con índice `profileArrayIndex`:

#### 2.1. Obtener Información del Perfil

```javascript
info = profileInfo[profileArrayIndex]
scanProfileIndex = info.scanProfileIndex
sensorId = info.sensorId
```

#### 2.2. Calcular Poses en el Momento de Captura

**Pose del objeto**:
```javascript
objectPoseAtCapture = calculatePoseAtProfile(
    objectInitialPose,
    objectMovements,
    scanProfileIndex,
    totalProfiles
)
// Resultado: {position: P_obj_i, rotation: R_obj_i}
```

**Pose del sensor** (si aplica):
```javascript
sensor = sensors.find(s => s.id === sensorId)
sensorPoseAtCapture = sensor.calculatePoseAtProfile(
    scanProfileIndex,
    totalProfiles
)
// Resultado: {position: P_sensor_i, rotation: R_sensor_i}

sensorInitialPose = {
    position: sensor.initialPose.position.clone(),
    rotation: sensor.initialPose.rotation.clone()
}
// Resultado: {position: P_sensor_init, rotation: R_sensor_init}
```

#### 2.3. Reconstrucción de Cada Punto

Para cada punto `point = {x, y, z}` en el perfil:

**PASO 1: Deshacer Transformación del Sensor**

El punto almacenado `P_stored` está en coordenadas del mundo después de aplicar la transformación del sensor.

1. **Transformar a coordenadas locales del sensor** (usando pose de captura):
   ```
   P_local = transformPointToSensorLocal(P_stored, sensorPoseAtCapture)
   ```

   **Matemáticamente**:
   ```
   P_local = R_sensor_i⁻¹ · (P_stored - P_sensor_i)
   ```

   Donde:
   - `R_sensor_i⁻¹` es la rotación inversa del sensor en el perfil `i`
   - `P_sensor_i` es la posición del sensor en el perfil `i`

2. **Transformar de vuelta a coordenadas del mundo** (usando pose inicial del sensor):
   ```
   P_world_no_sensor_transform = transformPointToWorld(P_local, sensorInitialPose)
   ```

   **Matemáticamente**:
   ```
   P_world_no_sensor_transform = R_sensor_init · P_local + P_sensor_init
   ```

   **Combinado**:
   ```
   P_world_no_sensor_transform = R_sensor_init · (R_sensor_i⁻¹ · (P_stored - P_sensor_i)) + P_sensor_init
   ```

**Resultado**: El punto ahora está en coordenadas del mundo, pero **solo** con la transformación del objeto aplicada (el sensor ya está "deshecho").

**PASO 2: Deshacer Transformación del Objeto**

Ahora deshacemos la transformación del objeto:

```javascript
P_reconstructed = applyInverseTransformation(
    P_world_no_sensor_transform,
    objectPoseAtCapture,
    objectInitialPose
)
```

**Matemáticamente**:

1. **Deshacer traslación del objeto**:
   ```
   P_step1 = P_world_no_sensor_transform - P_obj_i
   ```

2. **Deshacer rotación del objeto** (en orden inverso):
   ```
   P_reconstructed = R_obj_i⁻¹ · P_step1 + P_obj_init
   ```

   Donde `R_obj_i⁻¹` se calcula como:
   ```
   R_obj_i⁻¹ = R_x(-α_i) · R_y(-β_i) · R_z(-γ_i)
   ```

   Si la rotación original fue `R_obj_i = R_z(γ_i) · R_y(β_i) · R_x(α_i)`.

**Combinado**:
```
P_reconstructed = R_obj_i⁻¹ · (P_world_no_sensor_transform - P_obj_i) + P_obj_init
```

### Paso 3: Almacenamiento del Resultado

El punto reconstruido `P_reconstructed` se guarda en el archivo de salida:

```
output: "P_reconstructed.x P_reconstructed.y P_reconstructed.z"
```

---

## Manejo de Múltiples Sensores

### Orden de Captura

Cuando hay múltiples sensores, los perfiles se capturan en el siguiente orden:

Para cada perfil del escaneo `i`:
1. Sensor 1 captura perfil `i` → se agrega a `profiles[]`
2. Sensor 2 captura perfil `i` → se agrega a `profiles[]`
3. Sensor 3 captura perfil `i` → se agrega a `profiles[]`
4. ...

**Ejemplo con 2 sensores y 3 perfiles**:

```
profiles[] = [
  profile_0_sensor1,  // índice 0 en profiles[], perfil 0 del escaneo, sensor 1
  profile_0_sensor2,  // índice 1 en profiles[], perfil 0 del escaneo, sensor 2
  profile_1_sensor1,  // índice 2 en profiles[], perfil 1 del escaneo, sensor 1
  profile_1_sensor2,  // índice 3 en profiles[], perfil 1 del escaneo, sensor 2
  profile_2_sensor1,  // índice 4 en profiles[], perfil 2 del escaneo, sensor 1
  profile_2_sensor2   // índice 5 en profiles[], perfil 2 del escaneo, sensor 2
]
```

### Reconstrucción con Múltiples Sensores

Cada punto debe reconstruirse usando:
- La pose del sensor que lo capturó
- La pose del objeto en el momento de captura

El algoritmo de mapeo (`profileInfo`) asegura que cada perfil en `profiles[]` se asocie correctamente con:
- Su sensor correspondiente
- Su índice real del escaneo

---

## Ejemplo Numérico

### Configuración

**Objeto inicial**:
- Posición: `P_obj_init = [0, 0, 0]`
- Rotación: `R_obj_init = [0°, 0°, 0°]` (sin rotación)

**Movimiento del objeto**:
- Rotación en X: `90°` durante los perfiles `[0, 100)`
- En el perfil `i = 50`: `progress = 50/100 = 0.5`, rotación aplicada = `45°`

**Sensor inicial**:
- Posición: `P_sensor_init = [0, 0, 5]`
- Rotación: `R_sensor_init = [0°, 0°, 0°]`

**Movimiento del sensor**:
- Traslación en Y: `+1` durante los perfiles `[0, 100)`
- En el perfil `i = 50`: posición = `[0, 0.5, 5]`

### Captura (Perfil i = 50)

1. **Pose del objeto**:
   - Rotación: `R_obj_50 = R_x(45°)`
   - Posición: `P_obj_50 = [0, 0, 0]`

2. **Pose del sensor**:
   - Rotación: `R_sensor_50 = [0°, 0°, 0°]` (sin rotación)
   - Posición: `P_sensor_50 = [0, 0.5, 5]`

3. **Punto de intersección** (en coordenadas del mundo):
   - Supongamos que un vértice del objeto en coordenadas locales es `v_local = [1, 0, 0]`
   - Después de transformar el objeto: `v_world = R_x(45°) · [1, 0, 0] = [1, 0, 0]` (rotación en X no afecta X)
   - Intersección con plano láser: `P_stored = [1, 0, 0]` (ejemplo simplificado)

### Reconstrucción

**PASO 1: Deshacer transformación del sensor**

1. Transformar a coordenadas locales del sensor:
   ```
   P_local = R_sensor_50⁻¹ · (P_stored - P_sensor_50)
   P_local = I · ([1, 0, 0] - [0, 0.5, 5])
   P_local = [1, -0.5, -5]
   ```

2. Transformar de vuelta a coordenadas del mundo (con sensor inicial):
   ```
   P_world_no_sensor = R_sensor_init · P_local + P_sensor_init
   P_world_no_sensor = I · [1, -0.5, -5] + [0, 0, 5]
   P_world_no_sensor = [1, -0.5, 0]
   ```

**PASO 2: Deshacer transformación del objeto**

1. Deshacer traslación:
   ```
   P_step1 = P_world_no_sensor - P_obj_50
   P_step1 = [1, -0.5, 0] - [0, 0, 0]
   P_step1 = [1, -0.5, 0]
   ```

2. Deshacer rotación:
   ```
   P_reconstructed = R_obj_50⁻¹ · P_step1 + P_obj_init
   P_reconstructed = R_x(-45°) · [1, -0.5, 0] + [0, 0, 0]
   ```

   Matriz `R_x(-45°)`:
   ```
   [1      0         0    ]   [1  ]
   [0  cos(-45°) -sin(-45°)] · [-0.5]
   [0  sin(-45°)  cos(-45°)]   [0  ]
   ```

   ```
   P_reconstructed = [1, -0.5·cos(-45°), -0.5·sin(-45°)]
   P_reconstructed = [1, -0.5·0.707, -0.5·(-0.707)]
   P_reconstructed = [1, -0.354, 0.354]
   ```

**Resultado**: El punto reconstruido `[1, -0.354, 0.354]` representa la posición original del punto en el espacio 3D con el objeto en su pose inicial.

---

## Resumen del Flujo Completo

### Durante la Captura

```
P_local_object → [M_obj_i] → P_world_object → [Intersección] → P_stored_world
```

### Durante la Reconstrucción

```
P_stored_world → [Inversa Sensor] → P_world_no_sensor → [Inversa Objeto] → P_reconstructed
```

### Fórmula Final de Reconstrucción

Para un punto `P_stored` capturado en el perfil `i` por el sensor `j`:

```
P_reconstructed = R_obj_i⁻¹ · (
    R_sensor_j_init · (
        R_sensor_j_i⁻¹ · (P_stored - P_sensor_j_i)
    ) + P_sensor_j_init - P_obj_i
) + P_obj_init
```

Donde:
- `R_sensor_j_i⁻¹`: Rotación inversa del sensor `j` en el perfil `i`
- `P_sensor_j_i`: Posición del sensor `j` en el perfil `i`
- `R_sensor_j_init`: Rotación inicial del sensor `j`
- `P_sensor_j_init`: Posición inicial del sensor `j`
- `R_obj_i⁻¹`: Rotación inversa del objeto en el perfil `i`
- `P_obj_i`: Posición del objeto en el perfil `i`
- `P_obj_init`: Posición inicial del objeto

---

## Conclusión

La reconstrucción 3D correcta requiere:

1. ✅ Conocer la pose exacta del objeto en cada perfil
2. ✅ Conocer la pose exacta de cada sensor en cada perfil
3. ✅ Aplicar las transformaciones inversas en el orden correcto:
   - Primero deshacer la transformación del sensor
   - Luego deshacer la transformación del objeto
4. ✅ Usar el orden inverso de rotaciones con ángulos opuestos
5. ✅ Manejar correctamente el mapeo de perfiles a sensores cuando hay múltiples sensores

Este proceso garantiza que la nube de puntos reconstruida represente fielmente la geometría original del objeto, independientemente de los movimientos complejos (rotaciones excéntricas, traslaciones torcidas, etc.) que se hayan aplicado durante el escaneo.

