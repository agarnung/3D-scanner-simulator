#!/bin/bash

# Colores para la salida
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuración
IMAGE_NAME="3d-scanner-simulator-image"
CONTAINER_NAME="3d-scanner-simulator-container"
PORT="8123"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Scanner Simulator - Inicialización${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Verificar si Docker está instalado
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker no está instalado.${NC}"
    echo -e "${YELLOW}Por favor, instala Docker primero:${NC}"
    echo "  https://docs.docker.com/engine/install/ubuntu/"
    exit 1
fi

# Verificar si Docker está corriendo
if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Docker no está corriendo.${NC}"
    echo -e "${YELLOW}Por favor, inicia el servicio Docker:${NC}"
    echo "  sudo systemctl start docker"
    exit 1
fi

echo -e "${GREEN}✓ Docker está instalado y corriendo${NC}"
echo ""

# Detener y eliminar contenedor existente si existe (por nombre)
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${YELLOW}Deteniendo contenedor existente '${CONTAINER_NAME}'...${NC}"
    docker stop ${CONTAINER_NAME} 2>/dev/null || true
    docker rm ${CONTAINER_NAME} 2>/dev/null || true
    echo -e "${GREEN}✓ Contenedor '${CONTAINER_NAME}' eliminado${NC}"
    echo ""
fi

# Buscar y detener cualquier contenedor que esté usando el puerto 8123
echo -e "${YELLOW}Verificando si el puerto ${PORT} está en uso...${NC}"
PORT_USERS=$(docker ps --format '{{.ID}} {{.Names}}' | while read id name; do
    docker port "$id" 2>/dev/null | grep -q ":${PORT}" && echo "$id $name"
done)

if [ ! -z "$PORT_USERS" ]; then
    echo -e "${YELLOW}Deteniendo contenedores que usan el puerto ${PORT}...${NC}"
    echo "$PORT_USERS" | while read id name; do
        echo -e "  - Deteniendo contenedor: $name (ID: $id)"
        docker stop "$id" 2>/dev/null || true
        docker rm "$id" 2>/dev/null || true
    done
    echo -e "${GREEN}✓ Contenedores que usaban el puerto ${PORT} eliminados${NC}"
    echo ""
fi

# También verificar contenedores antiguos con nombres similares (compatibilidad)
OLD_NAMES=("scanner-simulator-container" "scanner-simulator-image")
for old_name in "${OLD_NAMES[@]}"; do
    if docker ps -a --format '{{.Names}}' | grep -q "^${old_name}$"; then
        echo -e "${YELLOW}Eliminando contenedor antiguo '${old_name}'...${NC}"
        docker stop ${old_name} 2>/dev/null || true
        docker rm ${old_name} 2>/dev/null || true
        echo -e "${GREEN}✓ Contenedor antiguo '${old_name}' eliminado${NC}"
        echo ""
    fi
done

# Construir la imagen Docker
echo -e "${BLUE}Construyendo la imagen Docker...${NC}"
if docker build -f Dockerfile -t ${IMAGE_NAME} .; then
    echo -e "${GREEN}✓ Imagen construida correctamente${NC}"
    echo ""
else
    echo -e "${RED}❌ Error al construir la imagen${NC}"
    exit 1
fi

# Verificar que el puerto no esté en uso por otro proceso (no Docker)
if command -v lsof &> /dev/null; then
    if lsof -Pi :${PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
        PID=$(lsof -Pi :${PORT} -sTCP:LISTEN -t)
        echo -e "${YELLOW}⚠️  Advertencia: El puerto ${PORT} está en uso por el proceso PID ${PID}${NC}"
        echo -e "${YELLOW}   Esto puede causar problemas. Considera detener ese proceso primero.${NC}"
        echo ""
    fi
fi

# Ejecutar el contenedor con volumen montado para public/configs (para cambios en tiempo real)
echo -e "${BLUE}Iniciando el contenedor...${NC}"
echo -e "${YELLOW}Montando directorio public/configs como volumen para cambios en tiempo real${NC}"

# Obtener la ruta absoluta del directorio actual
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC_CONFIGS_DIR="${SCRIPT_DIR}/public/configs"

# Verificar que el directorio existe
if [ ! -d "${PUBLIC_CONFIGS_DIR}" ]; then
    echo -e "${RED}❌ Error: El directorio ${PUBLIC_CONFIGS_DIR} no existe${NC}"
    exit 1
fi

# Obtener la ruta del directorio public/models
PUBLIC_MODELS_DIR="${SCRIPT_DIR}/public/models"

# Verificar que el directorio de modelos existe
if [ ! -d "${PUBLIC_MODELS_DIR}" ]; then
    echo -e "${YELLOW}⚠️  Advertencia: El directorio ${PUBLIC_MODELS_DIR} no existe${NC}"
    echo -e "${YELLOW}   Creando directorio...${NC}"
    mkdir -p "${PUBLIC_MODELS_DIR}"
fi

# Montar los directorios public/configs y public/models como volúmenes en el contenedor
# El servidor personalizado lee directamente de /app/public
# configs necesita ser rw para poder guardar cambios, models puede ser ro
if docker run -d --name ${CONTAINER_NAME} -p ${PORT}:${PORT} \
    -v "${PUBLIC_CONFIGS_DIR}:/app/public/configs:rw" \
    -v "${PUBLIC_MODELS_DIR}:/app/public/models:ro" \
    ${IMAGE_NAME}; then
    echo -e "${GREEN}✓ Contenedor iniciado correctamente${NC}"
    echo -e "${GREEN}✓ Volumen montado: ${PUBLIC_CONFIGS_DIR} -> /app/public/configs${NC}"
    echo -e "${GREEN}✓ Volumen montado: ${PUBLIC_MODELS_DIR} -> /app/public/models${NC}"
    echo -e "${YELLOW}  Los cambios en simulator.yaml y modelos se reflejarán automáticamente${NC}"
    echo ""
else
    echo -e "${RED}❌ Error al iniciar el contenedor${NC}"
    echo -e "${YELLOW}Posibles causas:${NC}"
    echo "  - El puerto ${PORT} está en uso por otro proceso"
    echo "  - Hay un contenedor con el mismo nombre"
    echo ""
    echo -e "${YELLOW}Intenta:${NC}"
    echo "  docker ps -a | grep ${CONTAINER_NAME}"
    echo "  docker stop ${CONTAINER_NAME} && docker rm ${CONTAINER_NAME}"
    echo "  # O verifica qué está usando el puerto:"
    echo "  lsof -i :${PORT} || netstat -tulpn | grep ${PORT}"
    exit 1
fi

# Esperar un momento para que el servidor se inicie
echo -e "${YELLOW}Esperando a que el servidor se inicie...${NC}"
sleep 3

# Verificar que el contenedor está corriendo
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  ✅ Sistema iniciado correctamente${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${BLUE}🌐 Accede al simulador en:${NC}"
    echo -e "${GREEN}   http://localhost:${PORT}${NC}"
    echo ""
    echo -e "${YELLOW}Para detener el contenedor:${NC}"
    echo -e "   docker stop ${CONTAINER_NAME}"
    echo ""
    echo -e "${YELLOW}Para ver los logs:${NC}"
    echo -e "   docker logs -f ${CONTAINER_NAME}"
    echo ""
else
    echo -e "${RED}❌ El contenedor no está corriendo${NC}"
    echo -e "${YELLOW}Revisa los logs con:${NC}"
    echo "   docker logs ${CONTAINER_NAME}"
    exit 1
fi

