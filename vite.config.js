import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import jsyaml from 'js-yaml'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 8123,
    strictPort: true,
    allowedHosts: ['triangsim', 'localhost', '0.0.0.0'],
    // Middleware para listar modelos dinámicamente
    middlewareMode: false,
    // Configurar headers de no-cache para modelos
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  },
  plugins: [
    {
      name: 'list-models',
      configureServer(server) {
        // Middleware para evitar caché en modelos
        server.middlewares.use('/models', (req, res, next) => {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
          res.setHeader('Pragma', 'no-cache')
          res.setHeader('Expires', '0')
          next()
        })
        
        // Middleware para servir configs leyendo directamente del sistema de archivos (sin caché)
        server.middlewares.use('/configs', (req, res, next) => {
          // Solo interceptar si es una petición GET a un archivo
          if (req.method === 'GET' && req.url.startsWith('/configs/')) {
            try {
              const configsDir = join(process.cwd(), 'public', 'configs')
              // Extraer el nombre del archivo sin query string
              let fileName = req.url.replace('/configs/', '')
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
              
              res.end(fileContent)
              return
            } catch (error) {
              console.error('Error leyendo archivo de configuración:', error)
              res.statusCode = 404
              res.end('Archivo de configuración no encontrado')
              return
            }
          }
          next()
        })
        
        server.middlewares.use('/api/models', (req, res) => {
          try {
            const modelsDir = join(process.cwd(), 'public', 'models')
            const files = readdirSync(modelsDir)
            
            const models = files
              .filter(file => {
                try {
                  const filePath = join(modelsDir, file)
                  // Filtrar archivos que sean modelos válidos y no sean el modelo del sensor (gocator)
                  return statSync(filePath).isFile() && 
                         /\.(glb|gltf|obj|stl|ply|fbx)$/i.test(file) &&
                         !/gocator/i.test(file)
                } catch {
                  return false
                }
              })
              .map(file => ({
                name: file,
                path: `/models/${file}`
              }))
            
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(JSON.stringify({ models }))
          } catch (error) {
            console.error('Error listando modelos:', error)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Error al listar modelos', models: [] }))
          }
        })
        
        // Endpoint para guardar configuración YAML
        server.middlewares.use('/api/save-config', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Method not allowed' }))
            return
          }
          
          let body = ''
          req.on('data', chunk => { body += chunk.toString() })
          req.on('end', () => {
            try {
              if (!body) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: false, error: 'Body vacío' }))
                return
              }
              
              const filePath = join(process.cwd(), 'public', 'configs', 'simulator.yaml')
              const config = JSON.parse(body)
              const yamlContent = jsyaml.dump(config, {
                indent: 2,
                lineWidth: -1,
                noRefs: true,
                sortKeys: false
              })
              
              writeFileSync(filePath, yamlContent, 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, message: 'Configuración guardada correctamente' }))
            } catch (error) {
              console.error('Error guardando configuración:', error)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: error.message || 'Error al guardar' }))
            }
          })
        })
      }
    }
  ],
  assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.stl', '**/*.obj', '**/*.ply', '**/*.fbx'],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@models': '/public/models'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext'
  }
})
