// Servicio para generar y deibujar la imagen del perfil 3D a partir de su ortoproyección en 3D

export default class ProfileRenderer2D {
  constructor(canvasId = 'canvas2d') {
    // Obtener el canvas, si existe, donde se dibujará la imagen
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.warn(`Canvas con id "${canvasId}" no encontrado`);
      return;
    }

    this.ctx = this.canvas.getContext('2d');

    // Ajuste para pantallas retina/alta densidad de píxeles (mejorar la calidad visual del dibujo)
    const dpr = window.devicePixelRatio * 4 || 4; // Cuántos píxeles reales por cada pixel CSS queremos usar

    // Tamaño deseado en CSS
    const desiredWidth = 324;
    const desiredHeight = 324;
    this.canvas.style.width = desiredWidth + 'px';
    this.canvas.style.height = desiredHeight + 'px';

    // Ajustar tamaño real (pixeles) multiplicando por devicePixelRatio
    this.canvas.width = desiredWidth * dpr;
    this.canvas.height = desiredHeight * dpr;

    // Escalar el contexto para compensar el DPI y que no se vean distorsionados los dibujos
    this.ctx.scale(dpr, dpr);

    this.width = desiredWidth;
    this.height = desiredHeight;
  }

  clearCanvas() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  // Dibujar una cuadrícula gris semitransparente
  drawGrid(scale, padding) {
    const gridSpacing = 0.01; 

    this.ctx.strokeStyle = 'rgba(169, 169, 169, 0.15)'; 
    this.ctx.lineWidth = 0.5;
    this.ctx.setLineDash([1, 1]); // Establecer líneas discontinuas para este dibujo

    // Dibujar las líneas verticales en toda la anchura del canvas
    for (let x = -1; x <= 1; x += gridSpacing) { 
      const xPos = ((x) * scale) + padding;
      this.ctx.beginPath();
      this.ctx.moveTo(xPos, 0);
      this.ctx.lineTo(xPos, this.height);
      this.ctx.stroke();
    }

    // Dibujar las líneas horizontales en toda la altura del canvas
    for (let y = -1; y <= 1; y += gridSpacing) { 
      const yPos = this.height / 2 - (y * scale);
      this.ctx.beginPath();
      this.ctx.moveTo(0, yPos);
      this.ctx.lineTo(this.width, yPos);
      this.ctx.stroke();
    }

    this.ctx.setLineDash([]); // Restablecer a líneas continuas para otros dibujos
  }

  drawProfile(profile) {
    if (!this.ctx || !profile || profile.length === 0) return;

    this.clearCanvas(); // Borrar el dibujo anterior

    // Proyectar perfil al plano 2D XY
    const points2D = profile.map(p => ({ x: p.x, y: p.y })); // No invertir Y para ver profundidad hacia abajo

    // Calcular bounding box de los puntos 2D para normalizar
    const minX = Math.min(...points2D.map(p => p.x)); // El mínimo de todos los valores x del array de puntos points2D
    const maxX = Math.max(...points2D.map(p => p.x));
    const minY = Math.min(...points2D.map(p => p.y));
    const maxY = Math.max(...points2D.map(p => p.y));
    const bboxWidth = maxX - minX || 1; // Si la resta da cero (por ser todos los puntos iguales), usar 1 para evitar división por cero (i.e. no se escala)
    const bboxHeight = maxY - minY || 1;

    // Escalado para que quepa en el canvas (bbox' + 2 * padding = bbox * s)
    const padding = 20; // Margen desde el borde del canvas al bounding box del perfil
    const scaleX = (this.width - 2 * padding) / bboxWidth;
    const scaleY = (this.height - 2 * padding) / bboxHeight;

    // Escoger el menor de los dos para mantener proporciones uniformes
    const scale = Math.min(scaleX, scaleY);

    // Punto medio del eje vertical para centrar Y
    const centerY = this.height / 2;

    // Dibujar la rejilla antes de los puntos
    this.drawGrid(scale, padding);

    this.ctx.fillStyle = '#ff0000'; // Rojo vivo puro
    const pointRadius = 1; // Tamaño del punto

    for (const p of points2D) {
      // Coordenadas normalizadas al centro del canvas
      const x = ((p.x - minX) * scale) + padding;

      // Centrado verticalmente: desplazar el punto según su diferencia respecto al centro del rango
      const offsetY = (p.y - (minY + maxY) / 2) * scale;
      const y = centerY - offsetY;

      // Dibujo del punto como un pequeño círculo
      this.ctx.beginPath();
      this.ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
}
