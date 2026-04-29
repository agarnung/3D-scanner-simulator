export default class PointCloud {
  constructor() {
    this.points = [];
  }

  addPoint(point) {
    this.points.push(point);
  }

  reset() {
    this.points = [];
  }
}