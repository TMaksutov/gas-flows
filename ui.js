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
  let nodeHTML = '<ul>';
  let edgeHTML = '<ul>';

  cy.nodes().forEach(node => {
    let injection = parseFloat(node.data('injection') || 0);
    let volume = parseFloat(node.data('volume') || 0);
    let pressure = parseFloat(node.data('pressure') || 0);
    totalVolume += volume;
    let geometry = 0;
    node.connectedEdges().forEach(edge => {
      let D = parseFloat(edge.data('diameter'));
      let L = parseFloat(edge.data('length'));
      geometry += 3.1415 * D / 1000 * D / 1000 * L / 2 * 1000 / 4;
    });
    node.data('geometry', geometry);

    let label = "P: " + pressure.toFixed(2);
    if (injection !== 0) {
      label += " | I: " + injection.toFixed(2);
    }
    node.data('label', label);

    nodeHTML += `<li>${node.id()}: Position (${Math.round(node.position('x'))}, ${Math.round(node.position('y'))}); 
    Volume: ${volume.toFixed(0)} m³, Pressure: ${pressure.toFixed(2)}, Geometry: ${geometry.toFixed(1)}`;
    if (injection !== 0) {
      nodeHTML += `, Injection: ${injection}`;
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

  document.getElementById('totalVolume').textContent =
    "Total Gas Volume: " + totalVolume.toFixed(0) + " m³ (Simulated Time: " + timeStr + ")";

  document.getElementById('nodeList').innerHTML = '<strong>Nodes:</strong>' + nodeHTML;
  document.getElementById('edgeList').innerHTML = '<strong>Edges:</strong>' + edgeHTML;
}

// (Placeholder for future generate graph functionality.)

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
