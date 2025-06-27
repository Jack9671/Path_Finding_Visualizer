import xml.etree.ElementTree as ET
import math
from typing import Dict, List, Any

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points on the Earth."""
    R = 6371e3  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def parse_osm_to_graph(osm_file: str) -> Dict[str, List[Dict[str, Any]]]:
    """
    Parse an OSM XML file and build a graph where each node is a string ID,
    and edges carry 'to', 'weight', 'highway', and 'name'.
    """
    tree = ET.parse(osm_file)
    root = tree.getroot()

    # 1. Extract nodes with their coordinates
    coords: Dict[str, Dict[str, float]] = {}
    for node in root.findall('node'):
        node_id = node.get('id')
        coords[node_id] = {
            'lat': float(node.get('lat')),
            'lon': float(node.get('lon'))
        }

    # 2. Initialize empty adjacency list
    graph: Dict[str, List[Dict[str, Any]]] = {nid: [] for nid in coords}

    # 3. Process each way
    for way in root.findall('way'):
        # Get highway, name, and oneway tags
        highway = None
        name = ''
        oneway = False
        for tag in way.findall('tag'):
            k, v = tag.get('k'), tag.get('v')
            if k == 'highway':
                highway = v
            elif k == 'name':
                name = v
            elif k == 'oneway' and v.lower() == 'yes':
                oneway = True
        # Skip non-highway ways
        if not highway:
            continue

        # Collect node refs in order
        nds = [nd.get('ref') for nd in way.findall('nd')]
        # Build edges between consecutive nodes
        for u, v in zip(nds, nds[1:]):
            # Compute weight as distance between u and v
            if u in coords and v in coords:
                lat1, lon1 = coords[u]['lat'], coords[u]['lon']
                lat2, lon2 = coords[v]['lat'], coords[v]['lon']
                dist = haversine(lat1, lon1, lat2, lon2)

                edge = {
                    'to': v,
                    'weight': dist,
                    'highway': highway,
                    'name': name
                }
                graph[u].append(edge)

                # Add reverse edge only if not oneway
                if not oneway:
                    rev_edge = {
                        'to': u,
                        'weight': dist,
                        'highway': highway,
                        'name': name
                    }
                    graph[v].append(rev_edge)

    return graph

if __name__ == '__main__':
    osm_path = 'data.osm'  # Path to your OSM XML file
    graph = parse_osm_to_graph(osm_path)
    # Example: print first 5 nodes and their edges
    for node_id, edges in list(graph.items())[:5]:
        print(f"Node {node_id} ->")
        for e in edges:
            print(f"  -> {e['to']} (weight={e['weight']:.1f}m, highway={e['highway']}, name={e['name']})")
