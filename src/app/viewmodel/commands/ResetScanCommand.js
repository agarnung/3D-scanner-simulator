export default class ResetScanCommand {
    constructor(viewModel) {
        this.viewModel = viewModel;
    }
    
    execute() {
        // Detener cualquier escaneo en progreso
        this.viewModel.isRotating = false;
        
        // Detener visualización en tiempo real si está activa
        if (this.viewModel.realTimeVisualization) {
            this.viewModel.stopRealTimeVisualization();
        }
        
        // Limpiar perfiles
        this.viewModel.clearProfiles();
        this.viewModel.currentProfileCount = 0;
        this.viewModel.hasStartedScan = false;
        this.viewModel.finishedScan = false;
        
        // Restaurar objeto y sensores a su posición ORIGINAL
        if (this.viewModel.object && this.viewModel.object.mesh && this.viewModel.objectOriginalInitialPose) {
            this.viewModel.object.mesh.position.copy(this.viewModel.objectOriginalInitialPose.position);
            this.viewModel.object.mesh.rotation.copy(this.viewModel.objectOriginalInitialPose.rotation);
            if (this.viewModel.objectOriginalInitialPose.scale) {
                this.viewModel.object.mesh.scale.copy(this.viewModel.objectOriginalInitialPose.scale);
            }
            this.viewModel.object.mesh.updateMatrixWorld();
            
            // Restaurar también objectInitialPose a la original
            this.viewModel.objectInitialPose = {
                position: this.viewModel.objectOriginalInitialPose.position.clone(),
                rotation: this.viewModel.objectOriginalInitialPose.rotation.clone(),
                scale: this.viewModel.objectOriginalInitialPose.scale
                    ? this.viewModel.objectOriginalInitialPose.scale.clone()
                    : this.viewModel.object.mesh.scale.clone()
            };
        }
        
        // Restaurar sensores a su pose inicial
        this.viewModel.sensors.forEach(sensor => sensor.resetPose());
        
        // Actualizar visualizaciones de ROI
        if (this.viewModel.view) {
            this.viewModel.view.updateAOIVisualizations(this.viewModel.sensors);
        }
        
        // Resetear visualizaciones
        this.viewModel.clearCurrentProfilePointsVisualization();
        if (this.viewModel.profileRenderer2D) {
            this.viewModel.profileRenderer2D.clearCanvas();
        }

        console.log('Escaneo reiniciado - objeto y sensores restaurados a posición original');
    }
}