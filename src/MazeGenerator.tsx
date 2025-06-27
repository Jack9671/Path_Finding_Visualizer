
interface Node {
  id: string;
  lat: number;
  lon: number;
}

interface Way {
  id: string;
  nodes: string[];
  tags: { [key: string]: string };
}

export function generatePrimMazeOSM(gridSize: number = 30, spacing: number = 0.00001, seed: number = 7489): string {
  // Set random seed (simple implementation)
  let randomSeed = seed;
  const seededRandom = () => {
    randomSeed = (randomSeed * 9301 + 49297) % 233280;
    return randomSeed / 233280;
  };

  // Step 1: Initialize all nodes
  const nodeIds: { [key: string]: number } = {};
  const nodePositions: { [key: number]: { lat: number; lon: number } } = {};
  let currentId = 1;

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const lat = (x * spacing) * Math.pow(115 / 32.177, 2);
      const lon = (y * spacing) * Math.pow(115 / 32.177, 2);
      const key = `${x},${y}`;
      nodeIds[key] = currentId;
      nodePositions[currentId] = { lat, lon };
      currentId++;
    }
  }

  // Step 2: Prim's algorithm for maze generation
  const visited = new Set<string>();
  const edges: Array<[string, string]> = [];
  const mazeEdges: Array<[string, string]> = [];

  const start = "0,0";
  visited.add(start);

  const getNeighbors = (cell: string): string[] => {
    const [x, y] = cell.split(',').map(Number);
    const neighbors: string[] = [];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    
    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
        neighbors.push(`${nx},${ny}`);
      }
    }
    return neighbors;
  };

  // Add initial edges
  for (const neighbor of getNeighbors(start)) {
    edges.push([start, neighbor]);
  }

  // Prim's algorithm
  while (edges.length > 0) {
    const randomIndex = Math.floor(seededRandom() * edges.length);
    const [a, b] = edges[randomIndex];
    edges.splice(randomIndex, 1);

    if (!visited.has(b)) {
      visited.add(b);
      mazeEdges.push([a, b]);
      
      for (const neighbor of getNeighbors(b)) {
        if (!visited.has(neighbor)) {
          edges.push([b, neighbor]);
        }
      }
    }
  }

  // Step 3: Generate XML
  let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="prim_maze_grid">
`;

  // Add all nodes
  for (const [key, nodeId] of Object.entries(nodeIds)) {
    const { lat, lon } = nodePositions[nodeId];
    xmlContent += `  <node id="${nodeId}" visible="true" lat="${lat}" lon="${lon}"/>
`;
  }

  // Add ways (maze paths)
  let wayId = 100000;
  for (const [a, b] of mazeEdges) {
    const id1 = nodeIds[a];
    const id2 = nodeIds[b];
    xmlContent += `  <way id="${wayId}">
    <nd ref="${id1}"/>
    <nd ref="${id2}"/>
    <tag k="highway" v="residential"/>
  </way>
`;
    wayId++;
  }

  xmlContent += `</osm>`;
  return xmlContent;
}

// TypeScript version of generate_full_grid_osm
export function generateFullGrid(gridSize: number = 20, spacing: number = 0.001, seed?: number): string {
  // Set random seed if provided
  let randomSeed = seed || Date.now();
  const seededRandom = () => {
    randomSeed = (randomSeed * 9301 + 49297) % 233280;
    return randomSeed / 233280;
  };

  const nodeIds: { [key: string]: number } = {};
  const nodePositions: { [key: number]: { lat: number; lon: number } } = {};
  let currentId = 1;

  // Create all nodes
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const lat = (x * spacing) * Math.pow(115 / 32.177, 2);
      const lon = (y * spacing) * Math.pow(115 / 32.177, 2);
      const key = `${x},${y}`;
      nodeIds[key] = currentId;
      nodePositions[currentId] = { lat, lon };
      currentId++;
    }
  }

  // Generate XML
  let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="full_grid_generator">
`;

  // Add all nodes
  for (const [key, nodeId] of Object.entries(nodeIds)) {
    const { lat, lon } = nodePositions[nodeId];
    xmlContent += `  <node id="${nodeId}" visible="true" lat="${lat}" lon="${lon}"/>
`;
  }

  // Create ways between each node and its right and bottom neighbor
  let wayIdCounter = gridSize * gridSize + 1;
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const currentKey = `${x},${y}`;
      const id1 = nodeIds[currentKey];

      // Link to right neighbor
      if (x < gridSize - 1) {
        const rightKey = `${x + 1},${y}`;
        const id2 = nodeIds[rightKey];
        xmlContent += `  <way id="${wayIdCounter}">
    <nd ref="${id1}"/>
    <nd ref="${id2}"/>
    <tag k="highway" v="residential"/>
  </way>
`;
        wayIdCounter++;
      }

      // Link to bottom neighbor
      if (y < gridSize - 1) {
        const bottomKey = `${x},${y + 1}`;
        const id3 = nodeIds[bottomKey];
        xmlContent += `  <way id="${wayIdCounter}">
    <nd ref="${id1}"/>
    <nd ref="${id3}"/>
    <tag k="highway" v="residential"/>
  </way>
`;
        wayIdCounter++;
      }
    }
  }

  xmlContent += `</osm>`;
  return xmlContent;
}