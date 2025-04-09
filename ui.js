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
  let ratio = parseFloat(edge.data('v2')) || 0;
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
        'width': function(edge) {
          let d = parseFloat(edge.data('diameter')) || 0;
          return 1 + Math.round(d / 200);
        },
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

// Global interaction variables.
let nodeIdCounter = 0; // Start numbering nodes from 0
let tappedTimeout = null;
const doubleTapThreshold = 300; // milliseconds

// Variables for the creation session.
let creationActive = false;
let firstNode = null;
let tempNode = null;
let tempEdge = null;

// Function to update the information panel with nodes and edges data.
function updateInfo() {
  let totalVolume = 0;
  let positiveInjection = 0;
  let negativeInjection = 0;
  
  // Build table header for nodes
  let nodeHTML = `<table border="1" cellpadding="4" cellspacing="0">
    <tr>
      <th>ID</th>
      <th>Position</th>
      <th>Volume (m³)</th>
      <th>Pressure (MPa)</th>
      <th>Geometry</th>
      <th>Injection (m³/s)</th>
    </tr>`;
  
  cy.nodes().forEach(node => {
    let injection = parseFloat(node.data('injection') || 0);
    let volume = parseFloat(node.data('volume') || 0);
    let pressure = parseFloat(node.data('pressure') || 0);
    totalVolume += volume;
    
    if (injection > 0) {
      positiveInjection += injection;
    } else {
      negativeInjection += injection;
    }
    
    let geometry = 0;
    node.connectedEdges().forEach(edge => {
      let D = parseFloat(edge.data('diameter'));
      let L = parseFloat(edge.data('length'));
      geometry += 3.1415 * Math.pow(D / 1000, 2) * (L / 2) * (1000 / 4);
    });
    node.data('geometry', geometry);
    
    let label = "P: " + pressure.toFixed(2);
    if (injection !== 0) {
      label += " | I: " + injection.toFixed(4);
    }
    node.data('label', label);
    
    nodeHTML += `<tr>
      <td>${node.id()}</td>
      <td>(${Math.round(node.position('x'))}, ${Math.round(node.position('y'))})</td>
      <td>${volume.toFixed(0)}</td>
      <td>${pressure.toFixed(2)}</td>
      <td>${geometry.toFixed(1)}</td>
      <td>${injection !== 0 ? injection.toFixed(4) : ''}</td>
    </tr>`;
  });
  nodeHTML += '</table>';
  
  // Build table header for edges with additional speed columns.
  let edgeHTML = `<table border="1" cellpadding="4" cellspacing="0">
    <tr>
      <th>ID</th>
      <th>Source → Target</th>
      <th>Flow (m³/s)</th>
      <th>L (km)</th>
      <th>D(mm)</th>
      <th>v1 (m/s)</th>
      <th>v2 (m/s)</th>
    </tr>`;
  
  cy.edges().forEach(edge => {
    edgeHTML += `<tr>
      <td>${edge.id()}</td>
      <td>${edge.data('source')} → ${edge.data('target')}</td>
      <td>${parseFloat(edge.data('flow')).toFixed(2)}</td>
      <td>${edge.data('length')}</td>
      <td>${edge.data('diameter')}</td>
      <td>${parseFloat(edge.data('v1') || 0).toFixed(1)}</td>
      <td>${parseFloat(edge.data('v2') || 0).toFixed(1)}</td>
    </tr>`;
  });
  edgeHTML += '</table>';
  
  // Format simulated time
  let hours = Math.floor(simulatedSeconds / 3600);
  let minutes = Math.floor((simulatedSeconds % 3600) / 60);
  let seconds = simulatedSeconds % 60;
  let timeStr = `${hours}h ${minutes}m ${seconds}s`;
  
  document.getElementById('totalVolume').innerHTML =
    "Total Gas Volume: " + totalVolume.toFixed(0) + " m³ (Simulated Time: " + timeStr + ")<br>" +
    "Total Positive Injection: " + positiveInjection.toFixed(4) + " m³/s, " +
    "Total Negative Injection: " + negativeInjection.toFixed(4) + " m³/s";
  
  document.getElementById('info-nodes').innerHTML = nodeHTML;
  document.getElementById('info-edges').innerHTML = edgeHTML;
}



// (Placeholder for future generate graph functionality.)
function generateBtn() {
  // Clear the graph and reset time.
  clearGraph();
  simulatedSeconds = 0;
  
  const L_values = [];
  for (let i = 10; i <= 200; i += 10) { 
    L_values.push(i); 
  }
  const D_values = [];
  for (let i = 200; i <= 1400; i += 100) { 
    D_values.push(i); 
  }
  
  function randChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  const pixelPerKm = 5;
  const mainSegments = randInt(3, 5);
  const possibleMainD = D_values.filter(d => d >= 500);
  const mainD = randChoice(possibleMainD);
  const allowedMainL = L_values.filter(l => l >= mainD / 20 && l <= mainD / 10);
  const mainL = allowedMainL.length ? randChoice(allowedMainL) : Math.min(...L_values);
  
  const startY = 150;
  let startX = 50;
  
  const mainLineNodes = [];
  let nodeId = 'n' + nodeIdCounter;
  nodeIdCounter++;
  cy.add({
    group: 'nodes',
    data: { id: nodeId, branchD: mainD, branchL: mainL, injection: 0 },
    position: { x: startX, y: startY }
  });
  mainLineNodes.push(nodeId);
  
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
    const edgeId = prevNodeId + '_' + nodeId;
    cy.add({
      group: 'edges',
      data: {
        id: edgeId,
        source: prevNodeId,
        target: nodeId,
        flow: 0,
		v1: 0, 
		v2: 0, 
        length: mainL.toFixed(3),
        diameter: mainD.toFixed(0),
        label: "L: " + mainL + " km | D: " + mainD + " mm"
      }
    });
    mainLineNodes.push(nodeId);
  }
  
  const numSecondLayerBranches = randInt(2, 4);
  const mainBranchPoints = mainLineNodes.slice(1);
  const selectedNodes = [];
  while (selectedNodes.length < numSecondLayerBranches && mainBranchPoints.length > 0) {
    const idx = Math.floor(Math.random() * mainBranchPoints.length);
    selectedNodes.push(mainBranchPoints.splice(idx, 1)[0]);
  }
  
  const depth2Branches = [];
  
  selectedNodes.forEach(attachNodeId => {
    const attachNode = cy.getElementById(attachNodeId);
    const parentD = attachNode.data('branchD');
    const parentL = attachNode.data('branchL');
    
    const allowedBranchD = D_values.filter(d => d < parentD);
    if (allowedBranchD.length === 0) return;
    const branchD = randChoice(allowedBranchD);
    
    const branchSegments = randInt(2, 4);
    const allowedBranchL = L_values.filter(l => l >= branchD / 20 && l <= Math.min(branchD / 10, parentL));
    if (allowedBranchL.length === 0) return;
    const branchL = randChoice(allowedBranchL);
    
    const verticalSign = randChoice([1, -1]);
    
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
      const edgeId = branchNodes[branchNodes.length - 1] + '_' + newNodeId;
      cy.add({
        group: 'edges',
        data: {
          id: edgeId,
          source: branchNodes[branchNodes.length - 1],
          target: newNodeId,
          flow: 0,
		  v1: 0, 
		  v2: 0, 
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
  
  depth2Branches.forEach(branch => {
    const numThirdLayerBranches = randInt(1, 3);
    const possibleAttachments = branch.slice(1);
    const selectedAttachments = [];
    while (selectedAttachments.length < numThirdLayerBranches && possibleAttachments.length > 0) {
      const idx = Math.floor(Math.random() * possibleAttachments.length);
      selectedAttachments.push(possibleAttachments.splice(idx, 1)[0]);
    }
    
    selectedAttachments.forEach(attachNodeId => {
      const attachNode = cy.getElementById(attachNodeId);
      const parentD = attachNode.data('branchD');
      const parentL = attachNode.data('branchL');
      
      const allowedBranchD = D_values.filter(d => d < parentD);
      if (allowedBranchD.length === 0) return;
      const branchD = randChoice(allowedBranchD);
      
      const branchSegments = randInt(1, 2);
      const allowedBranchL = L_values.filter(l => l >= branchD / 20 && l <= Math.min(branchD / 10, parentL));
      if (allowedBranchL.length === 0) return;
      const branchL = randChoice(allowedBranchL);
      
      const horizontalSign = randChoice([1, -1]);
      
      let branchX = attachNode.position('x');
      const branchY = attachNode.position('y');
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
        const edgeId = branchNodes[branchNodes.length - 1] + '_' + newNodeId;
        cy.add({
          group: 'edges',
          data: {
            id: edgeId,
            source: branchNodes[branchNodes.length - 1],
            target: newNodeId,
            flow: 0,
			v1: 0, 
			v2: 0, 
            length: branchL.toFixed(3),
            diameter: branchD.toFixed(0),
            label: "L: " + branchL + " km | D: " + branchD + " mm"
          }
        });
        branchNodes.push(newNodeId);
      }
    });
  });
  
  const X = Math.pow(mainD, 2.25) / 20000;
  const firstMainNode = cy.getElementById(mainLineNodes[0]);
  firstMainNode.data('injection', (firstMainNode.data('injection') || 0) + X);
  const lastMainNode = cy.getElementById(mainLineNodes[mainLineNodes.length - 1]);
  lastMainNode.data('injection', (lastMainNode.data('injection') || 0) - 0.5 * X);
  
  const endpoints = cy.nodes().filter(node => node.connectedEdges().length === 1);
  let totalEndpointDiameter = 0;
  endpoints.forEach(node => {
    let d = node.data('branchD');
    if (!d) {
      const edge = node.connectedEdges()[0];
      d = parseFloat(edge.data('diameter'));
    }
    totalEndpointDiameter += d;
  });
  
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

function clearGraph() {
  cy.elements().remove();
  nodeIdCounter = 0;
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

// Global variable to keep track of the active popup
let activePopup = null;

// General function to show a custom pop-up with one or multiple input fields.
// Now supports a "checkbox" field type.
function showMultiInputPopup(fields, x, y) {
  return new Promise(function(resolve) {
    // Create popup container
    const popup = document.createElement('div');
    popup.style.position = 'absolute';
    popup.style.top = y + 'px';
    popup.style.left = x + 'px';
    popup.style.padding = '10px';
    popup.style.background = '#fff';
    popup.style.border = '1px solid #ccc';
    popup.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
    popup.style.zIndex = 1000;
    
    // Build inner HTML dynamically based on fields.
    let innerHTML = '';
    fields.forEach((field, index) => {
      innerHTML += `<label>${field.label}</label><br>`;
      if (field.type === "checkbox") {
        innerHTML += `<input type="checkbox" id="popupInput_${index}" style="margin: 5px 0;" ${field.defaultValue ? "checked" : ""}/><br>`;
      } else {
        innerHTML += `<input type="text" id="popupInput_${index}" value="${field.defaultValue}" style="margin: 5px 0;"/><br>`;
      }
    });
    innerHTML += `<button id="popupOk">OK</button>
                  <button id="popupCancel">Cancel</button>`;
    popup.innerHTML = innerHTML;
    
    // Append popup to the document and store it in the global variable.
    document.body.appendChild(popup);
    activePopup = popup;
    
    // Focus the first input field immediately if it's a text input.
    const firstInput = popup.querySelector('input');
    if (firstInput && firstInput.type !== "checkbox") {
      firstInput.focus();
      firstInput.select();
    }
    
    // Listen for Enter key in the popup to trigger OK button.
    popup.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        popup.querySelector('#popupOk').click();
      }
    });
    
    // OK button event handler.
    popup.querySelector('#popupOk').addEventListener('click', function() {
      let results = {};
      fields.forEach((field, index) => {
        let inputEl = popup.querySelector('#popupInput_' + index);
        if (inputEl.type === "checkbox") {
          results[field.key] = inputEl.checked;
        } else {
          results[field.key] = inputEl.value;
        }
      });
      // Remove popup and clear global variable.
      document.body.removeChild(popup);
      activePopup = null;
      resolve(results);
    });
    
    // Cancel button event handler.
    popup.querySelector('#popupCancel').addEventListener('click', function() {
      document.body.removeChild(popup);
      activePopup = null;
      resolve(null);
    });
  });
}

// Function to close the active pop-up from other parts of your code.
function closeActivePopup() {
  if (activePopup) {
    document.body.removeChild(activePopup);
    activePopup = null;
  }
}

// Update Cytoscape event to use the general pop-up on right-click.
cy.on('cxttap', async function(evt) {
  // If the user clicked on the background, close any active pop-up and do nothing else.
  if (evt.target === cy) {
    closeActivePopup();
    return;
  }
  
  // Get the click position.
  const { x, y } = evt.renderedPosition;
  
  if (evt.target.isNode()) {
    const node = evt.target;
    const currentInjection = node.data('injection') || 0;
    const currentPressure = node.data('pressure') || 0;
    const currentPressureSet = node.data('pressureSet') || false;
    // Call the general pop-up with three fields: one for injection, one for pressure, and a checkbox for pressure.
    const result = await showMultiInputPopup(
      [
        { key: 'injection', label: "Gas input/output, m³/sec:", defaultValue: currentInjection },
        { key: 'pressure', label: "Pressure, MPa:", defaultValue: currentPressure },
        { key: 'pressureSet', label: "Set pressure", type: "checkbox", defaultValue: currentPressureSet }
      ],
      x,
      y
    );
    if (result !== null) {
      const numInjection = parseFloat(result.injection);
      if (!isNaN(numInjection)) {
        node.data('injection', numInjection);
      }
      const numPressure = parseFloat(result.pressure);
      if (!isNaN(numPressure)) {
        node.data('pressure', numPressure);
      }
      node.data('pressureSet', result.pressureSet);
      updateInfo();
    }
  } else if (evt.target.isEdge()) {
    const edge = evt.target;
    // Call the general pop-up with two fields for edge length and diameter.
    const result = await showMultiInputPopup(
      [
        { key: 'length', label: "Length, km:", defaultValue: edge.data('length') },
        { key: 'diameter', label: "Diameter, mm:", defaultValue: edge.data('diameter') }
      ],
      x,
      y
    );
    if (result) {
      const newLength = parseFloat(result.length);
      const newDiameter = parseFloat(result.diameter);
      if (!isNaN(newLength) && newLength > 0) {
        edge.data('length', newLength.toFixed(3));
      }
      if (!isNaN(newDiameter) && newDiameter > 0) {
        edge.data('diameter', newDiameter.toFixed(0));
      }
      edge.data('label', "L: " + edge.data('length') + " km | D: " + edge.data('diameter') + " mm");
      updateInfo();
    }
  }
});

// Creation of new edges
cy.on('tap', function(evt) {
  closeActivePopup();
  if (tappedTimeout) {
    // A tap was pending; treat this as a double-tap.
    clearTimeout(tappedTimeout);
    tappedTimeout = null;
    if (evt.target !== cy) {
      evt.target.remove();
      // Cancel any ongoing creation session.
      if (firstNode) {
        // Remove blue border if it was set.
        firstNode.style({ 'border-color': '', 'border-width': '' });
      }
      creationActive = false;
      firstNode = null;
      updateInfo();
    }
    return;
  } else {
    tappedTimeout = setTimeout(function() {
      if (!creationActive) {
        // FIRST TAP: start a creation session.
        if (evt.target === cy) {
          // Clicked on the canvas: create a new starting node.
          firstNode = cy.add({
            group: 'nodes',
            data: { id: 'n' + nodeIdCounter, injection: 0, pressure: 0, volume: 0 },
            position: { x: evt.position.x, y: evt.position.y }
          });
          nodeIdCounter++;
        } else {
          // Clicked on an existing node: use it as the starting node.
          firstNode = evt.target;
        }
        // Highlight the selected starting node with a blue border.
        firstNode.style({
          'border-color': 'blue',
          'border-width': '1px'
        });
        creationActive = true;
      } else {
        // SECOND TAP: finish the creation session.
        if (evt.target === cy) {
          // Clicked on canvas: create a new node at click position.
          let secondNode = cy.add({
            group: 'nodes',
            data: { id: 'n' + nodeIdCounter, injection: 0, pressure: 0, volume: 0 },
            position: { x: evt.position.x, y: evt.position.y }
          });
          nodeIdCounter++;
          let newEdgeId = firstNode.id() + '_' + secondNode.id();
          cy.add({
            group: 'edges',
            data: {
              id: newEdgeId,
              source: firstNode.id(),
              target: secondNode.id(),
              flow: 0,
			  	v1: 0, 
				v2: 0, 
              length: "1.000",
              diameter: "565.00",
              label: "L: 1.000 km | D: 565 mm"
            }
          });
        } else {
          // Clicked on an existing node: create an edge from the starting node to this node.
          if (evt.target.id() !== firstNode.id()) {
            let newEdgeId = firstNode.id() + '_' + evt.target.id();
            if (!cy.getElementById(newEdgeId).length) {
              cy.add({
                group: 'edges',
                data: {
                  id: newEdgeId,
                  source: firstNode.id(),
                  target: evt.target.id(),
                  flow: 0,
					v1: 0, 
					v2: 0, 
                  length: "1.000",
                  diameter: "565.00",
                  label: "L: 1.000 km | D: 565 mm"
                }
              });
            }
          }
        }
        // Remove blue border from the starting node and end creation session.
        firstNode.style({
          'border-color': '',
          'border-width': ''
        });
        creationActive = false;
        firstNode = null;
        updateInfo();
      }
      tappedTimeout = null;
    }, doubleTapThreshold);
  }
});

// --- Added Code: Prevent pop-up from closing immediately after a long tap ---

// Flag to ignore the next tap event that would close the popup.
let ignoreNextClose = false;

// Save the original closeActivePopup function.
const originalCloseActivePopup = closeActivePopup;

// Override closeActivePopup to skip closing when ignoreNextClose is true.
closeActivePopup = function() {
  if (ignoreNextClose) {
    // Reset the flag and do nothing.
    ignoreNextClose = false;
    return;
  }
  // Otherwise, call the original function.
  originalCloseActivePopup();
};

// Modified long tap (taphold) event handler that sets the flag.
cy.on('taphold', async function(evt) {
  // Set flag so that the subsequent tap event does not close the pop-up.
  ignoreNextClose = true;
  
  // If the long tap is on the background, close any active pop-up.
  if (evt.target === cy) {
    closeActivePopup();
    return;
  }
  
  // Get the tap position.
  const { x, y } = evt.renderedPosition;
  
  if (evt.target.isNode()) {
    // If a node is long-tapped, open the node pop-up.
    const node = evt.target;
    const currentInjection = node.data('injection') || 0;
    const currentPressure = node.data('pressure') || 0;
    const currentPressureSet = node.data('pressureSet') || false;
    const result = await showMultiInputPopup(
      [
        { key: 'injection', label: "Gas input/output, m³/sec:", defaultValue: currentInjection },
        { key: 'pressure', label: "Pressure, MPa:", defaultValue: currentPressure },
        { key: 'pressureSet', label: "Set pressure", type: "checkbox", defaultValue: currentPressureSet }
      ],
      x,
      y
    );
    if (result !== null) {
      const numInjection = parseFloat(result.injection);
      if (!isNaN(numInjection)) {
        node.data('injection', numInjection);
      }
      const numPressure = parseFloat(result.pressure);
      if (!isNaN(numPressure)) {
        node.data('pressure', numPressure);
      }
      node.data('pressureSet', result.pressureSet);
      updateInfo();
    }
  } else if (evt.target.isEdge()) {
    // If an edge is long-tapped, open the edge pop-up.
    const edge = evt.target;
    const result = await showMultiInputPopup(
      [
        { key: 'length', label: "Length, km:", defaultValue: edge.data('length') },
        { key: 'diameter', label: "Diameter, mm:", defaultValue: edge.data('diameter') }
      ],
      x,
      y
    );
    if (result) {
      const newLength = parseFloat(result.length);
      const newDiameter = parseFloat(result.diameter);
      if (!isNaN(newLength) && newLength > 0) {
        edge.data('length', newLength.toFixed(3));
      }
      if (!isNaN(newDiameter) && newDiameter > 0) {
        edge.data('diameter', newDiameter.toFixed(0));
      }
      edge.data('label', "L: " + edge.data('length') + " km | D: " + edge.data('diameter') + " mm");
      updateInfo();
    }
  }
});

// Store the graph in memory
function saveGraphToLocalStorage() {
  const elements = cy.json().elements;
  const state = {
    elements,
    simulatedSeconds
  };
  localStorage.setItem("graphState", JSON.stringify(state));
}

function loadGraphFromLocalStorage() {
  const savedState = localStorage.getItem("graphState");
  if (savedState) {
    const { elements, simulatedSeconds: savedTime } = JSON.parse(savedState);
    cy.elements().remove();
    cy.add(elements);
    simulatedSeconds = savedTime || 0;
    updateInfo(); // refresh tables and display
  }
}

// Call loadGraphFromLocalStorage on page load
window.addEventListener("load", loadGraphFromLocalStorage);
// Save graph to localStorage when the page is about to unload
window.addEventListener("beforeunload", saveGraphToLocalStorage);
