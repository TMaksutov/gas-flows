// Disable the default context menu.
document.addEventListener('contextmenu', function(e) {
  e.preventDefault();
});

// Helper function: Interpolate between two colors
function interpolateColor(c1, c2, t) {
  let r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
  let g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
  let b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  return "rgb(" + r + "," + g + "," + b + ")";
}

// Function to compute the edge color based on flow and diameter
function getEdgeColor(edge) {
  let flow = parseFloat(edge.data('flow')) || 0;
  let d = parseFloat(edge.data('diameter')) || 1; // avoid division by zero
  let ratio = 400000000 * flow / Math.pow(d, 2.25);
  
  // Define anchor colors:
  // Ratio 0: Grey, 5: Blue, 10: Green, 20: Red
  const grey = [128, 128, 128];
  const blue = [0, 0, 255];
  const green = [0, 255, 0];
  const red = [255, 0, 0];
  
  if (ratio <= 0) {
    return "rgb(" + grey.join(",") + ")";
  } else if (ratio <= 5) {
    let t = ratio / 5;
    return interpolateColor(grey, blue, t);
  } else if (ratio <= 10) {
    let t = (ratio - 5) / 5;
    return interpolateColor(blue, green, t);
  } else if (ratio <= 20) {
    let t = (ratio - 10) / 10;
    return interpolateColor(green, red, t);
  } else {
    return "rgb(" + red.join(",") + ")";
  }
}

// Initialize Cytoscape with node and edge styling.
let cy = cytoscape({
  container: document.getElementById('cy'),
  wheelSensitivity: 0.2,
  style: [
    {
      selector: 'node',
      style: {
        'background-color': '#999',
        'label': 'data(label)',
        'text-margin-x': 10,
        'text-halign': 'left',
        'color': 'black',
        'text-background-color': 'white',
        'text-background-opacity': 0.8,
        'text-border-color': 'black',
        'text-border-width': 1,
        'font-size': 10,
        'width': 30,
        'height': 30,
        'text-wrap': 'wrap',
        'text-max-width': '200px'
      }
    },
    {
      selector: 'edge',
      style: {
        // Edge width: 1px + round(D/200)
        'width': function(edge) {
          let d = parseFloat(edge.data('diameter')) || 0;
          return 1 + Math.round(d / 200);
        },
        // Use getEdgeColor to determine dynamic line color.
        'line-color': function(edge) {
          return getEdgeColor(edge);
        },
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'label': 'data(label)',
        'font-size': 10,
        'text-rotation': 'autorotate',
        'text-wrap': 'wrap',
        'text-max-width': '200px',
        'text-margin-y': -15
      }
    }
  ],
  layout: { name: 'preset' }
});


// Interaction variables.
let tappedTimeout = null;
const doubleTapThreshold = 300;
let edgeCreationSource = null;
let nodeIdCounter = 0; // Start numbering nodes from 0

// Function to update the information panel with nodes and edges data.
function updateInfo() {
  let totalVolume = 0;
  let positiveInjection = 0;
  let negativeInjection = 0;
  let nodeHTML = '<ul>';
  let edgeHTML = '<ul>';

  cy.nodes().forEach(node => {
    let injection = parseFloat(node.data('injection') || 0);
    let volume = parseFloat(node.data('volume') || 0);
    let pressure = parseFloat(node.data('pressure') || 0);
    totalVolume += volume;
    
    // Sum injections.
    if (injection > 0) {
      positiveInjection += injection;
    } else {
      negativeInjection += injection;
    }
    
    let geometry = 0;
    node.connectedEdges().forEach(edge => {
      let D = parseFloat(edge.data('diameter'));
      let L = parseFloat(edge.data('length'));
      geometry += 3.1415 * D / 1000 * D / 1000 * L / 2 * 1000 / 4;
    });
    node.data('geometry', geometry);

    let label = "P: " + pressure.toFixed(2);
    if (injection !== 0) {
      label += " | I: " + injection.toFixed(4);
    }
    node.data('label', label);

    nodeHTML += `<li>${node.id()}: Position (${Math.round(node.position('x'))}, ${Math.round(node.position('y'))}); 
    Volume: ${volume.toFixed(0)} m³, Pressure: ${pressure.toFixed(2)}, Geometry: ${geometry.toFixed(1)}`;
    if (injection !== 0) {
      nodeHTML += `, Injection: ${injection.toFixed(4)}`;
    }
    nodeHTML += `</li>`;
  });
  nodeHTML += '</ul>';

  cy.edges().forEach(edge => {
    edgeHTML += `<li>${edge.id()}: ${edge.data('source')} → ${edge.data('target')}, 
    Flow: ${parseFloat(edge.data('flow')).toFixed(2)} m³/s, 
    Length: ${edge.data('length')} km, Diameter: ${edge.data('diameter')} mm</li>`;
  });
  edgeHTML += '</ul>';

  let hours = Math.floor(simulatedSeconds / 3600);
  let minutes = Math.floor((simulatedSeconds % 3600) / 60);
  let seconds = simulatedSeconds % 60;

  let timeStr = `${hours}h ${minutes}m ${seconds}s`;

  // Update the info panel with gas volume, simulated time and injection summaries.
  document.getElementById('totalVolume').innerHTML =
    "Total Gas Volume: " + totalVolume.toFixed(0) + " m³ (Simulated Time: " + timeStr + ")<br>" +
    "Total Positive Injection: " + positiveInjection.toFixed(4) + " m³/s, " +
    "Total Negative Injection: " + negativeInjection.toFixed(4) + " m³/s";

  document.getElementById('nodeList').innerHTML = '<strong>Nodes:</strong>' + nodeHTML;
  document.getElementById('edgeList').innerHTML = '<strong>Edges:</strong>' + edgeHTML;
}


// (Placeholder for future generate graph functionality.)
function generateBtn() {
  // Clear the graph and reset time.
  clearGraph();
  simulatedSeconds = 0;
  
  // Allowed values.
  const L_values = [];
  for (let i = 10; i <= 200; i += 10) { 
    L_values.push(i); 
  }
  const D_values = [];
  for (let i = 200; i <= 1400; i += 100) { 
    D_values.push(i); 
  }
  
  // Helper functions.
  function randChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  // Scale: pixels per km.
  const pixelPerKm = 5;
  
  // --- Step 1: Create Main Horizontal Line (Depth 1) ---
  // Choose number of equal segments (3-5) for the main horizontal line.
  const mainSegments = randInt(3, 5);
  
  // For the main line, select one L and one D.
  // D must be 500 or higher.
  const possibleMainD = D_values.filter(d => d >= 500);
  const mainD = randChoice(possibleMainD);
  // The main segment length must be between mainD/20 and mainD/10.
  const allowedMainL = L_values.filter(l => l >= mainD / 20 && l <= mainD / 10);
  const mainL = allowedMainL.length ? randChoice(allowedMainL) : Math.min(...L_values);
  
  // Set a fixed y position and initial x.
  const startY = 150;
  let startX = 50;
  
  // Create main line nodes.
  const mainLineNodes = [];
  // Create first node.
  let nodeId = 'n' + nodeIdCounter;
  nodeIdCounter++;
  cy.add({
    group: 'nodes',
    data: { id: nodeId, branchD: mainD, branchL: mainL, injection: 0 },
    position: { x: startX, y: startY }
  });
  mainLineNodes.push(nodeId);
  
  // Create subsequent nodes with equal segments.
  for (let i = 0; i < mainSegments; i++) {
    startX += mainL * pixelPerKm;
    nodeId = 'n' + nodeIdCounter;
    nodeIdCounter++;
    cy.add({
      group: 'nodes',
      data: { id: nodeId, branchD: mainD, branchL: mainL, injection: 0 },
      position: { x: startX, y: startY }
    });
    const prevNodeId = mainLineNodes[mainLineNodes.length - 1];
    const edgeId = 'e' + prevNodeId + '_' + nodeId;
    cy.add({
      group: 'edges',
      data: {
        id: edgeId,
        source: prevNodeId,
        target: nodeId,
        flow: 0,
        length: mainL.toFixed(3),
        diameter: mainD.toFixed(0),
        label: "L: " + mainL + " km | D: " + mainD + " mm"
      }
    });
    mainLineNodes.push(nodeId);
  }
  
  // --- Step 2: Generate Second Layer Branches from Main Branch (Depth 2) ---
  // Pick 2-4 distinct points from the main branch (excluding the first node) to attach vertical branches.
  const numSecondLayerBranches = randInt(2, 4);
  const mainBranchPoints = mainLineNodes.slice(1); // exclude the first node
  const selectedNodes = [];
  while (selectedNodes.length < numSecondLayerBranches && mainBranchPoints.length > 0) {
    const idx = Math.floor(Math.random() * mainBranchPoints.length);
    selectedNodes.push(mainBranchPoints.splice(idx, 1)[0]);
  }
  
  // We'll store level 2 branches for potential level 3 attachments.
  const depth2Branches = [];
  
  selectedNodes.forEach(attachNodeId => {
    const attachNode = cy.getElementById(attachNodeId);
    // Use parent's branch parameters (from the main branch).
    const parentD = attachNode.data('branchD'); // equals mainD
    const parentL = attachNode.data('branchL'); // equals mainL
    
    // Choose a branch diameter: must be lower than parent's diameter.
    const allowedBranchD = D_values.filter(d => d < parentD);
    if (allowedBranchD.length === 0) return; // skip if no lower D available
    const branchD = randChoice(allowedBranchD);
    
    // Determine number of segments (2-4) for this branch.
    const branchSegments = randInt(2, 4);
    
    // For each branch segment, the length must be between branchD/20 and branchD/10 and less than parent's L.
    const allowedBranchL = L_values.filter(l => l >= branchD / 20 && l <= Math.min(branchD / 10, parentL));
    if (allowedBranchL.length === 0) return;
    // Use the same segment length for the entire branch.
    const branchL = randChoice(allowedBranchL);
    
    // Decide vertical direction: up (-1) or down (+1)
    const verticalSign = randChoice([1, -1]);
    
    // Starting position: same as the attachment node.
    const branchX = attachNode.position('x');
    let branchY = attachNode.position('y');
    const branchNodes = [attachNodeId];
    
    for (let seg = 0; seg < branchSegments; seg++) {
      branchY += verticalSign * branchL * pixelPerKm;
      const newNodeId = 'n' + nodeIdCounter;
      nodeIdCounter++;
      cy.add({
        group: 'nodes',
        data: { id: newNodeId, branchD: branchD, branchL: branchL, injection: 0 },
        position: { x: branchX, y: branchY }
      });
      const edgeId = 'e' + branchNodes[branchNodes.length - 1] + '_' + newNodeId;
      cy.add({
        group: 'edges',
        data: {
          id: edgeId,
          source: branchNodes[branchNodes.length - 1],
          target: newNodeId,
          flow: 0,
          length: branchL.toFixed(3),
          diameter: branchD.toFixed(0),
          label: "L: " + branchL + " km | D: " + branchD + " mm"
        }
      });
      branchNodes.push(newNodeId);
    }
    
    if (branchNodes.length > 1) {
      depth2Branches.push(branchNodes);
    }
  });
  
  // --- Step 3: Generate Third Layer Branches from Level 2 (Horizontal) ---
  // For each depth 2 branch, pick 1-3 points (excluding the first node) to attach horizontal branches.
  depth2Branches.forEach(branch => {
    const numThirdLayerBranches = randInt(1, 3);
    // Create a copy of possible attachment nodes (exclude the first node).
    const possibleAttachments = branch.slice(1);
    const selectedAttachments = [];
    while (selectedAttachments.length < numThirdLayerBranches && possibleAttachments.length > 0) {
      const idx = Math.floor(Math.random() * possibleAttachments.length);
      selectedAttachments.push(possibleAttachments.splice(idx, 1)[0]);
    }
    
    selectedAttachments.forEach(attachNodeId => {
      const attachNode = cy.getElementById(attachNodeId);
      // Use parent's branch parameters from the depth 2 branch.
      const parentD = attachNode.data('branchD'); // equals branchD from level 2
      const parentL = attachNode.data('branchL'); // equals branchL from level 2
      
      // Choose a horizontal branch diameter: must be lower than parent's diameter.
      const allowedBranchD = D_values.filter(d => d < parentD);
      if (allowedBranchD.length === 0) return;
      const branchD = randChoice(allowedBranchD);
      
      // Determine number of segments for this horizontal branch (1-2 segments).
      const branchSegments = randInt(1, 2);
      
      // For each branch segment, length must be between branchD/20 and branchD/10 and less than parent's L.
      const allowedBranchL = L_values.filter(l => l >= branchD / 20 && l <= Math.min(branchD / 10, parentL));
      if (allowedBranchL.length === 0) return;
      const branchL = randChoice(allowedBranchL);
      
      // Decide horizontal direction: left (-1) or right (+1)
      const horizontalSign = randChoice([1, -1]);
      
      // Starting position: same as the attachment node.
      let branchX = attachNode.position('x');
      const branchY = attachNode.position('y'); // horizontal branch, so y stays constant.
      const branchNodes = [attachNodeId];
      
      for (let seg = 0; seg < branchSegments; seg++) {
        branchX += horizontalSign * branchL * pixelPerKm;
        const newNodeId = 'n' + nodeIdCounter;
        nodeIdCounter++;
        cy.add({
          group: 'nodes',
          data: { id: newNodeId, injection: 0 },
          position: { x: branchX, y: branchY }
        });
        const edgeId = 'e' + branchNodes[branchNodes.length - 1] + '_' + newNodeId;
        cy.add({
          group: 'edges',
          data: {
            id: edgeId,
            source: branchNodes[branchNodes.length - 1],
            target: newNodeId,
            flow: 0,
            length: branchL.toFixed(3),
            diameter: branchD.toFixed(0),
            label: "L: " + branchL + " km | D: " + branchD + " mm"
          }
        });
        branchNodes.push(newNodeId);
      }
    });
  });
  
  // --- Step 4: Add Injections ---
  // Let X = Math.pow(mainD, 2.25) / 20000.
  const X = Math.pow(mainD, 2.25) / 20000;
  // Add +X to the first point of main branch.
  const firstMainNode = cy.getElementById(mainLineNodes[0]);
  firstMainNode.data('injection', (firstMainNode.data('injection') || 0) + X);
  // Add -0.5 * X to the last point of main branch.
  const lastMainNode = cy.getElementById(mainLineNodes[mainLineNodes.length - 1]);
  lastMainNode.data('injection', (lastMainNode.data('injection') || 0) - 0.5 * X);
  
  // The remaining half (i.e. -0.5 * X) will be distributed among all endpoints.
  // Endpoints are nodes with only one connected edge.
  const endpoints = cy.nodes().filter(node => node.connectedEdges().length === 1);
  
  // Calculate total diameter of endpoints (use branchD if available, otherwise use the diameter of the single edge).
  let totalEndpointDiameter = 0;
  endpoints.forEach(node => {
    let d = node.data('branchD');
    if (!d) {
      const edge = node.connectedEdges()[0];
      d = parseFloat(edge.data('diameter'));
    }
    totalEndpointDiameter += d;
  });
  
  // Distribute the extra negative injection (-0.5 * X) pro rata according to each endpoint's diameter.
  endpoints.forEach(node => {
    let d = node.data('branchD');
    if (!d) {
      const edge = node.connectedEdges()[0];
      d = parseFloat(edge.data('diameter'));
    }
    const extraInjection = -0.5 * X * (d / totalEndpointDiameter);
    node.data('injection', (node.data('injection') || 0) + extraInjection);
  });
  
  updateInfo();
}


// Clear the graph and reset node numbering.
function clearGraph() {
  cy.elements().remove();
  nodeIdCounter = 0; // Reset node numbering to 0
  if (edgeCreationSource) {
    edgeCreationSource.style('border-width', '0px');
    edgeCreationSource = null;
  }
  updateInfo();
}

// Attach event listeners to the control buttons.
document.getElementById('clearBtn').addEventListener('click', clearGraph);
document.getElementById('generateBtn').addEventListener('click', generateBtn);
document.getElementById('playBtn').addEventListener('click', function() {
  setSimulationMode("sec", cy, updateInfo);
});
document.getElementById('playMinBtn').addEventListener('click', function() {
  setSimulationMode("min", cy, updateInfo);
});
document.getElementById('playHourBtn').addEventListener('click', function() {
  setSimulationMode("hour", cy, updateInfo);
});
document.getElementById('stopBtn').addEventListener('click', function() {
  setSimulationMode("stop", cy, updateInfo);
});
;

// Tap event for creating nodes and edges.
cy.on('tap', function(evt) {
  if (tappedTimeout) {
    clearTimeout(tappedTimeout);
    tappedTimeout = null;
    if (evt.target === cy) {
      let pos = evt.position;
      let newId = 'n' + nodeIdCounter;
      nodeIdCounter++;
      cy.add({
        group: 'nodes',
        data: { id: newId, injection: 0, pressure: 0, volume: 0 },
        position: { x: pos.x, y: pos.y }
      });
      updateInfo();
    } else {
      if (edgeCreationSource && edgeCreationSource.id() === evt.target.id()) {
        edgeCreationSource = null;
      }
      evt.target.remove();
      updateInfo();
    }
    return;
  } else {
    tappedTimeout = setTimeout(function() {
      if (evt.target === cy) {
        // Do nothing on background tap.
      } else {
        if (edgeCreationSource === null) {
          edgeCreationSource = evt.target;
          edgeCreationSource.style('border-color', 'red');
          edgeCreationSource.style('border-width', '3px');
        } else {
          if (edgeCreationSource.id() !== evt.target.id()) {
            let newEdgeId = 'e' + edgeCreationSource.id() + '_' + evt.target.id();
            let exists = cy.edges().some(function(edge) {
              return edge.id() === newEdgeId || edge.id() === ('e' + evt.target.id() + '_' + edgeCreationSource.id());
            });
            if (!exists) {
              // Set fixed values for new edges.
              let length = "1.000";
              let diameter = "565.00";
              cy.add({
                group: 'edges',
                data: {
                  id: newEdgeId,
                  source: edgeCreationSource.id(),
                  target: evt.target.id(),
                  flow: 0,
                  length: length,
                  diameter: diameter,
                  // Updated label: single line format.
                  label: "L: " + length + " km | D: " + Math.round(diameter) + " mm"
                }
              });
              updateInfo();
            }
            edgeCreationSource.style('border-width', '0px');
            edgeCreationSource = null;
          } else {
            edgeCreationSource.style('border-width', '0px');
            edgeCreationSource = null;
          }
        }
      }
      tappedTimeout = null;
    }, doubleTapThreshold);
  }
});

// Right-click (context tap) event for updating node/edge parameters.
cy.on('cxttap', function(evt) {
  if (evt.target === cy) return;
  if (evt.target.isNode()) {
    let node = evt.target;
    let currentInjection = node.data('injection') || 0;
    let newInjection = prompt("Enter gas injection/output value in m³/sec (positive for input, negative for output):", currentInjection);
    if (newInjection !== null) {
      let numVal = parseFloat(newInjection);
      if (!isNaN(numVal)) {
        node.data('injection', numVal);
        updateInfo();
      }
    }
  } else if (evt.target.isEdge()) {
    let edge = evt.target;
    let currentLength = edge.data('length');
    let newLength = prompt("Enter new length for this edge in km:", currentLength);
    if (newLength !== null) {
      let numValLength = parseFloat(newLength);
      if (!isNaN(numValLength) && numValLength > 0) {
        edge.data('length', numValLength.toFixed(3));
      }
    }
    let currentDiameter = edge.data('diameter');
    let newDiameter = prompt("Enter new diameter for this edge in mm:", currentDiameter);
    if (newDiameter !== null) {
      let numValDiameter = parseFloat(newDiameter);
      if (!isNaN(numValDiameter) && numValDiameter > 0) {
        edge.data('diameter', numValDiameter.toFixed(0));
      }
    }
    // Update the label in single-line format.
    edge.data('label', "L: " + edge.data('length') + " km | D: " + Math.round(edge.data('diameter')) + " mm");
    updateInfo();
  }
});
