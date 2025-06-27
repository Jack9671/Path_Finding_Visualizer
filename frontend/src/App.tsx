import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { buildGraphFromOSM} from './getGraph'; // Adjust the import path as needed
import { aStarSearch, dijkstraSearch, greedyBestFirstSearch, bidirectionalSearch, breadthFirstSearch, depthFirstSearch, SearchStrategy } from './AlgorithmToolkit'; // Adjust the import path as needed
import { computeGlobalSequence, computeLocalSequence } from './BestDestinationOrderToolkit'; // Adjust the import path as needed
import {runAlgorithmPerformanceTest} from './test'; 
import { generatePrimMazeOSM, generateFullGrid } from './MazeGenerator'; // Adjust the import path as needed
import { randInt } from 'three/src/math/MathUtils';
// Parse OSM file and convert to ForceGraph format for drawing
async function parseOSMData(xmlString: string): Promise<{ 
  nodes:Array<{
    id: string;
    x: number;
    y: number;}>; 
  links: Array<{
    source: string;
    target: string;
    weight: number;
    highwayType: string;
    name: string;
    oneWay: string;
    state: 'unvisited' | 'visited' | 'solution';}>  }> 
  {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    const nodes: { id: string; x: number; y: number }[] = [];
    const links: {
        source: string;
        target: string;
        weight: number;
        highwayType: string;
        name: string;
        oneWay: string;
        state: 'unvisited' | 'visited' | 'solution';
    }[] = [];
    const nodeMap = new Map<string, { id: string; x: number; y: number }>();
    const lonList: number[] = [];
    const latList: number[] = [];
    const nodeElements = xmlDoc.getElementsByTagName('node');
    for (let i = 0; i < nodeElements.length; i++) {
        const node = nodeElements[i];
        const id = node.getAttribute('id')!;
        const lat = parseFloat(node.getAttribute('lat')!);
        const lon = parseFloat(node.getAttribute('lon')!);
        lonList.push(lon);
        latList.push(lat);
        nodeMap.set(id, { id, x: lon, y: lat });
    }
  let lonMin = Infinity, lonMax = -Infinity;
  for (const lon of lonList) {
    if (lon < lonMin) lonMin = lon;
    if (lon > lonMax) lonMax = lon;
  }
  let latMin = Infinity, latMax = -Infinity;
  for (const lat of latList) {
    if (lat < latMin) latMin = lat;
    if (lat > latMax) latMax = lat;
  }

  const lonCenter = (lonMin + lonMax) / 2;
  const latCenter = (latMin + latMax) / 2;
    const scale = 12000;
    for (const [id, { x: lon, y: lat }] of nodeMap) {
        nodes.push({
            id,
            x: (lon - lonCenter) * scale,
            y: -(lat - latCenter) * scale
        });
    }
    const wayElements = xmlDoc.getElementsByTagName('way');
    for (let i = 0; i < wayElements.length; i++) {
        const way = wayElements[i];
        const ndElements = way.getElementsByTagName('nd');
        let highwayType = '';
        let name = '';
        let oneWay = 'no';
        const tagElements = way.getElementsByTagName('tag');
        for (let j = 0; j < tagElements.length; j++) {
            const key = tagElements[j].getAttribute('k');
            const value = tagElements[j].getAttribute('v');
            if (key === 'highway') highwayType = value || '';
            if (key === 'name') name = value || '';
            if (key === 'oneway') oneWay = value || 'no';
        }
        if (!highwayType) continue;
        for (let j = 0; j < ndElements.length - 1; j++) {
            const sourceId = ndElements[j].getAttribute('ref')!;
            const targetId = ndElements[j + 1].getAttribute('ref')!;
            const sourceNode = nodeMap.get(sourceId);
            const targetNode = nodeMap.get(targetId);
            if (sourceNode && targetNode) {
                const dx = (targetNode.x - sourceNode.x);
                const dy = (targetNode.y - sourceNode.y);
                const weight = Math.sqrt(dx * dx + dy * dy)
                const baseLink = {
                    source: sourceId,
                    target: targetId,
                    weight,
                    highwayType,
                    name,
                    oneWay,
                    state: 'unvisited' as const
                };
                links.push(baseLink);
                if (oneWay !== 'yes') {
                    links.push({ ...baseLink, source: targetId, target: sourceId });
                }
            }
        }
    }
    return { nodes, links };
}

// Utility function to check if point is in viewport bounds
const isInViewport = (x: number, y: number, bounds: { left: number; right: number; top: number; bottom: number }, margin: number = 100) => {
  return x >= bounds.left - margin && 
         x <= bounds.right + margin && 
         y >= bounds.top - margin && 
         y <= bounds.bottom + margin;
};

// Level of Detail (LOD) function based on zoom level
//when zoom in, the value increases
const getLOD = (zoom: number) => {
  if (zoom > 8) return 'level_1_of_less_detail';
  if (zoom > 4) return 'level_2_of_less_detail';
  if (zoom > 2) return 'level_3_of_less_detail';
  if (zoom > 1.3) return 'level_4_of_less_detail';
  return 'level_5_of_less_detail'; // 'level_5_of_detail' lowest detail
}; //lower levels mean more detail, higher levels mean less detail


const Screen: React.FC = () => {
  const [uploadedFileName, setUploadedFileName] = useState(null); // Store the name of the uploaded file
  const [fullGraphData, setFullGraphData] = useState<{ 
    nodes: Array<{
      id: string;
      x: number;
      y: number;
    }>; 
    links: Array<{
      source: string;
      target: string;
      weight: number;
      highwayType: string;
      name: string;
      oneWay: string;
      state: 'unvisited' | 'visited' | 'solution';
    }>
  }>({ nodes: [], links: [] });
  const [osmContent, setOsmContent] = useState<string>(''); // Store the OSM XML content
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<SearchStrategy>('ASTAR'); // Default to A* search algorithm
  const [startNode, setStartNode] = useState(null);// Changed from string to null
  const [endNodes, setEndNodes] = useState<string[]>([]); // Changed from single endNode
  const [segmentColors, setSegmentColors] = useState<Record<string, string>>({}); // Store colors for each segment
  const [useGlobalOptimal, setUseGlobalOptimal] = useState(true); // Toggle between global and local optimization in determining a sequence of end nodes to visit
  const [segmentDistances, setSegmentDistances] = useState<number[]>([]); // Store distances for each segment
  const [randomCount, setRandomCount] = useState<number>(1);// How many random end nodes to select
  const [segmentSolutionNodes, setSegmentSolutionNodes] = useState<number[]>([]); // Store solution nodes for the current segment
  const [totalSearchDuration, setTotalSearchDuration] = useState<number | null>(null); // Store total search duration for all segments
  const [segmentSearchDurations, setSegmentSearchDurations] = useState<number[]>([]); // Store search durations for each segment
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number | null>(null); // Track which segment is highlighted
  const [pathSegments, setPathSegments] = useState<Array<{start: string, end: string, path: string[], color: string}>>([]); // Store segments with their paths and colors
  const [enableHighwayTypeFilter, setEnableHighwayTypeFilter] = useState(false);
  const [enableOneWayFilter, setEnableOneWayFilter] = useState(false);
  const [allowedHighwayTypes, setAllowedHighwayTypes] = useState<string[]>([
    "road", "path", "trunk", "trunk_link", "primary", "primary_link",
    "secondary", "secondary_link", "tertiary", "tertiary_link",
    "unclassified", "motorway", "motorway_link", "cycleway", "service", "residential", 'residential_link', 'living_street', 'track','construction'
  ]);
  const [MinkowskiDistanceParameter, setMinkowskiDistanceParameter] = useState(2); // Default to Euclidean distance
  const [cyclicNumberOfVisitedNodesForUIupdate, setCyc] = useState(10); // Default to update UI for every 100 new visited nodes
  const [isSearching, setIsSearching] = useState(false);
  const [clickMode, setClickMode] = useState<'start' | 'end' | null>(null);
  const [enableLowerDetail, setEnableLowerDetail] = useState(false); // Toggle for lower detail levels
  const [allAvailableHighwayTypes, setAllAvailableHighwayTypes] = useState([
    "road", "path", "trunk", "trunk_link", "primary", "primary_link",
    "secondary", "secondary_link", "tertiary", "tertiary_link",
    "unclassified", "motorway", "motorway_link", "cycleway", 
    "service", "residential", "residential_link", "living_street", 
    "track", "construction"
  ]); // All available highway types to choose from
  const [newHighwayType, setNewHighwayType] = useState(''); // New highway type input to be added
  const [enableBidirectionalSearch, setEnableBidirectionalSearch] = useState(false); // Toggle for bidirectional search algorithm
  const [totalVisitedNodeCount, setTotalVisitedNodeCount] = useState(0);// Total count of visited nodes across all segments
  const [segmentVisitedNodeCounts, setSegmentVisitedNodeCounts] = useState<number[]>([]);
  const [viewportBounds, setViewportBounds] = useState({ left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity });
  const [currentZoom, setCurrentZoom] = useState(8); // Default zoom level
  const [totalDistance, setTotalDistance] = useState<number>(0); // Total distance of the solution path
  const [routes, setRoutes] = useState<string[]>([]); // Routes for the solution path as an array of route name like ["Nguyen Van Cu", "Le Loi", "Tran Hung Dao",...]
  const forceGraphRef = useRef<any>(null); // Reference to the ForceGraph instance

  // USED TO SET THE INITIAL ZOOM LEVEL
  useEffect(() => {
    if (forceGraphRef.current) {
      forceGraphRef.current.zoom(currentZoom, 0)
    }
  }, []);
  // USED TO LOAD OSM DATA WHEN THE COMPONENT MOUNTS
  useEffect(() => {
    const loadOSMData = async () => {
      try {
        const response = await fetch(uploadedFileName)
        const xmlString = await response.text();
        setOsmContent(xmlString);
        const parsedData = await parseOSMData(xmlString);
        setFullGraphData(parsedData);
      } catch (error) {
        console.error('Error loading OSM data:', error);
      }
    }
    loadOSMData();
  }, []);
 // USED TO UPDATE THE GRAPH DATA WHEN OSM CONTENT CHANGES
useEffect(() => {
  // If there’s nothing to display, reset solution nodes and bail out early
  if (pathSegments.length === 0) {
    setSegmentSolutionNodes([]);
    return;
  }

  // Determine which sequence of node IDs to use:
  // - If currentSegmentIndex is null, flatten all segments into one continuous path
  // - Otherwise, use just the selected segment’s path
  const sequence: string[] = currentSegmentIndex === null
    ? pathSegments.reduce<string[]>((acc, seg, i) => {
        // For the very first segment, take its full path
        if (i === 0) return [...seg.path];
        // For subsequent segments, skip the first node to avoid duplicates
        return [...acc, ...seg.path.slice(1)];
      }, [])
    : [...pathSegments[currentSegmentIndex].path];

  // 1) Regenerate the turn-by-turn directions based on that sequence
  generateDirections(sequence, osmContent);

  // 2) Update the set of solution nodes to highlight in the UI
  setSegmentSolutionNodes(sequence);
}, [pathSegments, currentSegmentIndex, osmContent]);
  
  //USED TO ENABLE LOWER DETAIL LEVELS FUNCTIONALITY
  const filteredGraphDataType1 = useMemo(() => {
    if (!fullGraphData.nodes.length) return fullGraphData;
    const lod = getLOD(currentZoom);
    const margin = currentZoom > 3 ? 200 : 500; // Smaller margin when zoomed in
    // Filter nodes based on viewport
    const visibleNodes = fullGraphData.nodes.filter(node => 
      isInViewport(node.x, node.y, viewportBounds, margin)
    );
    // Create a set of visible node IDs for quick lookup
    const visibleNodeIds = new Set(visibleNodes.map(node => node.id));
    // Filter links - only include if both nodes are visible OR if it's an important link (solution/visited)
    const visibleLinks = fullGraphData.links.filter(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      // Always include solution and visited links, even if nodes might be filtered
      if (link.state === 'solution' || link.state === 'visited') {
        return true;
      }
      // For regular links, both nodes must be visible
      return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
    });
    // Apply LOD filtering
    let finalNodes = visibleNodes;
    let finalLinks = visibleLinks;
    if (lod === 'level_5_of_less_detail') {
      //filter condition:
      // 1) keep links that that satisfy the highway type (exception links are links that are part of the solution or visited and show them no matter what)
      const l = 1 // Show 1 in every l link (not used yet)
      const visibleHighwayTypess = [
        "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link"];
      finalLinks = visibleLinks.filter(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        const highwayType = link.highwayType;
        // Always include solution and visited links
        if (link.state === 'solution') {
          // || link.state === 'visited') {
          return true;
        }
        // Include links with important highway types
        return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId) &&
          (visibleHighwayTypess.includes(highwayType) || highwayType === 'unknown');
      });
    }
    else if (lod === 'level_4_of_less_detail') {
      //filter condition:
      // 1) keep links that that satisfy the highway type (exception links are links that are part of the solution or visited and show them no matter what)
      const l = 1 // Show 1 in every l link (not used yet)
      const visibleHighwayTypess = [
        "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link",
        "motorway", "motorway_link"]
      finalLinks = visibleLinks.filter(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        const highwayType = link.highwayType;
        // Always include solution and visited links
        if (link.state === 'solution') {
          //|| link.state === 'visited') {
          return true;
        }
        // Include links with important highway types
        return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId) && (visibleHighwayTypess.includes(highwayType) || highwayType === 'unknown');
      });

    } else if (lod === 'level_3_of_less_detail') {
      // Filter condition: 
      //1) show 1 in every l links of 'residential,service,footway' type, but always show solution/visited links
      const l = 10;
      let residentialCount = 0;
      finalLinks = visibleLinks.filter(link => {
        const isSolutionOrVisited = link.state === 'solution' //|| link.state === 'visited';
        if (isSolutionOrVisited) return true;
        if (link.highwayType === 'residential' || link.highwayType === 'service' || link.highwayType === 'footway') {
          residentialCount++;
          return residentialCount % l === 0;
        }
        // For other types, keep all
        return true;
      });
    } else if (lod === 'level_2_of_less_detail') {
      // Filter condition: 
      //1) show 1 in every l links of 'residential' type, but always show solution/visited links
      const l = 7;
      let residentialCount = 0;
      finalLinks = visibleLinks.filter(link => {
        const isSolutionOrVisited = link.state === 'solution' //|| link.state === 'visited';
        if (isSolutionOrVisited) return true;
        if (link.highwayType === 'residential') {
          residentialCount++;
          return residentialCount % l === 0;
        }
        // For other types, keep all
        return true;
      });
    }

    const linkedNodeIds = new Set();
    finalLinks.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      linkedNodeIds.add(sourceId);
      linkedNodeIds.add(targetId);
    });

    // Add any missing nodes that are referenced by links
    const existingNodeIds = new Set(finalNodes.map(node => node.id));
    const missingNodes = fullGraphData.nodes.filter(node => 
      linkedNodeIds.has(node.id) && !existingNodeIds.has(node.id)
    );
    finalNodes = [...finalNodes, ...missingNodes];
    return { nodes: finalNodes, links: finalLinks };
  }, [fullGraphData, viewportBounds, currentZoom]);

 // USED WHEN DISABLED LOWER DETAIL LEVELS, THE FUNCTION SELECT NODES AND LINKS WITHIN VIEWPORT TO DISPLAY
  const filteredGraphDataType2 = useMemo(() => {
    if (!fullGraphData.nodes.length) return fullGraphData;
    const margin = currentZoom > 3 ? 200 : 500; // Smaller margin when zoomed in
    // Filter nodes based on viewport
    const visibleNodes = fullGraphData.nodes.filter(node => 
      isInViewport(node.x, node.y, viewportBounds, margin)
    );
    // Create a set of visible node IDs for quick lookup
    const visibleNodeIds = new Set(visibleNodes.map(node => node.id));
    // Filter links - only include if both nodes are visible OR if it's an important link (solution/visited)
    const visibleLinks = fullGraphData.links.filter(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      // Always include solution and visited links, even if nodes might be filtered
      if (link.state === 'solution' || link.state === 'visited') {
        return true;
      }
      // For regular links, both nodes must be visible
      return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
    });
    // not aplly LOD filtering
    let finalNodes = visibleNodes;
    let finalLinks = visibleLinks;

    const linkedNodeIds = new Set();
    finalLinks.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      linkedNodeIds.add(sourceId);
      linkedNodeIds.add(targetId);
    });

    // Add any missing nodes that are referenced by links
    const existingNodeIds = new Set(finalNodes.map(node => node.id));
    const missingNodes = fullGraphData.nodes.filter(node => 
      linkedNodeIds.has(node.id) && !existingNodeIds.has(node.id)
    );
    finalNodes = [...finalNodes, ...missingNodes];
    return { nodes: finalNodes, links: finalLinks };
  }, [fullGraphData, viewportBounds, currentZoom]);

  // USED TO UPDATE THE VIEWPORT BOUNDS AND ZOOM LEVEL
  const updateViewport = useCallback(
    (() => {
      let timeoutId: number;
      return (transform?: any) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          if (forceGraphRef.current) {
            try {
              // Get zoom transform from the provided parameter or from the graph
              const zoom = transform?.k || forceGraphRef.current.zoom() || 1;
              const centerX = transform?.x || 0;
              const centerY = transform?.y || 0;

              // Use window dimensions as fallback
              const width = window.innerWidth;
              const height = window.innerHeight;
              const halfWidth = width / (2 * zoom);
              const halfHeight = height / (2 * zoom);

              setViewportBounds({
                left: centerX - halfWidth,
                right: centerX + halfWidth,
                top: centerY - halfHeight,
                bottom: centerY + halfHeight
              });
              setCurrentZoom(zoom);
            } catch (error) {
              console.warn('Error updating viewport:', error);
            }
          }
        }, 300); // 300ms debounce means the viewport updates after 300ms of inactivity
      };
    })(),
    []
  );

// USED TO UPDATE INFOMRATION DISPLAYED ON THE UI
const updateUIInfor = (
  visitedNodes: Set<string>,
  solutionPath: string[],
  segmentKey?: string
) => {
  let pathDistance = 0;

  setFullGraphData(prevData => {
    const updatedLinks = prevData.links.map(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      let isSolutionEdge = false;

      // Identify solution edges and accumulate their weight
      for (let i = 0; i < solutionPath.length - 1; i++) {
        const u = solutionPath[i];
        const v = solutionPath[i + 1];
        if (
          (u === sourceId && v === targetId) ||
          (u === targetId && v === sourceId)
        ) {
          isSolutionEdge = true;
          pathDistance += link.weight/2;
          break;
        }
      }

      if (isSolutionEdge && segmentKey) {
        const color = segmentColors[segmentKey] || 'yellow';
        const existingSegments = link.segments || [];
        const existingIndex = existingSegments.findIndex(seg => seg.key === segmentKey);

        let updatedSegments: { key: string; color: string }[];
        if (existingIndex >= 0) {
          updatedSegments = [...existingSegments];
          updatedSegments[existingIndex] = { key: segmentKey, color };
        } else {
          updatedSegments = [...existingSegments, { key: segmentKey, color }];
        }

        return {
          ...link,
          state: 'solution' as const,
          segments: updatedSegments,
          segmentColor: color,
          segmentKey
        };
      } else if (visitedNodes.has(sourceId) || visitedNodes.has(targetId)) {
        if (link.state !== 'solution') {
          return { ...link, state: 'visited' as const };
        }
        return link;
      } else {
        if (link.state === 'solution') {
          return link;
        }
        return { ...link, state: 'unvisited' as const };
      }
    });

    // Update global totals
    const empiricalFactor = 11900 / 152; // Empirical factor to adjust distance to match result in google maps
    setTotalVisitedNodeCount(prev => prev + visitedNodes.size);
    setTotalDistance(prev => prev + pathDistance * empiricalFactor);

    // Compute this segment’s distance
    const segDist = pathDistance * empiricalFactor;

    // Update per-segment distances
    if (segmentKey) {
      const [s, e] = segmentKey.split('-');
      setSegmentDistances(prev => {
        const idx = pathSegments.findIndex(seg => seg.start === s && seg.end === e);
        if (idx >= 0) {
          const upd = [...prev];
          upd[idx] = segDist;
          return upd;
        } else {
          return [...prev, segDist];
        }
      });

      // Update per-segment visited-node counts
      setSegmentVisitedNodeCounts(prev => {
        const visitedCount = visitedNodes.size;
        const idx = pathSegments.findIndex(seg => seg.start === s && seg.end === e);
        if (idx >= 0) {
          const upd = [...prev];
          upd[idx] = visitedCount;
          return upd;
        } else {
          return [...prev, visitedCount];
        }
      });
    }

    // Track segments for UI switching
    if (segmentKey) {
      const [startNode, endNode] = segmentKey.split('-');
      const newSegment = {
        start: startNode,
        end: endNode,
        path: solutionPath,
        color: segmentColors[segmentKey]
      };
      setPathSegments(prev => {
        const existingIndex = prev.findIndex(
          seg => seg.start === startNode && seg.end === endNode
        );
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = newSegment;
          return updated;
        } else {
          return [...prev, newSegment];
        }
      });
    }

    return {
      nodes: [...prevData.nodes],
      links: updatedLinks
    };
  });
};

//USED TO GIVE HIGHLIGHT TO A SEGMENT
const highlightSegment = (segmentIndex: number | null) => {
  setCurrentSegmentIndex(segmentIndex);
  
  setFullGraphData(prevData => ({
    ...prevData,
    links: prevData.links.map(link => {
      if (link.state === 'solution') {
        if (segmentIndex === null) {
          // Show all segments - use a blended approach or show the most recent
          if (link.segments && link.segments.length > 0) {
            // Show all segments by using the first color or creating a blend
            const colors = link.segments.map(seg => seg.color);
            // For simplicity, use the first color, but you could implement blending
            return { ...link, segmentColor: colors[0] };
          }
          return { ...link, segmentColor: link.segmentColor || 'yellow' };
        } else {
          // Show only selected segment, dim others
          const selectedSegment = pathSegments[segmentIndex];
          if (selectedSegment && link.segments) {
            const segmentKey = `${selectedSegment.start}-${selectedSegment.end}`;
            const hasSelectedSegment = link.segments.some(seg => seg.key === segmentKey);
            
            if (hasSelectedSegment) {
              return { ...link, segmentColor: selectedSegment.color };
            } else {
              return { ...link, segmentColor: 'rgba(128, 128, 128, 0.3)' };
            }
          } else {
            // Fallback to original logic
            const segmentKey = selectedSegment ? `${selectedSegment.start}-${selectedSegment.end}` : '';
            if (link.segmentKey === segmentKey) {
              return { ...link, segmentColor: selectedSegment?.color || 'yellow' };
            } else {
              return { ...link, segmentColor: 'rgba(128, 128, 128, 0.3)' };
            }
          }
        }
      }
      return link;
    })
  }));
};

// MAIN AND IMPORTANT FUNCTION TO RUN THE SEARCH ALGORITHM
const runSearch = async () => {
  if (!osmContent || isSearching || !startNode || endNodes.length === 0) return;

  setIsSearching(true);
  setTotalDistance(0);
  setRoutes([]);
  setTotalVisitedNodeCount(0);
  setSegmentVisitedNodeCounts([]);   // ← clear out old per-segment counts

  // Reset per-segment and total timings
  setTotalSearchDuration(null);
  setSegmentSearchDurations([]);

  // Reset all links to unvisited and clear segment information
  setFullGraphData(prevData => ({
    ...prevData,
    links: prevData.links.map(link => ({
      ...link,
      state: 'unvisited',
      segmentColor: undefined,
      segmentKey: undefined,
      segments: undefined
    }))
  }));

  try {
    // Parse OSM to get coordinates for optimization
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(osmContent, 'text/xml');
    const coords: Record<string, { x: number, y: number }> = {};
    const nodeElements = xmlDoc.getElementsByTagName('node');
    for (let i = 0; i < nodeElements.length; i++) {
      const node = nodeElements[i];
      const id = node.getAttribute('id')!;
      const lat = parseFloat(node.getAttribute('lat')!);
      const lon = parseFloat(node.getAttribute('lon')!);
      coords[id] = { x: lon, y: lat };
    }

    // Compute optimal sequence
    const sequence = useGlobalOptimal
      ? computeGlobalSequence(startNode, endNodes, coords)
      : computeLocalSequence(startNode, endNodes, coords);

    // Generate unique colors for each segment
    const segmentColors: Record<string, string> = {};
    const colorPalette = ['yellow', 'rgba(220, 220, 3, 0.79)'];
    for (let i = 0; i < sequence.length - 1; i++) {
      const key = `${sequence[i]}-${sequence[i + 1]}`;
      segmentColors[key] = colorPalette[i % colorPalette.length];
    }
    setSegmentColors(segmentColors);
    setPathSegments([]);
    setCurrentSegmentIndex(null);
    setSegmentDistances([]); // Reset segment distances

    // Execute search for each segment, collecting results and durations
    let totalDuration = 0;
    
    for (let i = 0; i < sequence.length - 1; i++) {
      const currentStart = sequence[i];
      const currentEnd = sequence[i + 1];
      const segmentKey = `${currentStart}-${currentEnd}`;

      // Dispatch to the chosen search algorithm
      const commonArgs = [
        osmContent,
        currentStart,
        currentEnd,
        enableHighwayTypeFilter,
        enableOneWayFilter,
        allowedHighwayTypes,
        MinkowskiDistanceParameter,
        cyclicNumberOfVisitedNodesForUIupdate,
        (visited: Set<string>, solution: string[]) =>
          updateUIInfor(visited, solution, segmentKey)
      ] as const;

      let result: [string[], number];

      if (enableBidirectionalSearch) {
        result = await bidirectionalSearch(...commonArgs, selectedAlgorithm);
      } else if (selectedAlgorithm === 'ASTAR') {
        result = await aStarSearch(...commonArgs);
      } else if (selectedAlgorithm === 'DIJKSTRA') {
        result = await dijkstraSearch(...commonArgs);
      } else if (selectedAlgorithm === 'GREEDY') {
        result = await greedyBestFirstSearch(...commonArgs);
      } else if (selectedAlgorithm === 'BFS') {
        result = await breadthFirstSearch(...commonArgs);
      } else if (selectedAlgorithm === 'DFS') {
        result = await depthFirstSearch(...commonArgs);
      } else {
        throw new Error(`Unknown algorithm: ${selectedAlgorithm}`);
      }

      // Extract path and duration from result
      const [path, duration] = result;
      
      // Store per-segment duration
      setSegmentSearchDurations(prev => [...prev, duration]);
      totalDuration += duration;
    }

    // Set total search duration
    setTotalSearchDuration(totalDuration);

  } catch (error) {
    console.error('Error running multi-end search:', error);
  }

  setIsSearching(false);
};

  // USED TO GENERATE TURN-BY-TURN DIRECTIONS BASED ON THE SOLUTION PATH
  const generateDirections = (solutionPath: string[], osmContent: string) => {
    if (solutionPath.length < 2) {
      setRoutes([]);
      return;
    }

    const graph = buildGraphFromOSM(
      osmContent, 
      enableHighwayTypeFilter, 
      enableOneWayFilter, 
      allowedHighwayTypes
    );

    const directionsList: string[] = [];
    let currentRoadName = '';

    for (let i = 0; i < solutionPath.length - 1; i++) {
      const currentNodeId = solutionPath[i];
      const nextNodeId = solutionPath[i + 1];

      // Find the road name for this segment
      const currentNode = graph[currentNodeId];
      if (currentNode) {
        const adjacentNode = currentNode.inforOfAllAdjacentNodes.find(
          adj => adj.adjacentNodeId === nextNodeId
        );

        if (adjacentNode) {
          const roadName = adjacentNode.name !== 'unknown' ? adjacentNode.name : 'Unnamed Road';

          // Only add direction if road name changes or it's the first segment
          if (roadName !== currentRoadName) {
            if (i === 0) {
              directionsList.push(`${roadName}`);
            } else {
              directionsList.push(`${roadName}`);
            }
            currentRoadName = roadName;
          }
        }
      }
    }
    setRoutes(directionsList);
  };




// // USED TO PICK RANDOM END NODES EXCLUDING THE START NODE
const pickRandomEndNodes = () => {
  if (!fullGraphData.nodes.length || !startNode) return;

  // collect all candidate IDs, excluding the start node
  const candidates = fullGraphData.nodes
    .map(n => n.id)
    .filter(id => id !== startNode);

  // clamp randomCount to [1, candidates.length]
  const count = Math.min(Math.max(randomCount, 1), candidates.length);

  // Fisher–Yates shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  // take first -count-
  setEndNodes(candidates.slice(0, count));
};

// HANDLER FOR CLICKING ON NODES 
const handleNodeClick = (node: any) => {
  if (!node?.id) return;

  // ─── DELETE WHEN NO MODE ──────────────────────────
  if (clickMode === null) {
    // click on start → clear it
    if (node.id === startNode) {
      setStartNode(null);
      return;
    }
    // click on an end → remove from endNodes
    if (endNodes.includes(node.id)) {
      setEndNodes(prev => prev.filter(id => id !== node.id));
      return;
    }
  }

  // ─── EXISTING BEHAVIOR ────────────────────────────
  if (clickMode === 'start') {
    setStartNode(node.id);
    setClickMode(null);
} else if (clickMode === 'end') {
  // ─── TOGGLE REMOVE IF ALREADY SELECTED ───────────
  if (endNodes.includes(node.id)) {
    // remove this end node
    setEndNodes(prev => prev.filter(id => id !== node.id));
    // if single-select mode, also exit clickMode

    return;
  }

  // ─── OTHERWISE ADD AS USUAL ──────────────────────
    setEndNodes(prev => [...prev, node.id]);
    // stay in end-mode so you can keep clicking

}
};


  // USED TO CUSTOMIZE THE RENDERING OF NODES IN THE FORCE GRAPH
const nodeCanvasObject = useCallback((node: any, ctx: any, globalScale: number) => {
  // Skip rendering if LOD is too low for this node
  const lod = getLOD(globalScale);
  if ((lod !== 'level_1_of_less_detail' && 
     node.id !== startNode && !endNodes.includes(node.id))) {return;} 
    // decide a raw radius for special vs ordinary
  const rawRadius = node.id === startNode || endNodes.includes(node.id)
    ? 18         // “big” for start/end
    : 0.3;         // fixed 0.3px for all other nodes

  // only divide by globalScale for the special nodes,
  // so that “ordinary” nodes stay at exactly 0.3px radius
  const radius = (node.id === startNode || endNodes.includes(node.id))
    ? rawRadius / globalScale
    : rawRadius;

  ctx.beginPath();
  ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);

  if (node.id === startNode) {
    // draw Start
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2 / globalScale;
    ctx.stroke();
    ctx.fillStyle = 'black';
    ctx.font = `${12 / globalScale}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S', node.x, node.y);

  } else if (endNodes.includes(node.id)) {
    // draw End
    ctx.fillStyle = 'red';
    ctx.fill();
    ctx.strokeStyle = 'darkred';
    ctx.lineWidth = 2 / globalScale;
    ctx.stroke();
    const pickOrder = endNodes.indexOf(node.id) + 1;
    ctx.fillStyle = 'white';
    ctx.font = `bold ${10 / globalScale}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pickOrder.toString(), node.x, node.y);

  } else {
    // ordinary nodes—always exactly 2px radius
    ctx.fillStyle = 'rgba(128, 128, 128, 0.7)';
    ctx.fill();
  }
}, [startNode, endNodes]);
  // Optimized link color function

  
  // USED TO GET THE LINK COLOR BASED ON ITS STATE AND SEGMENTS
const linkColor = useCallback((link: any) => {
  if (link.state === 'solution') {
    // If showing a specific segment, use that color
    if (currentSegmentIndex !== null && link.segments) {
      const selectedSegment = pathSegments[currentSegmentIndex];
      if (selectedSegment) {
        const segmentKey = `${selectedSegment.start}-${selectedSegment.end}`;
        const segment = link.segments.find(seg => seg.key === segmentKey);
        if (segment) {
          return segment.color;
        } else {
          return 'rgba(128, 128, 128, 0.3)'; // Dim if not part of selected segment
        }
      }
    }
    
    // Default: show all segments (could implement blending here)
    if (link.segments && link.segments.length > 0) {
      // For now, just use the first segment's color
      // programmer could implement color blending for overlapping segments
      return link.segments[0].color;
    }
    
    return link.segmentColor || 'yellow';
  }
  if (link.state === 'visited') return 'rgba(255, 255, 255, 0.88)';

  const highwayClassColors = {
    trunk: 'rgba(255, 182, 93, 0.99)',        
    trunk_link: 'rgba(255, 182, 93, 0.99)',
    primary: 'rgba(146, 212, 156, 0.9)',      
    primary_link: 'rgba(146, 212, 156, 0.9)',
    secondary: 'rgb(237, 116, 116)',      
    secondary_link: 'rgb(237, 116, 116)',
    tertiary: 'rgb(121, 121, 121)',
    tertiary_link: 'rgb(121, 121, 121)',
  };

  return highwayClassColors[link.highwayType] || 'rgba(128, 128, 128, 0.96)';
}, [currentSegmentIndex, pathSegments]);

  // USED TO GET THE LINK LABEL BASED ON ITS STATE AND SEGMENTS
  const getLinkLabel = useCallback((link: any) => {
    // Find the current state of this link from fullGraphData
    const source = typeof link.source === 'object' ? link.source.id : link.source;
    const target = typeof link.target === 'object' ? link.target.id : link.target;

    const currentLink = fullGraphData.links.find(l => {
      const lSource = typeof l.source === 'object' ? l.source.id : l.source;
      const lTarget = typeof l.target === 'object' ? l.target.id : l.target;
      return (lSource === source && lTarget === target) || (lSource === target && lTarget === source);
    });

    const state = currentLink?.state || 'unvisited';
    const stateText = state === 'solution' ? ' [SOLUTION PATH]' : 
      state === 'visited' ? ' [VISITED]' : '';

    return `${link.name} (${link.highwayType})${stateText}\nDistance: ${(link.weight* (11900000 / 152)).toFixed(2)} m`;
  }, [fullGraphData.links]);

  // USED TO ADD A NEW HIGHWAY TYPE
  const addHighwayType = () => {
    const trimmed = newHighwayType.trim();
    if (trimmed && !allAvailableHighwayTypes.includes(trimmed)) {
      // Validate format: only letters, numbers, underscores, and hyphens
      if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
        setAllAvailableHighwayTypes([...allAvailableHighwayTypes, trimmed]);
        setAllowedHighwayTypes([...allowedHighwayTypes, trimmed]);
        setNewHighwayType('');
      } else {
        alert('Invalid format. Use only letters, numbers, underscores, and hyphens.');
      }
    }
  };

  // USED TO HANDLE FILE UPLOAD
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.endsWith('.osm')) {
      try {
        const xmlString = await file.text();
        setOsmContent(xmlString);
        const parsedData = await parseOSMData(xmlString);
        setFullGraphData(parsedData);
        setUploadedFileName(file.name);
        // Reset search states
        setStartNode(null);
        setEndNodes([]);
        setTotalDistance(0);
        setRoutes([]);
      } catch (error) {
        console.error('Error loading uploaded OSM file:', error);
        alert('Error loading the OSM file. Please check the file format.');
      }
    } else {
      alert('Please select a valid .osm file');
    }
  };

  // USED TO GENERATE A MAZE USING PRIM'S ALGORITHM
const generateMaze = async () => {
  try {
    const xmlString = generatePrimMazeOSM( randInt(10, 50),
       0.0001, randInt(1, 9999));
    setOsmContent(xmlString);
    const parsedData = await parseOSMData(xmlString);
    setFullGraphData(parsedData);
    setUploadedFileName('Generated Maze');
    // Reset search states
    setStartNode(null);
    setEndNodes([]);
    setTotalDistance(0);
    setRoutes([]);
    setPathSegments([]);
    setCurrentSegmentIndex(null);
  } catch (error) {
    console.error('Error generating maze:', error);
    alert('Error generating maze. Please try again.');
  }
};
// USED TO GENERATE A FULL GRID wITHOUT MISSING LINKS
const generateFullGridMap = async () => {
  try {
    const xmlString = generateFullGrid(randInt(10, 50), 0.0001);
    setOsmContent(xmlString);
    const parsedData = await parseOSMData(xmlString);
    setFullGraphData(parsedData);
    setUploadedFileName('Generated Full Grid');
    // Reset search states
    setStartNode(null);
    setEndNodes([]);
    setTotalDistance(0);
    setRoutes([]);
    setPathSegments([]);
    setCurrentSegmentIndex(null);
  } catch (error) {
    console.error('Error generating full grid:', error);
    alert('Error generating full grid. Please try again.');
  }
};

  // USED TO RUN A runAlgorithmPerformanceTest file
  const runNumericalTest = async () => {
    if (isSearching) return;
    setIsSearching(true);
    console.clear();
    console.log('Running numerical performance test...');
    try {
      const testResults = await runAlgorithmPerformanceTest()
      console.log('Test completed successfully:', testResults);
      alert('Test completed successfully. Check console for results.');
    } catch (error) {
      console.error('Error during numerical performance test:', error);
      alert('Error during numerical performance test. Check console for details.');
    } finally {
      setIsSearching(false);
    }
  };
 // USED TO ALERT USERS NOT TO USE BRUTE FORCE WHEN NUMBER OF END NODES > 9
  useEffect(() => {
    if (endNodes.length > 9) {
      alert('Warning: Brute Force will take a large amount of time to run when the number of end nodes exceeds 9.I higtly recommend users to use the Nearest Neighbor algorithm instead.');
    }
  }, [endNodes.length]);
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', backgroundColor: '#101020' }}>
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          zIndex: 1000,
          backgroundColor: '#ffffff',
          padding: '16px',
          borderRadius: '8px',
          boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
          maxWidth: '380px',
          maxHeight: '85vh',
          overflowY: 'auto',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        {/* ←── File Upload ──→ */}
        <fieldset style={{ marginBottom: '12px', border: '1px solid #ccc', padding: '8px' }}>
          <legend style={{ fontSize: '14px', fontWeight: 'bold' }}>OSM File</legend>
          <div style={{ marginBottom: '8px' }}>
            <strong>Current:</strong> {uploadedFileName}
          </div>
          <input
            type="file"
            accept=".osm"
            onChange={handleFileUpload}
            style={{
              width: '100%',
              padding: '4px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '12px'
            }}
          />
          <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
            - Firstly, users select a portion of map at <a href="https://overpass-turbo.eu/" target="_blank" rel="noopener noreferrer">overpass-turbo</a> <br/>
            - Secondly, users export it as .osm file.<br/>
            - Finally, users upload the .osm file here to visualize pathfinding algorithms.
          </div>
        </fieldset>
{/* ←── Generate Toy Maps ──→ */}
<fieldset style={{ marginBottom: '12px', border: '1px solid #ccc', padding: '8px' }}>
  <legend style={{ fontSize: '14px', fontWeight: 'bold' }}>Generate Toy Maps</legend>
  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
    <button
      onClick={generateMaze}
      style={{
        flex: 1,
        padding: '8px',
        backgroundColor: '#FF6B6B',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '12px'
      }}
    >
      Generate Maze
    </button>
    <button
      onClick={generateFullGridMap}
      style={{
        flex: 1,
        padding: '8px',
        backgroundColor: '#FF6B6B',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '12px'
      }}
    >
      Generate Grid
    </button>
  </div>
  <div style={{ fontSize: '11px', color: '#666' }}>
    Generate a random maze or a random full grid for pathfinding algorithms on unweighted graph.
  </div>
</fieldset>
              {/* ←── Run Test For numerical comparision ──→ */}
        <fieldset style={{ marginBottom: '12px', border: '1px solid #ccc', padding: '8px' }}>
          <legend style={{ fontSize: '14px', fontWeight: 'bold' }}>Run Numerical Test</legend>
          <button
            onClick={runNumericalTest}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Run Test
          </button>
          <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
            Run performance test for numerical comparison of algorithms on DongXoaiCity.osm file 15 times with different random start and end nodes each time. Open console to see results.
            I expect users to put the DongXoaiCity.osm file in the public folder beforing running the test. Here is the link to download the content of the file: <a href="https://overpass-turbo.eu/s/26Oc" target="_blank" rel="noopener noreferrer">DongXoaiCity.osm</a>
          </div>
        </fieldset>
        {/* ←── Enable Bidirectional Search ──→ */}
<fieldset style={{ marginBottom: '12px', border: '1px solid #ccc', padding: '8px' }}>
  <legend style={{ fontSize: '14px', fontWeight: 'bold' }}>Bidirectional Search</legend>
  <label>
    <input
      type="checkbox"
      checked={enableBidirectionalSearch}
      onChange={e => setEnableBidirectionalSearch(e.target.checked)}
    /> Enable Bidirectional Search
  </label>
</fieldset>
        {/* ←── Algorithm picker ──→ */}
        <fieldset style={{ marginBottom: '12px', border: '1px solid #ccc', padding: '8px' }}>
          <legend style={{ fontSize: '14px', fontWeight: 'bold' }}>Select Algorithm</legend>
          <label style={{ display: 'block', marginBottom: '4px' }}>
            <input
              type="radio"
              name="algorithm"
              value="BFS"
              checked={selectedAlgorithm === 'BFS'}
              onChange={() => setSelectedAlgorithm('BFS')}
            />{' '}
            Breadth-First Search
          </label>
          <label style={{ display: 'block', marginBottom: '4px' }}>
            <input
              type="radio"
              name="algorithm"
              value="DFS"
              checked={selectedAlgorithm === 'DFS'}
              onChange={() => setSelectedAlgorithm('DFS')}
            />{' '}
            Depth-First Search
          </label>
          <label style={{ display: 'block', marginBottom: '4px' }}>
            <input
              type="radio"
              name="algorithm"
              value="ASTAR"
              checked={selectedAlgorithm === 'ASTAR'}
              onChange={() => setSelectedAlgorithm('ASTAR')}
            />{' '}
            A* Search
          </label>
          <label style={{ display: 'block', marginBottom: '4px' }}>
            <input
              type="radio"
              name="algorithm"
              value="DIJKSTRA"
              checked={selectedAlgorithm === 'DIJKSTRA'}
              onChange={() => setSelectedAlgorithm('DIJKSTRA')}
            />{' '}
            Dijkstra's
          </label>
          <label style={{ display: 'block' }}>
            <input
              type="radio"
              name="algorithm"
              value="GREEDY"
              checked={selectedAlgorithm === 'GREEDY'}
              onChange={() => setSelectedAlgorithm('GREEDY')}
            />{' '}
            Greedy Best-First
          </label>
        </fieldset>
        
        {/* ←── Minkowski Distance Parameter ──→ */}
        {selectedAlgorithm !== 'DFS' && selectedAlgorithm !== 'BFS' && selectedAlgorithm !== 'DIJKSTRA' && (
          <fieldset style={{ marginBottom: '12px', border: '1px solid #ccc', padding: '8px' }}>
            <legend style={{ fontSize: '14px', fontWeight: 'bold' }}>Minkowski Distance Parameter</legend>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                min="0.01"
                max="20"
                step="0.01"
                value={MinkowskiDistanceParameter}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  setMinkowskiDistanceParameter(isNaN(value) ? 0.01 : value);
                }}   
                style={{ 
                  flex: 1, 
                  padding: '4px', 
                  border: '1px solid #ccc', 
                  borderRadius: '4px',
                  fontSize: '12px'
                }}
              />
            </div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
              - Minkowski distance parameter (1 for Manhattan, 2 for Euclidean, etc.) <br />
              - Used to tune the heuristics for A*, Greedy Best-First, and Dijkstra's algorithms<br />
              - A lower value makes the heurisitc more significant to the total cost function, while a higher value makes it less significant. 
            </div>
          </fieldset>
        )}
        {/* ←── UI Update Frequency ──→ */}
        <fieldset style={{ marginBottom: '12px', border: '1px solid #ccc', padding: '8px' }}>
          <legend style={{ fontSize: '14px', fontWeight: 'bold' }}>UI Update Frequency</legend>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="number"
              min="1"
              max="100000000"
              value={cyclicNumberOfVisitedNodesForUIupdate}
              onChange={(e) => setCyc(parseInt(e.target.value) || 100)}
              style={{ 
                flex: 1, 
                padding: '4px', 
                border: '1px solid #ccc', 
                borderRadius: '4px',
                fontSize: '12px'
              }}
            />
            <span style={{ fontSize: '12px' }}>nodes</span>
          </div>
          <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
            - Update UI every N visited nodes
            <br />
            - Input high number to reduce UI updates to see actual Search Time taken by the algorithm
          </div>
        </fieldset>
        {/* ←── Highway Type Filter ──→ */}
        <fieldset style={{ marginBottom: '12px', border: '1px solid #ccc', padding: '8px' }}>
          <legend style={{ fontSize: '14px', fontWeight: 'bold' }}>Highway Type Filter</legend>
          <label style={{ display: 'block', marginBottom: '8px' }}>
            <input
              type="checkbox"
              checked={enableHighwayTypeFilter}
              onChange={(e) => setEnableHighwayTypeFilter(e.target.checked)}
            />{' '}
            Enable Highway Type Filtering
          </label>
          {enableHighwayTypeFilter && (
            <>
              <div style={{ 
                maxHeight: '120px', 
                overflowY: 'auto', 
                border: '1px solid #eee', 
                padding: '6px',
                backgroundColor: '#f9f9f9'
              }}>
                {allAvailableHighwayTypes.map(type => (
                  <label key={type} style={{ display: 'block', fontSize: '11px', marginBottom: '2px' }}>
                    <input
                      type="checkbox"
                      checked={allowedHighwayTypes.includes(type)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAllowedHighwayTypes([...allowedHighwayTypes, type]);
                        } else {
                          setAllowedHighwayTypes(allowedHighwayTypes.filter(t => t !== type));
                        }
                      }}
                    />{' '}
                    {type}
                    {!["road", "path", "trunk", "trunk_link", "primary", "primary_link",
                      "secondary", "secondary_link", "tertiary", "tertiary_link",
                      "unclassified", "motorway", "motorway_link", "cycleway", 
                      "service", "residential", "residential_link", "living_street", 
                      "track", "construction"].includes(type) && (
                        <span style={{ color: '#007bff', fontSize: '10px' }}> (custom)</span>
                    )}
                  </label>
                ))}
              </div>
              {/* ADD THE CUSTOM HIGHWAY TYPE INPUT HERE */}
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #ddd' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                  Add Custom Highway Type:
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input
                    type="text"
                    value={newHighwayType}
                    onChange={(e) => setNewHighwayType(e.target.value)}
                    placeholder="e.g., footway"
                    style={{
                      flex: 1,
                      padding: '4px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      fontSize: '11px'
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addHighwayType();
                      }
                    }}
                  />
                  <button
                    onClick={addHighwayType}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    Add
                  </button>
                </div>
                <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                  Format: letters, numbers, underscores, hyphens only
                </div>
              </div>
            </>
          )}
        </fieldset>
        {/* ←── One Way Filter ──→ */}
        <fieldset style={{ marginBottom: '12px', border: '1px solid #ccc', padding: '8px' }}>
          <legend style={{ fontSize: '14px', fontWeight: 'bold' }}>One Way Filter</legend>
          <label style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={enableOneWayFilter}
              onChange={(e) => setEnableOneWayFilter(e.target.checked)}
            />{' '}
            Respect One-Way Street Restrictions
          </label>
          <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
            When enabled, prevents movement against one-way streets
          </div>
        </fieldset>

        <button
          onClick={() => setEnableLowerDetail(!enableLowerDetail)}
          style={{
            width: '100%',
            padding: '10px', 
            backgroundColor: enableLowerDetail ? '#28a745' : '#007bff',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            marginBottom: '12px',
          }}
        >
          {enableLowerDetail ? 'Disable Lower Detail Levels' : 'Enable Lower Detail Levels'}
        </button> 
 
        {/* ←──runSearch Button ──→ */}
<button
  onClick={runSearch}
  disabled={isSearching}
  style={{
    width: '100%',
    padding: '10px',
    backgroundColor: isSearching ? '#cccccc' : '#007bff',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    cursor: isSearching ? 'not-allowed' : 'pointer',
    fontWeight: 'bold',
    marginBottom: '12px',
  }}
>
  {isSearching ? 'Searching...' : 
   `Run ${selectedAlgorithm} Search`}
  {enableBidirectionalSearch && ' (Bidirectional)'}
</button>
        {/* ←── Start/End Node Selection ──→ */}
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
  <button
    onClick={() => setClickMode('start')}
    style={{
      flex: 1,
      marginRight: '8px',
      backgroundColor: clickMode === 'start' ? '#28a745' : '#007bff',
      color: '#fff',
      padding: '8px',
      borderRadius: '4px',
      border: 'none',
      cursor: 'pointer',
      fontSize: '14px',
    }}
  >
    Set Start Node
  </button>
  <button
    onClick={() => setClickMode('end')}
    style={{
      flex: 1,
      backgroundColor: clickMode === 'end' ? '#28a745' : '#007bff',
      color: '#fff',
      padding: '8px',
      borderRadius: '4px',
      border: 'none',
      cursor: 'pointer',
      fontSize: '14px',
    }}
  >
    { 'Set End Nodes' }
  </button>
</div>
{endNodes.length > 0 && (
  <button
    onClick={() => setEndNodes([])}
    style={{
      width: '100%',
      padding: '6px',
      backgroundColor: '#dc3545',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '12px',
      marginBottom: '10px',
    }}
  >
    Clear All End Nodes
  </button>
)}

{/* Multi-End Node Configuration */}
<fieldset style={{ marginBottom: '12px', border: '1px solid #ccc', padding: '8px' }}>
  <legend style={{ fontSize: '14px', fontWeight: 'bold' }}>Multi-Destination Configuration</legend>

  {/* ─── Random-Pick Controls─── */}
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
  <input
    type="number"
    min={1}
    max={fullGraphData.nodes.length > 0 ? fullGraphData.nodes.length - (startNode ? 1 : 0) : 1}
    step={1}
    value={randomCount}
    onChange={e => setRandomCount(Number(e.target.value))}
    style={{ width: '60px', padding: '4px', fontSize: '12px' }}
  />
  <button
    onClick={pickRandomEndNodes}
    style={{
      padding: '6px 12px',
      backgroundColor: '#17a2b8',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '12px'
    }}
  >
    Random Pick {randomCount} end nodes
  </button>
</div>
  {(
    <>
      <label style={{ display: 'block', marginBottom: '8px' }}>
        <input
          type="radio"
          name="optimization"
          checked={useGlobalOptimal}
          onChange={() => setUseGlobalOptimal(true)}
        /> Brute Force
      </label>
      <label style={{ display: 'block', marginBottom: '8px' }}>
        <input
          type="radio"
          name="optimization"
          checked={!useGlobalOptimal}
          onChange={() => setUseGlobalOptimal(false)}
        /> Nearest Neighbor
      </label>
      <div style={{ fontSize: '15px', color: 'rgba(20, 29, 31, 0.94)', marginTop: '4px' }}>
        - The measurement being used is straight-line distance between start node and all end nodes.<br />
        - Brute Force checks all possible routes to find the optimal sequence of end nodes.<br />
        - Nearest Neighbor finds the nearest end node from the current position.
      </div>
      
      {endNodes.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <strong>Selected End Nodes:</strong>
          <div style={{ maxHeight: '60px', overflowY: 'auto', border: '1px solid #eee', padding: '4px' }}>
            {endNodes.map((nodeId, index) => (
              <div key={index} style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between' }}>
                <span>{nodeId}</span>
                <button 
                  onClick={() => setEndNodes(prev => prev.filter((_, i) => i !== index))}
                  style={{ fontSize: '10px', color: 'red', border: 'none', background: 'none', cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )}
</fieldset>

{/* Path Segment Switcher */}
{ pathSegments.length > 0 && (
  <fieldset style={{ marginBottom: '12px', border: '1px solid #ccc', padding: '8px' }}>
    <legend style={{ fontSize: '14px', fontWeight: 'bold' }}>Solution Path Segment Display</legend>
    <div style={{ marginBottom: '8px' }}>
      <button
        onClick={() => highlightSegment(null)}
        style={{
          width: '100%',
          padding: '6px',
          backgroundColor: currentSegmentIndex === null ? '#28a745' : '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          marginBottom: '4px'
        }}
      >
        Select All Segments
      </button>
    </div>
    
    <div style={{ maxHeight: '120px', overflowY: 'auto', border: '1px solid #eee', padding: '4px' }}>
      {pathSegments.map((segment, index) => (
        <button
          key={index}
          onClick={() => highlightSegment(index)}
          style={{
            width: '100%',
            padding: '6px',
            backgroundColor: currentSegmentIndex === index ? '#28a745' : '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px',
            marginBottom: '2px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <div 
            style={{ 
              width: '12px', 
              height: '12px', 
              backgroundColor: segment.color, 
              borderRadius: '2px',
              border: '1px solid #333'
            }}
          />
          <span>Segment {index + 1}: {segment.start} → {segment.end}</span>
        </button>
      ))}
    </div>
  </fieldset>
)}

        {/* Total Distance Display */}
{totalDistance > 0 && (
  <div style={{ 
    backgroundColor: '#e8f5e8', 
    padding: '8px', 
    borderRadius: '4px', 
    marginBottom: '12px',
    border: '1px solid #28a745'
  }}>
    <strong>
      { (currentSegmentIndex === null
            ? `Total Distance: ${totalDistance.toFixed(2)} km`
            : `Segment Distance: ${segmentDistances[currentSegmentIndex]?.toFixed(2) ?? '0.00'} km`
          )
      }
    </strong>
  </div>
)}
        {/* Search Duration Display */}
{totalSearchDuration !== null && (
  <div style={{
    backgroundColor: '#f0f0ff',
    padding: '8px',
    borderRadius: '4px',
    marginBottom: '12px',
    border: '1px solid #666'
  }}>
    <strong>
      { currentSegmentIndex === null
        ? `Total Search Time: ${totalSearchDuration.toFixed(3)} ms`
        : `Segment Search Time: ${segmentSearchDurations[currentSegmentIndex]?.toFixed(3) ?? '0.000'} ms`
      }
    </strong>
  </div>
)}

{totalVisitedNodeCount > 0 && (
  <div style={{
    backgroundColor: '#fff8e1',
    padding: '8px',
    borderRadius: '4px',
    marginBottom: '12px',
    border: '1px solid #e6b800'
  }}>
    <strong>
      {currentSegmentIndex === null
        // all segments: show grand total
        ? `Total Visited Nodes: ${totalVisitedNodeCount}`
        // single segment: show the count for that segment (or 0)
        : `Segment Visited Nodes: ${segmentVisitedNodeCounts[currentSegmentIndex] ?? 0}`
      }
    </strong>
  </div>
)}

        {/* Directions Display */}
        { routes.length > 0 && (
          <div style={{ 
            backgroundColor: '#f8f9fa', 
            padding: '8px', 
            borderRadius: '4px', 
            marginBottom: '12px',
            border: '1px solid #dee2e6'
          }}>
            <strong>Routes from selected segments:</strong>
            <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '12px' }}>
              {routes.map((route, index) => (
                <li key={index} style={{ marginBottom: '4px' }}>
                  {route}
                </li>
              ))}
            </ol>
          </div>
        )}
{/* segmentSolutionNodes Display */}
{segmentSolutionNodes.length > 0 && (
  <div style={{
    backgroundColor: '#f8f9fa',
    padding: '8px',
    borderRadius: '4px',
    marginBottom: '12px',
    border: '1px solid #dee2e6',
    maxHeight: '150px',
    overflowY: 'auto',
  }}>
    <strong>Solution nodes from selected segments:</strong>
    <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '12px' }}>
      {segmentSolutionNodes.map((nodeId, idx) => (
        <li key={idx} style={{ marginBottom: '4px' }}>
          {nodeId}
        </li>
      ))}
    </ol>
  </div>
)}



        <div style={{ fontSize: '12px', marginBottom: '8px' }}>
          <div>Zoom: {currentZoom.toFixed(2)}</div>
          <div>LOD: {getLOD(currentZoom)}</div>
        </div>

<div style={{ fontSize: '13px', lineHeight: '1.5' }}>
  <div><strong>Legend:</strong></div>
  <div><span style={{ color: 'gray' }}>●</span> Unvisited</div>
  <div><span style={{ color: 'white' }}>●</span> Visited</div>
  <div><span style={{ color: 'yellow' }}>●</span> Solution Path</div>
  <div><span style={{ color: 'orange' }}>●</span> Solution Path Segment</div>
  <div><span style={{ color: 'white', backgroundColor: 'black', padding: '2px', borderRadius: '50%' }}>S</span> Start Node</div>
  <div><span style={{ color: 'white', backgroundColor: 'red', padding: '2px', borderRadius: '50%' }}>1,2,3...</span> End Nodes (Order in which you select)</div>
  <div>Other colors are for differentiating highway type</div>
</div>
      </div>
      <ForceGraph2D
        ref={forceGraphRef}
        graphData={ enableLowerDetail ? filteredGraphDataType1 : filteredGraphDataType2 }
        onNodeClick={handleNodeClick}
        onZoom={updateViewport}
        cooldownTicks={0}
nodeLabel={node => {
  if (node.id === startNode) return `Start Node: ${node.id}`;
  if (endNodes.includes(node.id)) {
    const order = endNodes.indexOf(node.id) + 1;
    return `End Node ${order}: ${node.id}`;
  }
  return `Node: ${node.id}`;
}}        linkLabel={getLinkLabel}
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node, color, ctx) => {
          const radius = 0.3
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
          ctx.fill();
        }}
        linkColor={linkColor}
        linkWidth={link => {
          const highwayWidths = {
            trunk: 11.5,
            trunk_link: 11,
            primary: 9.5,
            primary_link: 9,
            secondary:7.5,
            secondary_link: 7,
            tertiary: 5.5,
            tertiary_link: 5,
          };
          if (link.state === 'solution') return 8.5;
          return highwayWidths[link.highwayType] || 4.5;
        }}
        linkDirectionalArrowLength={link =>
          link.state === 'solution' ?  2 : 0
        }
        linkDirectionalArrowColor={link =>
          link.state === 'solution' && link.oneWay === 'yes' ? 'red' : 'transparent'
        }
        //linkDirectionalParticles={link => link.oneWay === 'yes' ? 1 : 0}
        // Set the color of the particles to purple
        //linkDirectionalParticleColor={link => link.state === 'solution' ? 'purple' : 'rgba(82, 120, 202, 0.94)'}
        //linkDirectionalParticleWidth={(link) => 3}      
        width={window.innerWidth}
        height={window.innerHeight}
        enableNodeDrag={false}
        enablePanInteraction={true}
        enableZoomInteraction={true}
      />
    </div>
  );
}

const App: React.FC = () => <Screen />;

export default App;
