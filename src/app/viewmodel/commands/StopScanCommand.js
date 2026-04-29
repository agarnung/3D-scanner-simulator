export default class StopScanCommand {
    constructor(viewModel) {
        this.viewModel = viewModel;
    }
    
    execute() {
        // Solo se puede parar si se ha iniciado
        if (!this.viewModel.hasStartedScan) {
            console.warn('No hay escaneo iniciado para detener');
            return;
        }
    
        // Si el modelo no rota, no se escanea nada, por construcción del simulador
        // Detener el escaneo pero mantener el estado actual para poder reanudar
        this.viewModel.isRotating = false;
        
        // Detener visualización en tiempo real si está activa
        if (this.viewModel.realTimeVisualization) {
            this.viewModel.stopRealTimeVisualization();
        }
        
        console.log('Escaneo detenido');
        console.log(`Perfiles capturados: ${this.viewModel.profiles.length}`);
        console.log(`Puntos totales: ${this.viewModel.totalPoints}`);
        console.log(`Progreso: ${this.viewModel.currentProfileCount}/${this.viewModel.totalProfiles}`);
    }
}