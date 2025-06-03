// random_generator.js - Random pipeline network generator

// Constants for random generation
const RANDOM_CONFIG = {
  // Number of horizontal lines
  MIN_HORIZONTAL_LINES: 1,
  MAX_HORIZONTAL_LINES: 4,
  
  // Number of segments per horizontal line
  MIN_SEGMENTS_PER_LINE: 2,
  MAX_SEGMENTS_PER_LINE: 4,
  
  // Segment length range (km)
  MIN_SEGMENT_LENGTH: 30,
  MAX_SEGMENT_LENGTH: 150,
  
  // Available diameters (mm)
  AVAILABLE_DIAMETERS: [600, 800, 1000, 1200],
  
  // Layout parameters
  HORIZONTAL_SPACING: 200,  // pixels between nodes horizontally
  VERTICAL_SPACING: 120,    // pixels between horizontal lines
  START_X: 100,             // starting X position
  START_Y: 200,             // starting Y position
  
  // Vertical connection probability (0-1)
  VERTICAL_CONNECTION_PROBABILITY: 0.7
};

/**
 * Generate a random integer between min and max (inclusive)
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a random float between min and max
 */
function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Pick a random element from an array
 */
function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generate random pipeline network
 */
function generateRandomNetwork() {
  // Clear existing graph first
  clearGraph();
  
  const numLines = randomInt(RANDOM_CONFIG.MIN_HORIZONTAL_LINES, RANDOM_CONFIG.MAX_HORIZONTAL_LINES);
  // All lines will have the same number of segments to create a proper grid
  const numSegmentsPerLine = randomInt(RANDOM_CONFIG.MIN_SEGMENTS_PER_LINE, RANDOM_CONFIG.MAX_SEGMENTS_PER_LINE);
  const numColumnsPerLine = numSegmentsPerLine + 1; // Number of nodes per line
  
  // Generate irregular X positions for each column to create different segment lengths
  // All parallel segments in the same column will have the same length
  const columnXPositions = [];
  columnXPositions.push(RANDOM_CONFIG.START_X); // First column always at START_X
  
  for (let colIndex = 1; colIndex < numColumnsPerLine; colIndex++) {
    // Generate random spacing between columns (50% to 150% of normal spacing)
    const minSpacing = RANDOM_CONFIG.HORIZONTAL_SPACING * 0.5;
    const maxSpacing = RANDOM_CONFIG.HORIZONTAL_SPACING * 1.5;
    const spacing = randomFloat(minSpacing, maxSpacing);
    const newX = columnXPositions[colIndex - 1] + spacing;
    columnXPositions.push(newX);
  }
  
  const allNodes = []; // Array of arrays, each sub-array contains nodes for one horizontal line
  
  // Generate horizontal lines
  for (let lineIndex = 0; lineIndex < numLines; lineIndex++) {
    const diameter = randomChoice(RANDOM_CONFIG.AVAILABLE_DIAMETERS);
    const lineNodes = [];
    
    const y = RANDOM_CONFIG.START_Y + lineIndex * RANDOM_CONFIG.VERTICAL_SPACING;
    
    // Create nodes for this horizontal line (same number for all lines)
    for (let nodeIndex = 0; nodeIndex < numColumnsPerLine; nodeIndex++) {
      const x = columnXPositions[nodeIndex];
      
      const nodeId = 'n' + nodeIdCounter;
      const node = cy.add({
        group: 'nodes',
        data: { 
          id: nodeId, 
          injection: 0, 
          pressure: 0, 
          name: '.', 
          label: '' 
        },
        position: { x: x, y: y }
      });
      
      nodeIdCounter++;
      lineNodes.push(node);
    }
    
    // Create horizontal edges for this line
    for (let segmentIndex = 0; segmentIndex < numSegmentsPerLine; segmentIndex++) {
      const sourceNode = lineNodes[segmentIndex];
      const targetNode = lineNodes[segmentIndex + 1];
      
      // Calculate actual distance between nodes based on their positions
      const length = calculateNodeDistance(sourceNode.id(), targetNode.id());
      
      const edgeData = createEdgeData(sourceNode.id(), targetNode.id(), length, diameter);
      cy.add({ group: 'edges', data: edgeData });
    }
    
    allNodes.push(lineNodes);
  }
  
  // Generate vertical connections between adjacent horizontal lines
  for (let lineIndex = 0; lineIndex < numLines - 1; lineIndex++) {
    const currentLine = allNodes[lineIndex];
    const nextLine = allNodes[lineIndex + 1];
    
    // Connect nodes between lines (excluding leftmost and rightmost nodes)
    // Since all lines have the same number of columns, we can safely iterate
    for (let nodeIndex = 1; nodeIndex < numColumnsPerLine - 1; nodeIndex++) {
      // Random chance to create vertical connection
      if (Math.random() < RANDOM_CONFIG.VERTICAL_CONNECTION_PROBABILITY) {
        const sourceNode = currentLine[nodeIndex];
        const targetNode = nextLine[nodeIndex];
        
        // Use a smaller diameter for vertical connections
        const verticalDiameter = randomChoice(RANDOM_CONFIG.AVAILABLE_DIAMETERS.slice(0, 2)); // Use smaller diameters
        
        // Fixed vertical length of 0.1 km
        const verticalLength = 0.1;
        
        const edgeData = createEdgeData(sourceNode.id(), targetNode.id(), verticalLength, verticalDiameter);
        cy.add({ group: 'edges', data: edgeData });
      }
    }
  }
  
  // Set fixed pressures for leftmost and rightmost nodes
  // All injection rates remain 0 (no gas inputs/outputs)
  
  // Generate one pressure value for all left nodes and one for all right nodes
  const leftPressure = randomFloat(5, 7);
  const rightPressure = randomFloat(3, 4);
  
  for (let lineIndex = 0; lineIndex < numLines; lineIndex++) {
    const currentLine = allNodes[lineIndex];
    
    // Set high pressure (5-7 MPa) for leftmost nodes (first column) - same for all
    const leftmostNode = currentLine[0];
    leftmostNode.data('pressure', leftPressure);
    leftmostNode.data('pressureSet', true);
    leftmostNode.data('injection', 0); // No injection
    
    // Set lower pressure (3-4 MPa) for rightmost nodes (last column) - same for all
    const rightmostNode = currentLine[numColumnsPerLine - 1];
    rightmostNode.data('pressure', rightPressure);
    rightmostNode.data('pressureSet', true);
    rightmostNode.data('injection', 0); // No injection
    
    // Ensure all other nodes have zero injection
    for (let nodeIndex = 1; nodeIndex < numColumnsPerLine - 1; nodeIndex++) {
      currentLine[nodeIndex].data('injection', 0);
    }
  }
  
  // Update the display
  updateInfo();
  
  const allNodesFlat = allNodes.flat();
  console.log(`Generated random network with ${numLines} horizontal lines and ${numColumnsPerLine} columns (${allNodesFlat.length} total nodes)`);
  console.log(`Left column: 5-7 MPa fixed pressure, Right column: 3-4 MPa fixed pressure, All injections: 0`);
}

// Make the function available globally
window.generateRandomNetwork = generateRandomNetwork; 