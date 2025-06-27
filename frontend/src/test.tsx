import { 
  depthFirstSearch, 
  breadthFirstSearch, 
  dijkstraSearch, 
  greedyBestFirstSearch, 
  aStarSearch, 
  bidirectionalSearch 
} from './AlgorithmToolkit';
import { buildGraphFromOSM } from './getGraph';

// Test configuration with random seed
interface TestConfig {
  numTestCases: number;
  osmFilePath: string;
  enableHighwayTypeFilter: boolean;
  enableOneWayFilter: boolean;
  allowedHighwayTypes: string[];
  minkowskiDistanceParameter: number;
  randomSeed?: number; // Add random seed for reproducibility
}

// Test results for each algorithm
interface AlgorithmResult {
  name: string;
  totalTime: number;
  totalExploredNodes: number;
  totalPathLength: number;
  successfulRuns: number;
}

// Test metrics
interface TestMetrics {
  averageTimeComplexity: number;
  exploredRatio: number;
  pathRatio: number;
}

// Seeded Random Number Generator (Linear Congruential Generator)
class SeededRandom {
  private seed: number;

  constructor(seed: number = Date.now()) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }

  // Generate next random number between 0 and 1
  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  // Generate random integer between min (inclusive) and max (exclusive)
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  // Reset seed for reproducibility
  setSeed(seed: number): void {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }
}

// Default test configuration with default seed
const DEFAULT_TEST_CONFIG: TestConfig = {
  numTestCases: 15,
  osmFilePath: "DongXoaiCity.osm", // Relative path to OSM file
  enableHighwayTypeFilter: false,
  enableOneWayFilter: false,
  allowedHighwayTypes: [
  "road", "path", "trunk", "trunk_link", "primary", "primary_link",
  "secondary", "secondary_link", "tertiary", "tertiary_link",
  "unclassified", "motorway", "motorway_link", "cycleway",
  "footway", "pedestrian", "service", "residential", 'residential_link', 
  'living_street', 'track', 'construction'
],
  minkowskiDistanceParameter: 2,
  randomSeed: 9999, // Default reproducible seed
};

// Load OSM file
async function loadOSMFile(filePath: string): Promise<string> {
  try {
    // Try fetching from public folder (works in Vite/React)
    const response = await fetch(filePath);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.text();
  } catch (error) {
    console.error('Error loading OSM file:', error);
    throw new Error(`Failed to load OSM file from ${filePath}`);
  }
}

// Get random node IDs from graph using seeded random
function getRandomNodeIds(graph: any, rng: SeededRandom, count: number = 2): string[] {
  const nodeIds = Object.keys(graph);
  const selectedNodes: string[] = [];
  
  for (let i = 0; i < count; i++) {
    const randomIndex = rng.nextInt(0, nodeIds.length);
    selectedNodes.push(nodeIds[randomIndex]);
  }
  
  return selectedNodes;
}

// Calculate path length using Euclidean distance
function calculatePathLength(nodeIds: string[], graph: any): number {
  if (nodeIds.length < 2) return 0;
  
  let totalLength = 0;
  for (let i = 0; i < nodeIds.length - 1; i++) {
    const fromNode = graph[nodeIds[i]];
    const toNode = graph[nodeIds[i + 1]];
    
    if (fromNode && toNode) {
      const [lon1, lat1] = fromNode.coordinate;
      const [lon2, lat2] = toNode.coordinate;
      
      const distance = Math.sqrt(
        Math.pow(lon2 - lon1, 2) + Math.pow(lat2 - lat1, 2)
      );
      totalLength += distance;
    }
  }
  
  return totalLength;
}

// Dummy UI update function for testing
const dummyUIUpdate = (visitedNodes: Set<string>, solutionNodes: string[]) => {
  // Do nothing - just for testing
};

// Run a single test case for all algorithms
async function runSingleTestCase(
  xmlString: string,
  graph: any,
  startNodeId: string,
  endNodeId: string,
  config: TestConfig
): Promise<{ results: AlgorithmResult[], shortestPathLength: number }> {
  const results: AlgorithmResult[] = [
    { name: 'DFS', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 },
    { name: 'BFS', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 },
    { name: 'Dijkstra', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 },
    { name: 'Greedy', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 },
    { name: 'A*', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 },
    { name: 'Bidirectional-DFS', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 },
    { name: 'Bidirectional-BFS', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 },
    { name: 'Bidirectional-Dijkstra', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 },
    { name: 'Bidirectional-Greedy', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 },
    { name: 'Bidirectional-A*', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 }
  ];

  let shortestPathLength = Infinity;

  try {
    // Run unidirectional algorithms
    const [dfsPath, dfsTime, dfsExplored] = await depthFirstSearch(
      xmlString, startNodeId, endNodeId, 
      config.enableHighwayTypeFilter, config.enableOneWayFilter, 
      config.allowedHighwayTypes, config.minkowskiDistanceParameter, 
      10000000000000, dummyUIUpdate
    );
    
    if (dfsPath.length > 0) {
      results[0].totalTime = dfsTime;
      results[0].totalExploredNodes = dfsExplored;
      results[0].totalPathLength = calculatePathLength(dfsPath, graph);
      results[0].successfulRuns = 1;
    }

    const [bfsPath, bfsTime, bfsExplored] = await breadthFirstSearch(
      xmlString, startNodeId, endNodeId, 
      config.enableHighwayTypeFilter, config.enableOneWayFilter, 
      config.allowedHighwayTypes, config.minkowskiDistanceParameter, 
      10000000000000, dummyUIUpdate
    );
    
    if (bfsPath.length > 0) {
      results[1].totalTime = bfsTime;
      results[1].totalExploredNodes = bfsExplored;
      results[1].totalPathLength = calculatePathLength(bfsPath, graph);
      results[1].successfulRuns = 1;
    }

    const [dijkstraPath, dijkstraTime, dijkstraExplored] = await dijkstraSearch(
      xmlString, startNodeId, endNodeId, 
      config.enableHighwayTypeFilter, config.enableOneWayFilter, 
      config.allowedHighwayTypes, config.minkowskiDistanceParameter, 
      10000000000000, dummyUIUpdate
    );
    
    if (dijkstraPath.length > 0) {
      results[2].totalTime = dijkstraTime;
      results[2].totalExploredNodes = dijkstraExplored;
      results[2].totalPathLength = calculatePathLength(dijkstraPath, graph);
      results[2].successfulRuns = 1;
      shortestPathLength = results[2].totalPathLength; // Dijkstra gives optimal path
    }

    const [greedyPath, greedyTime, greedyExplored] = await greedyBestFirstSearch(
      xmlString, startNodeId, endNodeId, 
      config.enableHighwayTypeFilter, config.enableOneWayFilter, 
      config.allowedHighwayTypes, config.minkowskiDistanceParameter, 
      10000000000000, dummyUIUpdate
    );
    
    if (greedyPath.length > 0) {
      results[3].totalTime = greedyTime;
      results[3].totalExploredNodes = greedyExplored;
      results[3].totalPathLength = calculatePathLength(greedyPath, graph);
      results[3].successfulRuns = 1;
    }

    const [astarPath, astarTime, astarExplored] = await aStarSearch(
      xmlString, startNodeId, endNodeId, 
      config.enableHighwayTypeFilter, config.enableOneWayFilter, 
      config.allowedHighwayTypes, config.minkowskiDistanceParameter, 
      10000000000000, dummyUIUpdate
    );
    
    if (astarPath.length > 0) {
      results[4].totalTime = astarTime;
      results[4].totalExploredNodes = astarExplored;
      results[4].totalPathLength = calculatePathLength(astarPath, graph);
      results[4].successfulRuns = 1;
    }

    // Run bidirectional algorithms
    const [bidDfsPath, bidDfsTime, bidDfsExplored] = await bidirectionalSearch(
      xmlString, startNodeId, endNodeId, 
      config.enableHighwayTypeFilter, config.enableOneWayFilter, 
      config.allowedHighwayTypes, config.minkowskiDistanceParameter, 
      10000000000000, dummyUIUpdate, 'DFS'
    );
    
    if (bidDfsPath.length > 0) {
      results[5].totalTime = bidDfsTime;
      results[5].totalExploredNodes = bidDfsExplored;
      results[5].totalPathLength = calculatePathLength(bidDfsPath, graph);
      results[5].successfulRuns = 1;
    }

    const [bidBfsPath, bidBfsTime, bidBfsExplored] = await bidirectionalSearch(
      xmlString, startNodeId, endNodeId, 
      config.enableHighwayTypeFilter, config.enableOneWayFilter, 
      config.allowedHighwayTypes, config.minkowskiDistanceParameter, 
      10000000000000, dummyUIUpdate, 'BFS'
    );
    
    if (bidBfsPath.length > 0) {
      results[6].totalTime = bidBfsTime;
      results[6].totalExploredNodes = bidBfsExplored;
      results[6].totalPathLength = calculatePathLength(bidBfsPath, graph);
      results[6].successfulRuns = 1;
    }

    const [bidDijkstraPath, bidDijkstraTime, bidDijkstraExplored] = await bidirectionalSearch(
      xmlString, startNodeId, endNodeId, 
      config.enableHighwayTypeFilter, config.enableOneWayFilter, 
      config.allowedHighwayTypes, config.minkowskiDistanceParameter, 
      10000000000000, dummyUIUpdate, 'DIJKSTRA'
    );
    
    if (bidDijkstraPath.length > 0) {
      results[7].totalTime = bidDijkstraTime;
      results[7].totalExploredNodes = bidDijkstraExplored;
      results[7].totalPathLength = calculatePathLength(bidDijkstraPath, graph);
      results[7].successfulRuns = 1;
    }

    const [bidGreedyPath, bidGreedyTime, bidGreedyExplored] = await bidirectionalSearch(
      xmlString, startNodeId, endNodeId, 
      config.enableHighwayTypeFilter, config.enableOneWayFilter, 
      config.allowedHighwayTypes, config.minkowskiDistanceParameter, 
      10000000000000, dummyUIUpdate, 'GREEDY'
    );
    
    if (bidGreedyPath.length > 0) {
      results[8].totalTime = bidGreedyTime;
      results[8].totalExploredNodes = bidGreedyExplored;
      results[8].totalPathLength = calculatePathLength(bidGreedyPath, graph);
      results[8].successfulRuns = 1;
    }

    const [bidAstarPath, bidAstarTime, bidAstarExplored] = await bidirectionalSearch(
      xmlString, startNodeId, endNodeId, 
      config.enableHighwayTypeFilter, config.enableOneWayFilter, 
      config.allowedHighwayTypes, config.minkowskiDistanceParameter, 
      10000000000000, dummyUIUpdate, 'ASTAR'
    );
    
    if (bidAstarPath.length > 0) {
      results[9].totalTime = bidAstarTime;
      results[9].totalExploredNodes = bidAstarExplored;
      results[9].totalPathLength = calculatePathLength(bidAstarPath, graph);
      results[9].successfulRuns = 1;
    }

  } catch (error) {
    console.error('Error running test case:', error);
  }

  return { results, shortestPathLength };
}

// Calculate final metrics
function calculateMetrics(
  aggregatedResults: AlgorithmResult[], 
  totalGraphNodes: number, 
  numTestCases: number,
  totalShortestPathLength: number
): TestMetrics[] {
  return aggregatedResults.map(result => ({
    averageTimeComplexity: result.successfulRuns > 0 ? result.totalTime / result.successfulRuns : 0,
    exploredRatio: result.successfulRuns > 0 ? (result.totalExploredNodes / result.successfulRuns) / totalGraphNodes : 0,
    pathRatio: result.successfulRuns > 0 && totalShortestPathLength > 0 ? 
      (result.totalPathLength / result.successfulRuns) / (totalShortestPathLength / numTestCases) : 0
  }));
}

// Generate test cases with seeded random
function generateTestCases(graph: any, numTestCases: number, seed: number): Array<[string, string]> {
  const rng = new SeededRandom(seed);
  const testCases: Array<[string, string]> = [];
  
  for (let i = 0; i < numTestCases; i++) {
    const [startNodeId, endNodeId] = getRandomNodeIds(graph, rng, 2);
    testCases.push([startNodeId, endNodeId]);
  }
  
  return testCases;
}

// Main test function with reproducible results
export async function runAlgorithmPerformanceTest(
  customConfig?: Partial<TestConfig>
): Promise<void> {
  const config = { ...DEFAULT_TEST_CONFIG, ...customConfig };
  
  console.log('🚀 Starting Reproducible Algorithm Performance Test...');
  console.log(`📊 Test Configuration:`, config);
  console.log(`🎲 Random Seed: ${config.randomSeed}`);
  
  try {
    // Load OSM file
    console.log('📂 Loading OSM file...');
    const xmlString = await loadOSMFile(config.osmFilePath);
    
    // Build graph
    console.log('🏗️  Building graph from OSM data...');
    const graph = buildGraphFromOSM(
      xmlString,
      config.enableHighwayTypeFilter,
      config.enableOneWayFilter,
      config.allowedHighwayTypes
    );
    
    const totalGraphNodes = Object.keys(graph).length;
    console.log(`📈 Graph built with ${totalGraphNodes} nodes`);
    
    // Generate reproducible test cases
    console.log('🧪 Generating reproducible test cases...');
    const testCases = generateTestCases(graph, config.numTestCases, config.randomSeed!);
    
    // Log test cases for verification
    console.log('📋 Test Cases:');
    testCases.forEach((testCase, index) => {
      console.log(`  ${index + 1}: ${testCase[0]} → ${testCase[1]}`);
    });
    
    // Initialize aggregated results
    const aggregatedResults: AlgorithmResult[] = [
      { name: 'DFS', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 },
      { name: 'BFS', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 },
      { name: 'Dijkstra', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 },
      { name: 'Greedy', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 },
      { name: 'A*', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 },
      { name: 'Bidirectional-DFS', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 },
      { name: 'Bidirectional-BFS', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 },
      { name: 'Bidirectional-Dijkstra', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 },
      { name: 'Bidirectional-Greedy', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 },
      { name: 'Bidirectional-A*', totalTime: 0, totalExploredNodes: 0, totalPathLength: 0, successfulRuns: 0 }
    ];
    
    let totalShortestPathLength = 0;
    
    // Run test cases
    console.log(`🧪 Running ${config.numTestCases} test cases...`);
    for (let i = 0; i < testCases.length; i++) {
      const [startNodeId, endNodeId] = testCases[i];
      
      console.log(`Test case ${i + 1}/${config.numTestCases}: ${startNodeId} → ${endNodeId}`);
      
      const { results, shortestPathLength } = await runSingleTestCase(
        xmlString, graph, startNodeId, endNodeId, config
      );
      
      // Aggregate results
      for (let j = 0; j < results.length; j++) {
        aggregatedResults[j].totalTime += results[j].totalTime;
        aggregatedResults[j].totalExploredNodes += results[j].totalExploredNodes;
        aggregatedResults[j].totalPathLength += results[j].totalPathLength;
        aggregatedResults[j].successfulRuns += results[j].successfulRuns;
      }
      
      if (shortestPathLength !== Infinity) {
        totalShortestPathLength += shortestPathLength;
      }
    }
    
    // Calculate final metrics
    const metrics = calculateMetrics(
      aggregatedResults, 
      totalGraphNodes, 
      config.numTestCases,
      totalShortestPathLength
    );
    
    // Output results in CSV format
    console.log('\n📊 ALGORITHM PERFORMANCE RESULTS (CSV FORMAT)');
    console.log('='.repeat(60));
    console.log(`Random Seed: ${config.randomSeed}`);
    console.log('Algorithm,Average Time (ms),Explored Ratio,Path Ratio');
    
    for (let i = 0; i < aggregatedResults.length; i++) {
      const result = aggregatedResults[i];
      const metric = metrics[i];
      
      console.log(
        `${result.name},${metric.averageTimeComplexity.toFixed(4)},${metric.exploredRatio.toFixed(6)},${metric.pathRatio.toFixed(4)}`
      );
    }
    
    console.log('\n✅ Algorithm performance test completed successfully!');
    console.log(`📝 Total successful test cases: ${config.numTestCases}`);
    console.log(`🌐 Total graph nodes: ${totalGraphNodes}`);
    console.log(`🎲 Random seed used: ${config.randomSeed} (use this seed to reproduce results)`);
    
  } catch (error) {
    console.error('❌ Error running algorithm performance test:', error);
    throw error;
  }
}
