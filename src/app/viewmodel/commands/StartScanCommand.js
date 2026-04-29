export default class StartScanCommand {
    constructor(viewModel) {
        this.viewModel = viewModel;
    }

    async execute() {
        if (!this.viewModel.object || !this.viewModel.sensors || this.viewModel.sensors.length === 0) {
            console.warn('No hay objeto o sensores cargados');
            return;
        }

        if (this.viewModel.finishedScan) {
            return;
        }

        // Si ya se ha empezado el escaneo y se está rotando, no se puede empezar
        if (this.viewModel.hasStartedScan && this.viewModel.isRotating) {
            console.warn('El escaneo ya está en progreso');
            return;
        }

        // Verificar que el objeto tiene geometría válida
        const objectMesh = this.viewModel.object.mesh;
        if (!objectMesh) {
            console.warn('El objeto no tiene mesh');
            return;
        }

        const geometry = objectMesh.geometry;
        if (!geometry || !geometry.attributes.position || geometry.attributes.position.count === 0) {
            console.warn("La geometría del objeto no tiene vértices válidos.");
            return;
        }

        this.viewModel.hasStartedScan = true;
        this.viewModel.isRotating = true;
        console.log('El escaneo ha comenzado');
        await this.viewModel.startScan(this.viewModel.totalProfiles);
    }
}