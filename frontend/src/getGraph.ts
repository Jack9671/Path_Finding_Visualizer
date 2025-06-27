

type Coordinate = [number, number];

type AdjacentNodeInfo = {
  adjacentNodeId: string;
  weight: number;         // NEW: edge weight (distance)
  highwayType: string;
  name: string;
  oneWay: string;
};

type Graph = {
  [nodeId: string]: {
    coordinate: Coordinate;
    inforOfAllAdjacentNodes: AdjacentNodeInfo[];
  };
};


export function buildGraphFromOSM(
  osmXmlString: string,
  enableHighwayTypeFilter: boolean = true,
  enableOneWayFilter: boolean = true,
  allowedHighwayTypes: string[]
): Graph {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(osmXmlString, "application/xml");
  const nodeElements = xmlDoc.getElementsByTagName("node");
  const nodeCoords: Record<string, { lat: number; lon: number }> = {};


  for (let i = 0; i < nodeElements.length; i++) {
    const node = nodeElements[i];
    const id = node.getAttribute("id") || "";
    const lat = parseFloat(node.getAttribute("lat") || "0");
    const lon = parseFloat(node.getAttribute("lon") || "0");
    nodeCoords[id] = { lat, lon };
  }

  const graph: Graph = {};
  const wayElements = xmlDoc.getElementsByTagName("way");

  for (let i = 0; i < wayElements.length; i++) {
    const way = wayElements[i];
    const ndElements = way.getElementsByTagName("nd");
    const tagElements = way.getElementsByTagName("tag");

    let highwayType = "unknown";
    let name = "unknown";
    let oneWay = "no";

    for (let j = tagElements.length - 1; j >= 0; j--) {
      const tag = tagElements[j];
      const k = tag.getAttribute("k");
      const v = tag.getAttribute("v");

      if (k === "highway") highwayType = v || "unknown";
      else if (k === "name") name = v || "unknown";
      else if (k === "oneway") oneWay = v || "no";
    }

    if (enableHighwayTypeFilter && !allowedHighwayTypes.includes(highwayType)) {
      console.warn(`Skipping highway type: ${highwayType} since it is not in the allowed`);
      continue;
    }

    for (let j = 0; j < ndElements.length - 1; j++) {
      const fromNodeId = ndElements[j].getAttribute("ref") || "";
      const toNodeId = ndElements[j + 1].getAttribute("ref") || "";

      const fromCoord = nodeCoords[fromNodeId];
      const toCoord = nodeCoords[toNodeId];

      if (!graph[fromNodeId]) {
        graph[fromNodeId] = {
          coordinate: [fromCoord.lon, fromCoord.lat],
          inforOfAllAdjacentNodes: []
        };
      }

      const weightForward = Math.sqrt(
        Math.pow(toCoord.lon - fromCoord.lon, 2) +
        Math.pow(toCoord.lat - fromCoord.lat, 2)
      );

      graph[fromNodeId].inforOfAllAdjacentNodes.push({
        adjacentNodeId: toNodeId,
        weight: weightForward,
        highwayType,
        name,
        oneWay
      });

      const isOneway = enableOneWayFilter && oneWay === "yes";
      if (!isOneway) {
        if (!graph[toNodeId]) {
          graph[toNodeId] = {
            coordinate: [toCoord.lon, toCoord.lat],
            inforOfAllAdjacentNodes: []
          };
        }

        const weightBackward = Math.sqrt(
          Math.pow(fromCoord.lon - toCoord.lon, 2) +
          Math.pow(fromCoord.lat - toCoord.lat, 2)
        );

        graph[toNodeId].inforOfAllAdjacentNodes.push({
          adjacentNodeId: fromNodeId,
          weight: weightBackward,
          highwayType,
          name,
          oneWay
        });
      }
    }
  }

  return graph;
}
