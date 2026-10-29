self.onmessage = (e) => {
    const { map, robotPosition, canvasWidth, canvasHeight, offsetX, offsetY, zoomLevel } = e.data;
  
    const { width, height, data, resolution, origin_x, origin_y } = map;
    const imageData = new ImageData(canvasWidth, canvasHeight);
    const imgArray = imageData.data;
  
    // Generate image data for the map
    for (let i = 0; i < data.length; i++) {
      const val = data[i];
      const x = i % width;
      const y = Math.floor(i / width);
      const flippedY = height - 1 - y;
      let color = val === -1 ? 127 : val === 0 ? 240 : val === 100 ? 0 : 255 - val * 2.55;
  
      const index = (flippedY * width + x) * 4;
      imgArray[index] = imgArray[index + 1] = imgArray[index + 2] = color;
      imgArray[index + 3] = 255;
    }
  
    // Calculate robot position in canvas space
    const { x, y, yaw } = robotPosition;
    const robotX = ((x - origin_x) / resolution) * (canvasWidth / width) + offsetX;
    const robotY = ((origin_y + height * resolution - y) / resolution) * (canvasHeight / height) + offsetY;
  
    // Draw robot on map (simplified triangle marker)
    const triangleSize = 10 * zoomLevel;
    const halfSize = triangleSize / 2;
    const cosA = Math.cos(yaw);
    const sinA = Math.sin(yaw);
  
    const points = [
      { x: 0, y: -triangleSize },
      { x: -halfSize, y: halfSize },
      { x: halfSize, y: halfSize }
    ].map(({ x, y }) => ({
      x: x * cosA - y * sinA + robotX,
      y: x * sinA + y * cosA + robotY
    }));
    // Draw robot on map using image data manipulation here
    // You can draw it with direct manipulation or simulate it with pixel placement
    imageData.fillStyle = "green";
    imageData.beginPath();
    imageData.moveTo(points[0].x, points[0].y);
    imageData.lineTo(points[1].x, points[1].y);
    imageData.lineTo(points[2].x, points[2].y);
    imageData.closePath();
    imageData.fill();

    const circleRadius = Math.min(triangleSize * 2, Math.min(canvasWidth, canvasHeight) * 0.065);
    imageData.fillStyle = "rgba(0, 255, 0, 0.3)";
    imageData.beginPath();
    imageData.arc(robotX, robotY, circleRadius, 0, 2 * Math.PI);
    imageData.fill();
    self.postMessage(imageData);  // Send back the image data to main thread
  };
  