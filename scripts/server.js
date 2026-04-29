import express from 'express'
import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import jsyaml from 'js-yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = 8123

// Middleware para parsear JSON
app.use(express.json())

// Endpoint de healthcheck
app.get('/healthcheck', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  })
})

// IMPORTANTE: Los endpoints específicos deben ir ANTES del static para tener prioridad
// Servir configs leyendo directamente del sistema de archivos (sin caché)
// Esto debe ir ANTES de express.static para que tenga prioridad
app.get('/configs/*', (req, res) => {
  try {
    const configsDir = join(__dirname, '..', 'public', 'configs')
    // Extraer el nombre del archivo sin query string
    let fileName = req.params[0] || 'simulator.yaml'
    // Eliminar query string si existe (ej: simulator.yaml?t=123 -> simulator.yaml)
    fileName = fileName.split('?')[0]
    const filePath = join(configsDir, fileName)
    
    // Leer el archivo directamente del sistema de archivos en cada petición
    const fileContent = readFileSync(filePath, 'utf-8')
    
    // Headers de no-cache
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    res.setHeader('Content-Type', 'text/yaml; charset=utf-8')
    
    res.send(fileContent)
  } catch (error) {
    console.error('Error leyendo archivo de configuración:', error)
    res.status(404).send('Archivo de configuración no encontrado')
  }
})

// Endpoint para listar modelos dinámicamente
app.get('/api/models', (req, res) => {
  try {
    const modelsDir = join(__dirname, '..', 'public', 'models')
    const files = readdirSync(modelsDir)
    
    const models = files
      .filter(file => {
        try {
          const filePath = join(modelsDir, file)
          // Filtrar archivos que sean modelos válidos y no sean el modelo del sensor (gocator)
          return statSync(filePath).isFile() && 
                 /\.(glb|gltf|obj|stl|fbx)$/i.test(file) &&
                 !/gocator/i.test(file)
        } catch {
          return false
        }
      })
      .map(file => ({
        name: file,
        path: `/models/${file}`
      }))
    
    res.json({ models })
  } catch (error) {
    console.error('Error listando modelos:', error)
    res.status(500).json({ error: 'Error al listar modelos', models: [] })
  }
})

// Servir modelos estáticos con headers de no-cache
app.use('/models', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  express.static(join(__dirname, '..', 'public', 'models'))(req, res, next)
})

// Servir archivos estáticos desde dist (debe ir DESPUÉS de los endpoints específicos)
app.use(express.static(join(__dirname, '..', 'dist')))

// Endpoint para guardar configuración YAML
app.post('/api/save-config', (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ success: false, error: 'Body vacío o inválido' })
    }
    
    const filePath = join(__dirname, '..', 'public', 'configs', 'simulator.yaml')
    const yamlContent = jsyaml.dump(req.body, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: false
    })
    
    writeFileSync(filePath, yamlContent, 'utf-8')
    res.json({ success: true, message: 'Configuración guardada correctamente' })
  } catch (error) {
    console.error('Error guardando configuración:', error)
    res.status(500).json({ success: false, error: error.message || 'Error al guardar' })
  }
})

// Fallback: servir index.html para SPA
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`)
})
