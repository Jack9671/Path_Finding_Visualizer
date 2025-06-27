import { time } from "console";
import { buildGraphFromOSM } from "./getGraph";
export interface PriorityItem<T> {
  item: T;
  priority: number;
}

export class PriorityQueue<T> {
  private heap: PriorityItem<T>[] = [];
  private indexMap: Map<T, number> = new Map();

  /** Swap two elements in the heap and update their indices in the map */
  private swap(i: number, j: number): void {
    const tmp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = tmp;
    this.indexMap.set(this.heap[i].item, i);
    this.indexMap.set(this.heap[j].item, j);
  }

  /** Move the element at idx up until heap property is restored */
  private siftUp(idx: number): void {
    let parent = Math.floor((idx - 1) / 2);
    while (idx > 0 && this.heap[idx].priority < this.heap[parent].priority) {
      this.swap(idx, parent);
      idx = parent;
      parent = Math.floor((idx - 1) / 2);
    }
  }

  /** Move the element at idx down until heap property is restored */
  private siftDown(idx: number): void {
    const length = this.heap.length;
    while (true) {
      let left = 2 * idx + 1;
      let right = 2 * idx + 2;
      let smallest = idx;

      if (left < length && this.heap[left].priority < this.heap[smallest].priority) {
        smallest = left;
      }
      if (right < length && this.heap[right].priority < this.heap[smallest].priority) {
        smallest = right;
      }
      if (smallest === idx) break;

      this.swap(idx, smallest);
      idx = smallest;
    }
  }

  /** Add or update an item with given priority */
  enqueue(item: T, priority: number): void {
    if (this.indexMap.has(item)) {
      this.updatePriority(item, priority);
      return;
    }
    const entry: PriorityItem<T> = { item, priority };
    this.heap.push(entry);
    const idx = this.heap.length - 1;
    this.indexMap.set(item, idx);
    this.siftUp(idx);
  }

  /** Remove and return the item with smallest priority */
  dequeue(): T | undefined {
    if (this.isEmpty()) return undefined;
    const root = this.heap[0];
    const last = this.heap.pop()!;
    this.indexMap.delete(root.item);
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.indexMap.set(last.item, 0);
      this.siftDown(0);
    }
    return root.item;
  }

  /** Peek at the item with smallest priority without removing */
  peek(): T | undefined {
    return this.heap.length > 0 ? this.heap[0].item : undefined;
  }

  /** Update the priority of an existing item and reheapify */
  updatePriority(item: T, newPriority: number): void {
    const idx = this.indexMap.get(item);
    if (idx === undefined) return;
    const oldPriority = this.heap[idx].priority;
    this.heap[idx].priority = newPriority;
    if (newPriority < oldPriority) {
      this.siftUp(idx);
    } else {
      this.siftDown(idx);
    }
  }

  /** Check if the queue is empty */
  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /** Get number of items in the queue */
  size(): number {
    return this.heap.length;
  }

  /** Check if an item is in the queue */
  has(item: T): boolean {
    return this.indexMap.has(item);
  }
}
/*HELPER FUNCTION AND HELPER CLASS FOR EXTENDED DATA STRUCTURE*/
function minkowskiDistance(coord1: [number, number], coord2: [number, number], p: number): number {
   //parameters: coord1 and coord2 are arrays of [lon, lat] format; p is the order of the Minkowski distance (e.g., p=1 for Manhattan, p=2 for Euclidean)
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  return Math.pow(
    Math.pow(Math.abs(lon1 - lon2), p) + Math.pow(Math.abs(lat1 - lat2), p),
    1 / p
  );
}
  //a function that returns a promise object that resolves once onStepUpdate used for UI is called
function delayWithStateUpdate(currentVisitedNodes: Set<string>, solutionNodes: string[], onStepUpdate: (visitedNodes: Set<string>, solutionNodes: string[]) => void): Promise<void> 
  {
    return new Promise<void>( 
      (resolve) => {
        requestAnimationFrame(() => {
          onStepUpdate(new Set(currentVisitedNodes), solutionNodes); // clone set to avoid mutation issues
          setTimeout(resolve, 0); // resolve immediately to allow UI update
        });
      });
}
// Default highway types
const DEFAULT_HIGHWAY_TYPES = [
  "road", "path", "trunk", "trunk_link", "primary", "primary_link",
  "secondary", "secondary_link", "tertiary", "tertiary_link",
  "unclassified", "motorway", "motorway_link", "cycleway",
  "footway", "pedestrian", "service", "residential", 'residential_link', 
  'living_street', 'track', 'construction'
];

///--------------------------------------------------------------------------------------------------------------
export async function depthFirstSearch(
  xmlString: string,
  startNodeId: string,
  endNodeId: string,
  enableHighwayTypeFilter: boolean,
  enableOneWayFilter: boolean,
  allowedHighwayTypes: string[] = DEFAULT_HIGHWAY_TYPES,
  minkowskiDistanceParameter: number = 2, // kept for consistency with other algorithms
  CyclicNumberOfVisitedNodesForUIupdate: number = 10,
  onStepUpdate: (visitedNodes: Set<string>, solutionNodes: string[]) => void
): Promise<[string[],number,number]> {
  
  // Step 1: Parse and build the graph
  const graph = buildGraphFromOSM(
    xmlString,
    enableHighwayTypeFilter,
    enableOneWayFilter,
    allowedHighwayTypes
  );
  const timeStart = performance.now(); // Start time for performance measurement
  // Step 2: Initialize variables
  const stack: string[] = [startNodeId]; // Stack for DFS (LIFO - Last In, First Out)
  const visitedNodes = new Set<string>(); // Track visited nodes for UI purpose
  const cameFrom: Record<string, string | null> = { [startNodeId]: null }; // Track parent nodes to reconstruct path
  // ex of how cameFrom looks like: { "node1Id": null, "node2Id": "node1Id", "node3Id": "node2Id" }
  // Step 3: DFS search loop
  while (stack.length > 0) { // Continue while stack is not empty
    const currentNodeId = stack.pop()!; // Get the most recently added node (LIFO)
    // Skip if already visited
    if (visitedNodes.has(currentNodeId)) continue;
    // Mark current node as visited
    visitedNodes.add(currentNodeId);
    // Check if we reached the destination
    if (currentNodeId === endNodeId) break;
    //prevent undefined node access
    if (!graph[currentNodeId]) {
      console.error(`Node ${currentNodeId} not found in graph.`);
      continue;
    }
    // Get all adjacent nodes information
    const adjacentNodesInfor = graph[currentNodeId]["inforOfAllAdjacentNodes"];
    // Iterate through each adjacent node
    for (const inforOfCurrentAdjacentNode of adjacentNodesInfor) {
      const adjacentNodeId = inforOfCurrentAdjacentNode.adjacentNodeId;
      // If adjacent node hasn't been visited, add it to stack
      if (!visitedNodes.has(adjacentNodeId)) {
        stack.push(adjacentNodeId);
        cameFrom[adjacentNodeId] = currentNodeId;
      }
    }
    // Update UI periodically
    if (visitedNodes.size % CyclicNumberOfVisitedNodesForUIupdate === 0) {
      await delayWithStateUpdate(visitedNodes, [], onStepUpdate); // no need to pass solutionNodes as it will be constructed later in step 4
    }
  }
  // Step 4: Reconstruct the path or solutionNodes
  const solutionNodes: string[] = [];
  let current: string | null = endNodeId;
  // Check if path exists (endNodeId should be in cameFrom if reachable)
  if (!cameFrom.hasOwnProperty(endNodeId)) {
    const timeEnd = performance.now(); // End time for performance measurement
    await delayWithStateUpdate(visitedNodes, [], onStepUpdate); // Final update with no path
    return [[], (timeEnd - timeStart), visitedNodes.size]; // No path found
  }
  // Backtrack from end to start
  while (current !== null) {
    solutionNodes.unshift(current);
    current = cameFrom[current];
  }
  // Measure performance
  const timeEnd = performance.now(); // End time for performance measurement
  // Final update with the complete path
  await delayWithStateUpdate(visitedNodes, solutionNodes, onStepUpdate);
  return [solutionNodes, (timeEnd - timeStart), visitedNodes.size]; // Return solutionNodes and time taken in seconds
}

///--------------------------------------------------------------------------------------------------------------
export async function breadthFirstSearch(
  xmlString: string,
  startNodeId: string,
  endNodeId: string,
  enableHighwayTypeFilter: boolean,
  enableOneWayFilter: boolean,
  allowedHighwayTypes: string[] =  DEFAULT_HIGHWAY_TYPES,
  minkowskiDistanceParameter: number = 2, // kept for consistency with other algorithms
  CyclicNumberOfVisitedNodesForUIupdate: number = 10,
  onStepUpdate: (visitedNodes: Set<string>, solutionNodes: string[]) => void
): Promise<[string[], number, number]> {
  
  // Step 1: Parse and build the graph
  const graph = buildGraphFromOSM(
    xmlString,
    enableHighwayTypeFilter,
    enableOneWayFilter,
    allowedHighwayTypes
  );
  const timeStart = performance.now(); // Start time for performance measurement
  // Step 2: Initialize variables
  const queue: string[] = [startNodeId]; // Queue for BFS (FIFO - First In, First Out)
  const visitedNodes = new Set<string>([startNodeId]); // Track visited nodes, start with startNodeId
  const cameFrom: Record<string, string | null> = { [startNodeId]: null }; // Track parent nodes to reconstruct path
  // ex of how cameFrom looks like: { "node1Id": null, "node2Id": "node1Id", "node3Id": "node2Id" }
  
  // Step 3: BFS search loop

  while (queue.length > 0) { // Continue while queue is not empty
    const currentNodeId = queue.shift()!; // Get the first added node (FIFO)
    // Check if we reached the destination
    if (currentNodeId === endNodeId) break;
    // prevent undefined node access
    if (!graph[currentNodeId]) {
      console.error(`Node ${currentNodeId} not found in graph.`);
      continue;
    }
    // Get all adjacent nodes information
    const adjacentNodesInfor = graph[currentNodeId]["inforOfAllAdjacentNodes"];
    // Iterate through each adjacent node
    for (const inforOfCurrentAdjacentNode of adjacentNodesInfor) {
      const adjacentNodeId = inforOfCurrentAdjacentNode.adjacentNodeId;
      // If adjacent node hasn't been visited, add it to queue and mark as visited
      if (!visitedNodes.has(adjacentNodeId)) {
        visitedNodes.add(adjacentNodeId);
        queue.push(adjacentNodeId);
        cameFrom[adjacentNodeId] = currentNodeId;
      }
    }
    // Update UI periodically
    if (visitedNodes.size % CyclicNumberOfVisitedNodesForUIupdate === 0) {
      await delayWithStateUpdate(visitedNodes, [], onStepUpdate); // no need to pass solutionNodes as it will be constructed later in step 4
    }
  }

  // Step 4: Reconstruct the path or solutionNodes
  const solutionNodes: string[] = [];
  let current: string | null = endNodeId;
  // Check if path exists (endNodeId should be in cameFrom if reachable)
  if (!cameFrom.hasOwnProperty(endNodeId)) {
    const timeEnd = performance.now(); // End time for performance measurement
    await delayWithStateUpdate(visitedNodes, [], onStepUpdate); // Final update with no path
    return [[], (timeEnd - timeStart), visitedNodes.size]; // No path found
  }
  // Backtrack from end to start
  while (current !== null) {
    solutionNodes.unshift(current);
    current = cameFrom[current];
  }
  const timeEnd = performance.now(); // End time for performance measurement
  // Final update with the complete path
  await delayWithStateUpdate(visitedNodes, solutionNodes, onStepUpdate);
  return [solutionNodes, (timeEnd - timeStart),visitedNodes.size]; // Return solutionNodes and time taken in seconds
}

///--------------------------------------------------------------------------------------------------------------
export async function dijkstraSearch(
  xmlString: string,
  startNodeId: string,
  endNodeId: string,
  enableHighwayTypeFilter: boolean,
  enableOneWayFilter: boolean,
  allowedHighwayTypes: string[] = DEFAULT_HIGHWAY_TYPES,
  minkowskiDistanceParameter: number = 2, // kept for consistency with other algorithms
  CyclicNumberOfVisitedNodesForUIupdate: number = 100,
  onStepUpdate: (visitedNodes: Set<string>, solutionNodes: string[]) => void
): Promise<[string[], number, number]> {
  
  // Step 1: Build a graph from the OSM XML input using provided filters
  const graph = buildGraphFromOSM(
    xmlString,
    enableHighwayTypeFilter,
    enableOneWayFilter,
    allowedHighwayTypes
  );
  const timeStart = performance.now(); // Start time for performance measurement
  // Step 2: Initialize distance table and priority queue
  // Priority queue: nodeId with priority = current shortest distance from start
  const priorityQueue = new PriorityQueue();
  priorityQueue.enqueue(startNodeId, 0);
  // Each node stores:
  // - currentShortestDistanceFromOptimalPreviousNodeId: current known shortest distance from startNodeId
  // - currentOptimalPreviousNodeId: the previous node on the optimal path
  const table: Record<string, {
    currentShortestDistanceFromOptimalPreviousNodeId: number;
    currentOptimalPreviousNodeId: string;
  }> = {};
  // Initialize all nodes with infinite distance
  for (const nodeId in graph) {
    table[nodeId] = {
      currentShortestDistanceFromOptimalPreviousNodeId: Infinity,
      currentOptimalPreviousNodeId: "",
    };
  }
  // Set distance from start node to itself as 0
  table[startNodeId].currentShortestDistanceFromOptimalPreviousNodeId = 0;
  // Set of visited nodes to avoid reprocessing
  const visitedNodes: Set<string> = new Set();
  // Step 3: Dijkstra's main loop using priority queue
  while (!priorityQueue.isEmpty()) {
    // Get the unvisited node with the smallest known distance
    const currentNodeId = priorityQueue.dequeue();
    // Skip if already processed 
    if (visitedNodes.has(currentNodeId)) continue;
    // Mark current node as visited
    visitedNodes.add(currentNodeId);
    // Stop if we reached the destination
    if (currentNodeId === endNodeId) break;
    // Get all adjacent nodes and their weights
    const adjacentNodesInfor = graph[currentNodeId]["inforOfAllAdjacentNodes"];
    // Iterate through each adjacent node
    for (const inforOfCurrentAdjacentNode of adjacentNodesInfor) {
      const adjacentNodeId = inforOfCurrentAdjacentNode.adjacentNodeId;
      const weight = inforOfCurrentAdjacentNode.weight;
      // Skip if adjacent node not in the table
      if (!(adjacentNodeId in table)) {
        //console.log(`Skipping adjacent node ${adjacentNodeId}`);
        continue;
      }
      // Skip if adjacent node has already been visited
      if (visitedNodes.has(adjacentNodeId)) continue;
      // Calculate tentative distance from startNodeId through currentNodeId
      const newDistance = 
        table[currentNodeId].currentShortestDistanceFromOptimalPreviousNodeId + weight;
      // If the new path is shorter, update the distance and previous node
      if (newDistance < table[adjacentNodeId].currentShortestDistanceFromOptimalPreviousNodeId) {
        table[adjacentNodeId].currentShortestDistanceFromOptimalPreviousNodeId = newDistance;
        table[adjacentNodeId].currentOptimalPreviousNodeId = currentNodeId;
        // Add the adjacent node to priority queue with its new distance
        priorityQueue.enqueue(adjacentNodeId, newDistance);
      }
    }
    // Update the UI with the current state
    if (visitedNodes.size % CyclicNumberOfVisitedNodesForUIupdate === 0) {
      await delayWithStateUpdate(visitedNodes, [], onStepUpdate); // no need to pass solutionNodes as it will be constructed later in step 4
    }
  }
  // Step 4: Backtrack from endNodeId to startNodeId to build the shortest path
  const solutionNodes: string[] = [];
  let backtrackNode = endNodeId;
  // Check if end node is reachable
  if (table[endNodeId].currentShortestDistanceFromOptimalPreviousNodeId === Infinity) {
    const timeEnd = performance.now(); // End time for performance measurement
    await delayWithStateUpdate(visitedNodes, [], onStepUpdate); // Final update with no path
    return [[], (timeEnd - timeStart), visitedNodes.size]; // No path found
  }
  // Reconstruct path by following previous node pointers
  while (backtrackNode !== startNodeId) {
    solutionNodes.unshift(backtrackNode); // Add current node to path (from end to start)
    const prev = table[backtrackNode]?.currentOptimalPreviousNodeId;
    // If a previous node does not exist, path is broken (shouldn't happen if path exists)
    if (!prev) {
      const timeEnd = performance.now(); // End time for performance measurement
      await delayWithStateUpdate(visitedNodes, [], onStepUpdate);
      return [[], (timeEnd - timeStart), visitedNodes.size]; // No path found
    }
    backtrackNode = prev;
  }
  
  // Finally, add the start node at the beginning
  solutionNodes.unshift(startNodeId);
  const timeEnd = performance.now(); // End time for performance measurement
  // Update the UI with the final path
  await delayWithStateUpdate(visitedNodes, solutionNodes, onStepUpdate); // Final update with the complete path
  return [solutionNodes, (timeEnd - timeStart),visitedNodes.size]; // Return solutionNodes and time taken in seconds
}

///--------------------------------------------------------------------------------------------------------------
export async function greedyBestFirstSearch(
  xmlString: string,
  startNodeId: string,
  endNodeId: string,
  enableHighwayTypeFilter: boolean,
  enableOneWayFilter: boolean,
  allowedHighwayTypes: string[] = DEFAULT_HIGHWAY_TYPES, 
  minkowskiDistanceParameter: number = 2,
  CyclicNumberOfVisitedNodesForUIupdate: number = 10,
  onStepUpdate: (visitedNodes: Set<string>, solutionNodes: string[]) => void
): Promise<[string[], number, number]> {
  
  // Step 1: Parse and build the graph
  const graph = buildGraphFromOSM(
    xmlString,
    enableHighwayTypeFilter,
    enableOneWayFilter,
    allowedHighwayTypes
  );
  const timeStart = performance.now(); // Start time for performance measurement
  // Step 2: Initialize variables 
  // Priority queue: nodeId with priority = f(n) = h(n)
  const priorityQueue = new PriorityQueue(); 
  const startHeuristic = minkowskiDistance(
    graph[startNodeId].coordinate,
    graph[endNodeId].coordinate,
    minkowskiDistanceParameter
  );
  priorityQueue.enqueue(startNodeId, startHeuristic);
  // Maps for tracking path and costs
  const cameFrom: Record<string, string | null> = { [startNodeId]: null };
  // ex of how cameFrom looks like: { "node1Id": null, "node2Id": "node1Id", "node3Id": "node2Id" }
  const visitedNodes = new Set<string>(); // used for UI purpose and has no effect on the algorithm
  // ex of how visitedNodes looks like: Set { "node1Id", "node2Id" }

  // Step 3: search loop
  while (!priorityQueue.isEmpty()) { // if the queue is not empty
    const currentNodeId = priorityQueue.dequeue(); // Get the node with the lowest f(n) value
    if (currentNodeId === endNodeId) break; // Found the end node, so we can stop searching
    visitedNodes.add(currentNodeId); // Mark the current node as visited
    const adjacentNodesInfor = graph[currentNodeId]["inforOfAllAdjacentNodes"]; // Get object containing information of all adjacent nodes
    // Iterate through each adjacent node
    for (const inforOfCurrentAdjacentNode of adjacentNodesInfor) {
      if (visitedNodes.has(inforOfCurrentAdjacentNode.adjacentNodeId) || priorityQueue.has(inforOfCurrentAdjacentNode.adjacentNodeId)) continue; // Skip if an adjacentNodeId has been visited or is already in the queue
      const CurrentAdjacentNodeId = inforOfCurrentAdjacentNode.adjacentNodeId;
      // prevent undefined access
      if (!graph[CurrentAdjacentNodeId]) {
        console.error(`Node ${CurrentAdjacentNodeId} not found in graph.`);
        continue;
      }

      const heuristic = minkowskiDistance(
        graph[CurrentAdjacentNodeId].coordinate,
        graph[endNodeId].coordinate,
        minkowskiDistanceParameter
      );
      priorityQueue.enqueue(CurrentAdjacentNodeId, heuristic);
      cameFrom[CurrentAdjacentNodeId] = currentNodeId;
      if (visitedNodes.size % CyclicNumberOfVisitedNodesForUIupdate === 0) { // Update visualization every user-defined number of nodes processed
        await delayWithStateUpdate(visitedNodes, [], onStepUpdate); // no need to pass solutionNodes as it will be constructed later in step 4 when we call delayWithStateUpdate again
      }
    }
  }
  // Step 4: Reconstruct the path or solutionNodes
  const solutionNodes: string[] = [];
  let current: string | null = endNodeId;
  while (current !== null) {
    solutionNodes.unshift(current);
    current = cameFrom[current];
  }
  const timeEnd = performance.now(); // End time for performance measurement
  await delayWithStateUpdate(visitedNodes, solutionNodes, onStepUpdate); // Final update with the complete path
  return [solutionNodes, (timeEnd - timeStart),visitedNodes.size]; // Return solutionNodes and time taken in seconds
}

// A* Search implementation for OSM-like weighted graphs
export async function aStarSearch(
  xmlString: string,
  startNodeId: string,
  endNodeId: string,
  enableHighwayTypeFilter: boolean,
  enableOneWayFilter: boolean,
  allowedHighwayTypes: string[] = DEFAULT_HIGHWAY_TYPES,
  MinkowskiDistanceParameter: number = 2,
  CyclicNumberOfVisitedNodesForUIupdate: number = 100, // update UI every 100 nodes visited
  onStepUpdate: (visitedNodes: Set<string>, solutionNodes: string[]) => void, // callback function to pass visited nodes and solution nodes for UI updates
): Promise<[string[], number, number]> {
  // Step 1: Parse and build the graph
  const graph = buildGraphFromOSM(
    xmlString,
    enableHighwayTypeFilter,
    enableOneWayFilter,
    allowedHighwayTypes
  );
  const timeStart = performance.now(); // Start time for performance measurement
  // Step 2: Initialize variables 
  // Priority queue: nodeId with priority = f(n) = g(n) + h(n)
  const priorityQueue = new PriorityQueue(); 
  priorityQueue.enqueue(startNodeId, 0);
  // Maps for tracking path and costs
  const cameFrom: Record<string, string | null> = { [startNodeId]: null };
  // ex of how cameFrom looks like: { "node1Id": null, "node2Id": "node1Id", "node3Id": "node2Id" }
  const gScore: Record<string, number> = { [startNodeId]: 0 };
  // ex of how gScore looks like: { "node1Id": 0, "node2Id": Infinity, "node3Id": 33 }
  const visitedNodes = new Set<string>(); // used for UI purpose and has no effect on the algorithm
  // ex of how visitedNodes looks like: Set { "node1Id", "node2Id" }

  // Step 3: A* search loop
  while (!priorityQueue.isEmpty()) { // if the queue is not empty
    const currentNodeId = priorityQueue.dequeue(); // Get the node with the lowest f(n) value
    if (currentNodeId === endNodeId) break; // Found the end node, so we can stop searching
    visitedNodes.add(currentNodeId); // Mark the current node as visited

    const adjacentNodesInfor = graph[currentNodeId]["inforOfAllAdjacentNodes"]; // Get object containing information of all adjacent nodes
    // Iterate through each adjacent node
    for (const inforOfCurrentAdjacentNode of adjacentNodesInfor) {
      if (visitedNodes.has(inforOfCurrentAdjacentNode.adjacentNodeId)) continue; // Skip if an adjacentNodeId has been visited
      const CurrentAdjacentNodeId = inforOfCurrentAdjacentNode.adjacentNodeId;
      const weight = inforOfCurrentAdjacentNode.weight;
      const tentativeG = gScore[currentNodeId] + weight; // Calculate the tentative g score to the adjacentNodeId

      if (tentativeG < (gScore[CurrentAdjacentNodeId] ?? Infinity)) { // If this path to adjacentNodeId is better
        cameFrom[CurrentAdjacentNodeId] = currentNodeId;
        gScore[CurrentAdjacentNodeId] = tentativeG;
        
        //avoid undefined access
        if (!graph[CurrentAdjacentNodeId]) {
          console.error(`Node ${CurrentAdjacentNodeId} not found in graph.`);
          continue;
        }
        const heuristic = minkowskiDistance(
          graph[CurrentAdjacentNodeId].coordinate,
          graph[endNodeId].coordinate,
          MinkowskiDistanceParameter
        );
        const fScore = tentativeG + heuristic;
        priorityQueue.enqueue(CurrentAdjacentNodeId, fScore);
      }
    }
    if (visitedNodes.size % CyclicNumberOfVisitedNodesForUIupdate === 0) { // Update visualization every 100 nodes processed
      await delayWithStateUpdate(visitedNodes, [], onStepUpdate); // no need to pass solutionNodes as it will be constructed later in step 4 when we call delayWithStateUpdate again
    }
  }

  // Step 4: Reconstruct the path or solutionNodes
  const solutionNodes: string[] = [];
  let current: string | null = endNodeId;
  while (current !== null) {
    solutionNodes.unshift(current);
    current = cameFrom[current];
  }
  const timeEnd = performance.now(); // End time for performance measurement
  await delayWithStateUpdate(visitedNodes, solutionNodes, onStepUpdate); // Final update with the complete path
  return [solutionNodes, (timeEnd - timeStart),visitedNodes.size]; // Return solutionNodes and time taken in seconds
}

///--------------------------------------------------------------------------------------------------------------

/*HELPER FUNCTIONS AND TYPES FOR BIDIRECTIONAL SEARCH*/
// Search strategy types
export type SearchStrategy = 'BFS' | 'DFS' | 'DIJKSTRA' | 'ASTAR' | 'GREEDY';

// Interface for search state to manage both directions
interface SearchState {
  visitedNodes: Set<string>;
  cameFrom: Record<string, string | null>;
  frontier: string[];
  gScore?: Record<string, number>;
  priorityQueue?: PriorityQueue;
  inQueue?: Set<string>;
}

// UI update helper for bidirectional search
function delayWithStateUpdateForBDS(
  forwardVisited: Set<string>, 
  backwardVisited: Set<string>, 
  solutionNodes: string[], 
  onStepUpdate: (visitedNodes: Set<string>, solutionNodes: string[]) => void
): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      const combinedVisited = new Set([...forwardVisited, ...backwardVisited]);
      onStepUpdate(combinedVisited, solutionNodes);
      setTimeout(resolve, 0);
    });
  });
}

// Initialize search state based on strategy
function initializeSearchState(
  startNodeId: string, 
  strategy: SearchStrategy, 
  graph: any, 
  targetNodeId?: string, 
  minkowskiDistanceParameter?: number
): SearchState {
  const state: SearchState = {
    visitedNodes: new Set<string>(),
    cameFrom: { [startNodeId]: null },
    frontier: []
  };
  
  switch (strategy) {
    case 'BFS':
      state.frontier = [startNodeId];
      break;
      
    case 'DFS':
      state.frontier = [startNodeId];
      break;
      
    case 'DIJKSTRA':
      state.priorityQueue = new PriorityQueue();
      state.priorityQueue.enqueue(startNodeId, 0);
      state.gScore = { [startNodeId]: 0 };
      state.inQueue = new Set([startNodeId]);
      break;
      
    case 'ASTAR':
      state.priorityQueue = new PriorityQueue();
      state.gScore = { [startNodeId]: 0 };
      state.inQueue = new Set([startNodeId]);
      
      if (targetNodeId && graph[startNodeId] && graph[targetNodeId]) {
        const heuristic = minkowskiDistance(
          graph[startNodeId].coordinate,
          graph[targetNodeId].coordinate,
          minkowskiDistanceParameter || 2
        );
        state.priorityQueue.enqueue(startNodeId, 0 + heuristic);
      } else {
        state.priorityQueue.enqueue(startNodeId, 0);
      }
      break;
      
    case 'GREEDY':
      state.priorityQueue = new PriorityQueue();
      state.inQueue = new Set([startNodeId]);
      
      if (targetNodeId && graph[startNodeId] && graph[targetNodeId]) {
        const heuristic = minkowskiDistance(
          graph[startNodeId].coordinate,
          graph[targetNodeId].coordinate,
          minkowskiDistanceParameter || 2
        );
        state.priorityQueue.enqueue(startNodeId, heuristic);
      } else {
        state.priorityQueue.enqueue(startNodeId, 0);
      }
      break;
  }

  return state;
}

// Execute one step of the specified search strategy
function executeSearchStep(
  state: SearchState, 
  strategy: SearchStrategy, 
  graph: any, 
  targetNodeId: string, 
  minkowskiDistanceParameter: number
): string | null {
  let currentNodeId: string | null = null;

  switch (strategy) {
    case 'BFS':
      if (state.frontier.length === 0) return null;
      currentNodeId = state.frontier.shift()!;
      if (state.visitedNodes.has(currentNodeId)) return null;
      state.visitedNodes.add(currentNodeId);
      break;
      
    case 'DFS':
      if (state.frontier.length === 0) return null;
      currentNodeId = state.frontier.pop()!;
      if (state.visitedNodes.has(currentNodeId)) return null;
      state.visitedNodes.add(currentNodeId);
      break;
      
    case 'DIJKSTRA':
      if (!state.priorityQueue || state.priorityQueue.isEmpty()) return null;
      currentNodeId = state.priorityQueue.dequeue();
      if (!currentNodeId || state.visitedNodes.has(currentNodeId)) return null;
      state.visitedNodes.add(currentNodeId);
      if (state.inQueue) state.inQueue.delete(currentNodeId);
      break;
      
    case 'ASTAR':
      if (!state.priorityQueue || state.priorityQueue.isEmpty()) return null; 
      currentNodeId = state.priorityQueue.dequeue();
      if (!currentNodeId || state.visitedNodes.has(currentNodeId)) return null;
      state.visitedNodes.add(currentNodeId);
      if (state.inQueue) state.inQueue.delete(currentNodeId);
      break;
      
    case 'GREEDY':
      if (!state.priorityQueue || state.priorityQueue.isEmpty()) return null;
      currentNodeId = state.priorityQueue.dequeue();
      if (!currentNodeId || state.visitedNodes.has(currentNodeId)) return null;
      state.visitedNodes.add(currentNodeId);
      if (state.inQueue) state.inQueue.delete(currentNodeId);
      break;
  }

  if (!currentNodeId || !graph[currentNodeId]) return null;

  // Process adjacent nodes
  const adjacentNodesInfor = graph[currentNodeId]["inforOfAllAdjacentNodes"];
  if (!adjacentNodesInfor) return currentNodeId;
  
  for (const inforOfCurrentAdjacentNode of adjacentNodesInfor) {
    const adjacentNodeId = inforOfCurrentAdjacentNode.adjacentNodeId;
    const weight = inforOfCurrentAdjacentNode.weight;

    if (state.visitedNodes.has(adjacentNodeId)) continue;

    switch (strategy) {
      case 'BFS':
        if (!state.cameFrom.hasOwnProperty(adjacentNodeId)) {
          state.frontier.push(adjacentNodeId);
          state.cameFrom[adjacentNodeId] = currentNodeId;
        }
        break;
        
      case 'DFS':
        if (!state.cameFrom.hasOwnProperty(adjacentNodeId)) {
          state.frontier.push(adjacentNodeId);
          state.cameFrom[adjacentNodeId] = currentNodeId;
        }
        break;
        
      case 'DIJKSTRA':
        if (state.gScore && state.priorityQueue && state.inQueue) {
          const tentativeG = state.gScore[currentNodeId] + weight;
          if (tentativeG < (state.gScore[adjacentNodeId] ?? Infinity)) {
            state.cameFrom[adjacentNodeId] = currentNodeId;
            state.gScore[adjacentNodeId] = tentativeG;
            if (!state.inQueue.has(adjacentNodeId)) {
              state.priorityQueue.enqueue(adjacentNodeId, tentativeG);
              state.inQueue.add(adjacentNodeId);
            }
          }
        }
        break;
        
      case 'ASTAR':
        if (state.gScore && state.priorityQueue && state.inQueue && graph[adjacentNodeId] && graph[targetNodeId]) {
          const tentativeG = state.gScore[currentNodeId] + weight;
          if (tentativeG < (state.gScore[adjacentNodeId] ?? Infinity)) {
            state.cameFrom[adjacentNodeId] = currentNodeId;
            state.gScore[adjacentNodeId] = tentativeG;
            
            const heuristic = minkowskiDistance(
              graph[adjacentNodeId].coordinate,
              graph[targetNodeId].coordinate,
              minkowskiDistanceParameter
            );
            
            if (!state.inQueue.has(adjacentNodeId)) {
              state.priorityQueue.enqueue(adjacentNodeId, tentativeG + heuristic);
              state.inQueue.add(adjacentNodeId);
            }
          }
        }
        break;
        
      case 'GREEDY':
        if (state.priorityQueue && state.inQueue && graph[adjacentNodeId] && graph[targetNodeId]) {
          if (!state.cameFrom.hasOwnProperty(adjacentNodeId)) {
            state.cameFrom[adjacentNodeId] = currentNodeId;
            const heuristic = minkowskiDistance(
              graph[adjacentNodeId].coordinate,
              graph[targetNodeId].coordinate,
              minkowskiDistanceParameter
            );
            
            if (!state.inQueue.has(adjacentNodeId)) {
              state.priorityQueue.enqueue(adjacentNodeId, heuristic);
              state.inQueue.add(adjacentNodeId);
            }
          }
        }
        break;
    }
  }

  return currentNodeId;
}

// Bidirectional search implementation
export async function bidirectionalSearch(
  xmlString: string,
  startNodeId: string,
  endNodeId: string,
  enableHighwayTypeFilter: boolean,
  enableOneWayFilter: boolean,
  allowedHighwayTypes: string[] = DEFAULT_HIGHWAY_TYPES,
  minkowskiDistanceParameter: number = 2, // kept for consistency with other algorithms
  CyclicNumberOfVisitedNodesForUIupdate: number = 10,
  onStepUpdate: (visitedNodes: Set<string>, solutionNodes: string[]) => void,
  searchStrategy: SearchStrategy = 'ASTAR' // Default to A* search

): Promise<[string[], number, number]> {
  // Step 1: Parse and build the graph
  const graph = buildGraphFromOSM(
    xmlString,
    enableHighwayTypeFilter,
    enableOneWayFilter,
    allowedHighwayTypes
  );
  const timeStart = performance.now(); // Start time for performance measurement
  
  // Validate start and end nodes
  if (!graph[startNodeId]) {
    const timeEnd = performance.now(); // End time for performance measurement
    console.error(`Start node ${startNodeId} not found in graph`);
    return [[], timeEnd - timeStart, 0]; // No path found
  }
  if (!graph[endNodeId]) {
    const timeEnd = performance.now(); // End time for performance measurement
    console.error(`End node ${endNodeId} not found in graph`);
    return [[], timeEnd - timeStart, 0]; // No path found
  }

  
  const forwardState = initializeSearchState(
    startNodeId, searchStrategy, graph, endNodeId, minkowskiDistanceParameter
  );
  const backwardState = initializeSearchState(
    endNodeId, searchStrategy, graph, startNodeId, minkowskiDistanceParameter
  );
  
  let meetingNode: string | null = null;
  let stepCount = 0;
  
  // Alternating bidirectional search loop
  while (meetingNode === null) {
    // Forward step
    const forwardCurrentNode = executeSearchStep(
      forwardState, searchStrategy, graph, endNodeId, minkowskiDistanceParameter
    );
    // if backwardState.visitedNodes has the forwardCurrentNode and it is not null, we found a meeting point
    if (forwardCurrentNode && backwardState.visitedNodes.has(forwardCurrentNode)) {
      meetingNode = forwardCurrentNode;
      break;
    }
    
    // Backward step
    const backwardCurrentNode = executeSearchStep(
      backwardState, searchStrategy, graph, startNodeId, minkowskiDistanceParameter
    );
    
    if (backwardCurrentNode && forwardState.visitedNodes.has(backwardCurrentNode)) {
      meetingNode = backwardCurrentNode;
      break;
    }

    if (!forwardCurrentNode && !backwardCurrentNode) break;
    
    stepCount++;
    
    if (stepCount % CyclicNumberOfVisitedNodesForUIupdate === 0) {
      await delayWithStateUpdateForBDS(forwardState.visitedNodes, backwardState.visitedNodes, [], onStepUpdate);
    }
  }
  
  if (!meetingNode) { // If no meeting point was found, return empty path
    const timeEnd = performance.now(); // End time for performance measurement
    await delayWithStateUpdateForBDS(forwardState.visitedNodes, backwardState.visitedNodes, [], onStepUpdate);
    return [[], (timeEnd - timeStart), forwardState.visitedNodes.size + backwardState.visitedNodes.size]; // No path found
  }
  
  // Reconstruct path
  const forwardPath: string[] = [];
  let current: string | null = meetingNode;
  while (current !== null) {
    forwardPath.unshift(current);
    current = forwardState.cameFrom[current];
  }
  
  const backwardPath: string[] = [];
  current = backwardState.cameFrom[meetingNode];
  while (current !== null) {
    backwardPath.push(current);
    current = backwardState.cameFrom[current];
  }
  
  const solutionNodes = [...forwardPath, ...backwardPath];
  const timeEnd = performance.now(); // End time for performance measurement
  await delayWithStateUpdateForBDS(forwardState.visitedNodes, backwardState.visitedNodes, solutionNodes, onStepUpdate);
  
  return [solutionNodes, (timeEnd - timeStart), forwardState.visitedNodes.size + backwardState.visitedNodes.size]; // Return solutionNodes and time taken in milliseconds
}