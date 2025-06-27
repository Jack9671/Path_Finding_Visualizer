import random
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom.minidom import parseString

def generate_prim_maze_osm(grid_size=30, spacing=0.00001, seed=7489, output_path=None):
    random.seed(seed)

    # Step 1: Initialize all nodes
    osm = Element("osm", version="0.6", generator="prim_maze_grid")
    node_ids = {}
    node_positions = {}
    current_id = 1

    for y in range(grid_size):
        for x in range(grid_size):
            lat = (x * spacing )*((115/32.177)**(2))
            lon = (y * spacing)*((115/32.177)**(2))
            node_ids[(x, y)] = current_id
            node_positions[current_id] = (lat, lon)
            current_id += 1

    # Step 2: Prim's algorithm for maze generation (1 solution path)
    visited = set()
    edges = []
    maze_edges = []

    start = (0, 0)
    visited.add(start)

    def neighbors(cell):
        x, y = cell
        nbs = []
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = x + dx, y + dy
            if 0 <= nx < grid_size and 0 <= ny < grid_size:
                nbs.append((nx, ny))
        return nbs

    for n in neighbors(start):
        edges.append((start, n))

    while edges:
        a, b = random.choice(edges)
        edges.remove((a, b))
        if b not in visited:
            visited.add(b)
            maze_edges.append((a, b))
            for n in neighbors(b):
                if n not in visited:
                    edges.append((b, n))

    # Step 3: Add all nodes to XML
    for (x, y), nid in node_ids.items():
        lat, lon = node_positions[nid]
        SubElement(osm, "node", id=str(nid), visible="true",
                   lat=str(lat), lon=str(lon))

    # Step 4: Add ways (maze paths)
    for a, b in maze_edges:
        id1, id2 = node_ids[a], node_ids[b]
        way = SubElement(osm, "way", id=str(random.randint(100000, 999999)))
        SubElement(way, "nd", ref=str(id1))
        SubElement(way, "nd", ref=str(id2))
        SubElement(way, "tag", k="highway", v="residential")

    # Step 5: Save to file
    xml_str = tostring(osm, 'utf-8')
    pretty_xml = parseString(xml_str).toprettyxml(indent="  ")
    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(pretty_xml)
    return output_path
def generate_full_grid_osm(grid_size=20, spacing=0.001, seed=None, output_path=None):
    """
    Generate a full grid where every node is connected to its immediate neighbors (no missing links).

    Parameters:
    - grid_size: number of nodes along each axis (grid_size x grid_size)
    - spacing: distance between adjacent nodes in degrees
    - seed: optional random seed for reproducible way IDs
    - output_path: if provided, writes the OSM XML to this file path

    Returns:
    - The XML string if output_path is None, otherwise the file path written.
    """
    if seed is not None:
        random.seed(seed)

    osm = Element("osm", version="0.6", generator="full_grid_generator")
    node_ids = {}
    node_positions = {}
    current_id = 1

    # Create all nodes
    for y in range(grid_size):
        for x in range(grid_size):
            lat = (x * spacing) * ((115 / 32.177) ** 2)
            lon = (y * spacing) * ((115 / 32.177) ** 2)
            node_ids[(x, y)] = current_id
            node_positions[current_id] = (lat, lon)
            SubElement(osm, "node", id=str(current_id), visible="true", lat=str(lat), lon=str(lon))
            current_id += 1

    # Create ways between each node and its right and bottom neighbor
    way_id_counter = grid_size * grid_size + 1
    for y in range(grid_size):
        for x in range(grid_size):
            id1 = node_ids[(x, y)]
            # Link to right neighbor
            if x < grid_size - 1:
                id2 = node_ids[(x+1, y)]
                way = SubElement(osm, "way", id=str(way_id_counter))
                SubElement(way, "nd", ref=str(id1))
                SubElement(way, "nd", ref=str(id2))
                SubElement(way, "tag", k="highway", v="residential")

                way_id_counter += 1
            # Link to bottom neighbor
            if y < grid_size - 1:
                id3 = node_ids[(x, y+1)]
                way = SubElement(osm, "way", id=str(way_id_counter))
                SubElement(way, "nd", ref=str(id1))
                SubElement(way, "nd", ref=str(id3))
                SubElement(way, "tag", k="highway", v="residential")

                way_id_counter += 1

    # Serialize XML
    xml_bytes = tostring(osm, 'utf-8')
    pretty_xml = parseString(xml_bytes).toprettyxml(indent="  ")

    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(pretty_xml)
        return output_path
    return pretty_xml

# Call function to generate and save maze
output_file_path = r"D:\Semester 4\Data Visualization\Path_Finding_Visualizer\frontend\public\random_maze.osm"
generate_prim_maze_osm(output_path=output_file_path)
generate_full_grid_osm(output_path=r"D:\Semester 4\Data Visualization\Path_Finding_Visualizer\frontend\public\full_grid.osm")

