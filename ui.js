// Set number of segments
const SEGMENT_COUNT = 5;

// Global variables.
let nodeIdCounter = 0;
let tappedTimeout = null;
let creationActive = false;
let firstNode = null;
let doubleTapThreshold = 250; // in milliseconds

// Disable the default context menu.
document.addEventListener('contextmenu', function(e) {
  e.preventDefault();
});

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
        'text-halign': 'center',       // center label horizontally
        'text-valign': 'center',         // center label vertically
        'color': 'black',
        'text-border-color': 'black',
        'text-border-width': 1,
        'font-size': 10,
        'width': 12,
        'height': 12,
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
        'line-color': '#999',
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'label': 'data(label)',
        'font-size': 10,
        'text-halign': 'center',      // center label horizontally
        'text-valign': 'center',      // center label vertically
        'text-rotation': 'autorotate',
        'text-wrap': 'wrap',
        'text-max-width': '200px'
      }
    }
  ],
  layout: { name: 'preset' }
});

function createEdgeData(sourceId, targetId, length, diameter) {
  const volumes = Array(SEGMENT_COUNT).fill(0);
  const flows = Array(SEGMENT_COUNT - 1).fill(0);
  const pressures = Array(SEGMENT_COUNT).fill(0); // Added segment pressures.
  return {
    id: `${sourceId}_${targetId}`,
    source: sourceId,
    target: targetId,
    flow: 0,
    v1: 0,
    v2: 0,
    length: length.toFixed(3),
    diameter: diameter.toFixed(0),
    name: ".", // default edge name is "."
    volumeSegments: volumes,
    flowSegments: flows,
    pressureSegments: pressures, // New pressure segments array.
    // Label: first row shows length/diameter, second row shows name.
    label: `L: ${length} km | D: ${diameter} mm\n.`
  };
}

function updateInfo() {
  let totalVolume = 0;
  let positiveInjection = 0;
  let negativeInjection = 0;

  let nodeHTML = `<table border="1" cellpadding="4" cellspacing="0">
    <tr>
      <th>ID</th>
      <th>Name</th>
      <th>Position</th>
      <th>Pressure (MPa)</th>
      <th>Geometry</th>
      <th>Injection (m³/s)</th>
    </tr>`;

  // Update node labels (first row: pressure/injection, second row: name)
  cy.nodes().forEach(node => {
    let injection = parseFloat(node.data('injection') || 0);
    let pressure = parseFloat(node.data('pressure') || 0);

    if (injection > 0) positiveInjection += injection;
    else negativeInjection += injection;

    // Calculate geometry based on connected edges.
    let geometry = 0;
    node.connectedEdges().forEach(edge => {
      let D = parseFloat(edge.data('diameter'));
      let L = parseFloat(edge.data('length'));
      geometry += 3.1415 * Math.pow(D / 1000, 2) * (L / 2) * (1000 / 4);
    });
    node.data('geometry', geometry);

    let base = `P: ${pressure.toFixed(2)}`;
    if (injection !== 0) base += ` | I: ${injection.toFixed(0)}`;
    node.data('label', base + "\n" + "\n"+ (node.data('name') || "."));

    nodeHTML += `<tr>
      <td>${node.id()}</td>
      <td>${node.data('name')}</td>
      <td>(${Math.round(node.position('x'))}, ${Math.round(node.position('y'))})</td>
      <td>${pressure.toFixed(2)}</td>
      <td>${geometry.toFixed(1)}</td>
      <td>${injection !== 0 ? injection.toFixed(0) : ''}</td>
    </tr>`;
  });
  nodeHTML += '</table>';

  let edgeHTML = `<table border="1" cellpadding="4" cellspacing="0">
    <tr>
      <th>ID</th>
      <th>Name</th>
      <th>Source → Target</th>
      <th>L, km</th>
      <th>D, mm</th>
      <th>v1, m/s</th>
      <th>v2, m/s</th>
      <th>Volumes, m3</th>
      <th>Flows, m3/s</th>
      <th>Pressures, MPa</th>
    </tr>`;

  // Update edge labels (first row: L and D, second row: name).
  cy.edges().forEach(edge => {
    let vols = (edge.data('volumeSegments') || []).map(v => v.toFixed(0)).join(', ');
    let flows = (edge.data('flowSegments') || []).map(f => f.toFixed(2)).join(', ');
    let pressures = (edge.data('pressureSegments') || []).map(p => p.toFixed(2)).join(', ');
    totalVolume += (edge.data('volumeSegments') || []).reduce((sum, v) => sum + v, 0);

    // Update the visible label.
    edge.data('label', "L: " + edge.data('length') + " km | D: " + edge.data('diameter') + " mm" + "\n" + "\n"+ (edge.data('name') || "."));

    edgeHTML += `<tr>
      <td>${edge.id()}</td>
      <td>${edge.data('name')}</td>
      <td>${edge.data('source')} → ${edge.data('target')}</td>
      <td>${edge.data('length')}</td>
      <td>${edge.data('diameter')}</td>
      <td>${parseFloat(edge.data('v1') || 0).toFixed(1)}</td>
      <td>${parseFloat(edge.data('v2') || 0).toFixed(1)}</td>
      <td>${vols}</td>
      <td>${flows}</td>
      <td>${pressures}</td>
    </tr>`;
  });
  edgeHTML += '</table>';

  document.getElementById('totalVolume').innerHTML =
    `Total Gas Volume: ${totalVolume.toFixed(0)} m³ (Simulated Time: ${Math.floor(simulatedSeconds / 3600)}h ${Math.floor((simulatedSeconds % 3600) / 60)}m ${simulatedSeconds % 60}s)<br>` +
    `Total Positive Injection: ${positiveInjection.toFixed(0)} m³/s, ` +
    `Total Negative Injection: ${negativeInjection.toFixed(0)} m³/s`;

  document.getElementById('info-nodes').innerHTML = nodeHTML;
  document.getElementById('info-edges').innerHTML = edgeHTML;
}

function clearGraph() {
  cy.elements().remove();
  nodeIdCounter = 0;
  updateInfo();
  simulatedSeconds = 0;
}
document.getElementById('clearBtn').addEventListener('click', clearGraph);

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
    // Add flex‑row styles
    popup.innerHTML = `
      <style>
        .popup-row {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
        }
        .popup-row label {
          flex: 0 0 auto;
          margin-right: 8px;
          width: 140px;          /* or adjust as needed */
        }
        .popup-row input {
          flex: 1 1 auto;
        }
        .popup-buttons {
          text-align: right;
          margin-top: 8px;
        }
        .popup-buttons button {
          margin-left: 4px;
        }
      </style>
    `;

    // Build each row
    fields.forEach((field, index) => {
      const type = field.type === "checkbox" ? "checkbox" : "text";
      const checked = field.type === "checkbox" && field.defaultValue ? "checked" : "";
      const valueAttr = field.type !== "checkbox" ? `value="${field.defaultValue}"` : "";
      popup.innerHTML += `
        <div class="popup-row">
          <label for="popupInput_${index}">${field.label}</label>
          <input
            type="${type}"
            id="popupInput_${index}"
            ${valueAttr}
            ${checked}
			style="width: 60px; padding: 4px;"
          />
        </div>
      `;
    });

    // Add buttons
    popup.innerHTML += `
	<div class="popup-buttons">
	  <button id="popupOk" style="width: 110px;">OK</button>
	  <button id="popupCancel" style="width: 110px;">Cancel</button>
	</div>

    `;

    document.body.appendChild(popup);
    activePopup = popup;

    // Focus first text input
    const firstInput = popup.querySelector('input[type="text"]');
    if (firstInput) {
      firstInput.focus();
      firstInput.select();
    }

    // Handle Enter key
    popup.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        popup.querySelector('#popupOk').click();
      }
    });

    // OK handler
    popup.querySelector('#popupOk').addEventListener('click', function() {
      const results = {};
      fields.forEach((field, index) => {
        const inputEl = popup.querySelector('#popupInput_' + index);
        results[field.key] = inputEl.type === "checkbox"
          ? inputEl.checked
          : inputEl.value;
      });
      document.body.removeChild(popup);
      activePopup = null;
      resolve(results);
    });

    // Cancel handler
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
    // Include the name field in the node popup.
    const result = await showMultiInputPopup(
      [
        { key: 'name', label: "Name:", defaultValue: node.data('name') || "." },
        { key: 'injection', label: "Gas in/out, m³/s:", defaultValue: currentInjection },
        { key: 'pressure', label: "Pressure, MPa:", defaultValue: currentPressure },
        { key: 'pressureSet', label: "Set pressure", type: "checkbox", defaultValue: currentPressureSet }
      ],
      x,
      y
    );
    if (result !== null) {
      // Update the node name and other data.
      node.data('name', result.name);
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
    // Include the name field in the edge popup.
    const result = await showMultiInputPopup(
      [
        { key: 'name', label: "Name:", defaultValue: edge.data('name') || "." },
        { key: 'length', label: "Length, km:", defaultValue: edge.data('length') },
        { key: 'diameter', label: "Diameter, mm:", defaultValue: edge.data('diameter') },
        { key: 'E', label: "E", defaultValue: edge.data('E') },
        { key: 'Z', label: "Z", defaultValue: edge.data('Z') },
        { key: 'T', label: "T", defaultValue: edge.data('T') }
      ],
      x,
      y
    );
    if (result) {
      // Update the edge name and other data.
      edge.data('name', result.name);
      const newLength = parseFloat(result.length);
      const newDiameter = parseFloat(result.diameter);
      const newE = parseFloat(result.E);
      const newZ = parseFloat(result.Z);
      const newT = parseFloat(result.T);
      if (!isNaN(newLength) && newLength > 0) {
        edge.data('length', newLength.toFixed(3));
      }
      if (!isNaN(newDiameter) && newDiameter > 0) {
        edge.data('diameter', newDiameter.toFixed(0));
      }
      if (!isNaN(newE) && newE > 0.5 && newE <= 1) {
        edge.data('E', newE.toFixed(2));
      }
      if (!isNaN(newZ) && newZ > 0.5 && newZ <= 1) {
        edge.data('Z', newZ.toFixed(2));
      }
      if (!isNaN(newT) && newT > -30 && newT <= 100) {
        edge.data('T', newT.toFixed(1));
      }
      edge.data('label', "L: " + edge.data('length') + " km | D: " + edge.data('diameter') + " mm" + "\n" + "\n"+ (edge.data('name') || "."));
      updateInfo();
    }
  }
});

// Creation of new edges (and nodes) using tap events.
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
            data: { 
              id: 'n' + nodeIdCounter,
              injection: 0,
              pressure: 0,
              name: '.', // default name is "."
              label: '', // will be updated in updateInfo
              volumeSegments: Array(SEGMENT_COUNT).fill(0)
            },
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
            data: { 
              id: 'n' + nodeIdCounter,
              injection: 0,
              pressure: 0,
              name: '.', // default name is "."
              label: '', // will be updated in updateInfo
              volumeSegments: Array(SEGMENT_COUNT).fill(0)
            },
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
              length: "10",
              diameter: "565.00",
              E: "0.95",
              Z: "0.81",
              T: "15",
              name: ".", // default edge name is "."
              label: "L: 10.000 km | D: 565 mm\n.",
              volumeSegments: Array(SEGMENT_COUNT).fill(0),
              flowSegments: Array(SEGMENT_COUNT - 1).fill(0),
              pressureSegments: Array(SEGMENT_COUNT).fill(0) // Added segment pressures.
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
                  length: "10",
                  diameter: "565.00",
				  E: "0.95",
				  Z: "0.81",
				  T: "15",
                  name: ".", // default name for edge
                  label: "L: 10.000 km | D: 565 mm\n.",
                  volumeSegments: Array(SEGMENT_COUNT).fill(0),
                  flowSegments: Array(SEGMENT_COUNT - 1).fill(0),
                  pressureSegments: Array(SEGMENT_COUNT).fill(0) // Added segment pressures.
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
        { key: 'name', label: "Name:", defaultValue: node.data('name') || "." },
        { key: 'injection', label: "Gas input/output, m³/s:", defaultValue: currentInjection },
        { key: 'pressure', label: "Pressure, MPa:", defaultValue: currentPressure },
        { key: 'pressureSet', label: "Set pressure", type: "checkbox", defaultValue: currentPressureSet }
      ],
      x,
      y
    );
    if (result !== null) {
      node.data('name', result.name);
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
        { key: 'name', label: "Name:", defaultValue: edge.data('name') || "." },
        { key: 'length', label: "Length, km:", defaultValue: edge.data('length') },
        { key: 'diameter', label: "Diameter, mm:", defaultValue: edge.data('diameter') },
        { key: 'E', label: "E:", defaultValue: edge.data('E') },
        { key: 'Z', label: "Z", defaultValue: edge.data('Z') },
        { key: 'T', label: "T", defaultValue: edge.data('T') }
      ],
      x,
      y
    );
    if (result) {
      edge.data('name', result.name);
      const newLength = parseFloat(result.length);
      const newDiameter = parseFloat(result.diameter);
      const newE = parseFloat(result.E);
      const newZ = parseFloat(result.Z);
      const newT = parseFloat(result.T);
      if (!isNaN(newLength) && newLength > 0) {
        edge.data('length', newLength.toFixed(3));
      }
      if (!isNaN(newDiameter) && newDiameter > 0) {
        edge.data('diameter', newDiameter.toFixed(0));
      }
      if (!isNaN(newE) && newE > 0.5 && newE <= 1) {
        edge.data('E', newE.toFixed(2));
      }
      if (!isNaN(newZ) && newZ > 0.5 && newZ <= 1) {
        edge.data('Z', newZ.toFixed(2));
      }
      if (!isNaN(newT) && newT > -30 && newT <= 100) {
        edge.data('T', newT.toFixed(1));
      }
      edge.data('label', "L: " + edge.data('length') + " km | D: " + edge.data('diameter') + " mm" + "\n"+ "\n" + (edge.data('name') || "."));
      updateInfo();
    }
  }
});

// Snap to grid while moving node.
cy.on('dragfree', 'node', function(evt) {
  const node = evt.target;
  const pos = node.position();
  node.position({
    x: Math.round(pos.x / 10) * 10,
    y: Math.round(pos.y / 10) * 10
  });
});

// Store the graph in memory.
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

// Call loadGraphFromLocalStorage on page load.
window.addEventListener("load", loadGraphFromLocalStorage);
// Save graph to localStorage when the page is about to unload.
window.addEventListener("beforeunload", saveGraphToLocalStorage);
