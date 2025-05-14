// Dynamic segment count based on pipeline length:
function getSegmentCount(lengthKm) {
  if (lengthKm <= 30) return 2;
  if (lengthKm > 300) return 30;
  const extra = Math.ceil((lengthKm - 30) / 10);
  return Math.min(2 + extra, 30);
}

// Global variables.
let nodeIdCounter     = 0;
let tappedTimeout     = null;
window.creationActive = false;
window.firstNode      = null;
let doubleTapThreshold= 250; // ms
let activePopup       = null;

// Base closeActivePopup
function closeActivePopup() {
  if (activePopup) {
    document.body.removeChild(activePopup);
    activePopup = null;
  }
}

function speedToColor(speed) {
  const absSpeed = Math.abs(speed);

  const stops = [
    { speed: 0, color: [153, 153, 153] }, // Grey
    { speed: 5, color: [0, 255, 0] },     // Green
    { speed: 20, color: [255, 0, 0] },    // Red
    { speed: 40, color: [128, 0, 128] }   // Purple
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    const curr = stops[i];
    const next = stops[i + 1];
    if (absSpeed <= next.speed) {
      const ratio = (absSpeed - curr.speed) / (next.speed - curr.speed);
      const r = Math.round(curr.color[0] * (1 - ratio) + next.color[0] * ratio);
      const g = Math.round(curr.color[1] * (1 - ratio) + next.color[1] * ratio);
      const b = Math.round(curr.color[2] * (1 - ratio) + next.color[2] * ratio);
      return `rgb(${r},${g},${b})`;
    }
  }

  // Above the last stop (40+ m/s): just purple
  return `rgb(${stops[stops.length - 1].color.join(',')})`;
}


let dashAnimationTick = 0;

function animateDashOffset() {
  if (simulationMode !== "stop") {
    const delta = 1 / 60; // ~60 FPS
	
    // Determine multiplier based on simulationMode
    let speedMultiplier = 0.5;
    if (simulationMode === "min") {
      speedMultiplier = 2;
    } else if (simulationMode === "hour") {
      speedMultiplier = 5;
    }
	
    cy.edges().forEach(edge => {
      const prevSpeed = edge.data('_prevSpeed') || 0;
      const v1 = parseFloat(edge.data('v1')) || 0;
      const v2 = parseFloat(edge.data('v2')) || 0;
      const targetSpeed = speedMultiplier * Math.max(Math.abs(v1), Math.abs(v2));
      const smoothedSpeed = prevSpeed * 0.8 + targetSpeed * 0.2;
      edge.data('_prevSpeed', smoothedSpeed);

      const sourceNode = cy.getElementById(edge.data('source'));
      const targetNode = cy.getElementById(edge.data('target'));
      const pStart = parseFloat(sourceNode.data('pressure')) || 0;
      const pEnd = parseFloat(targetNode.data('pressure')) || 0;
      const direction = Math.sign(pEnd - pStart) || 1;

      const oldOffset = edge.data('_dashOffset') || 0;
      const newOffset = oldOffset + direction * smoothedSpeed * delta;
      edge.data('_dashOffset', newOffset);

      edge.style({
        'line-style': 'dashed',
        'line-dash-pattern': [7, 1],
        'line-dash-offset': newOffset
      });
    });
  }

  requestAnimationFrame(animateDashOffset);
}







requestAnimationFrame(animateDashOffset);



// Suppress native context menu on right‑click
document.addEventListener('contextmenu', e => e.preventDefault());

// Initialize Cytoscape
let cy = cytoscape({
  container: document.getElementById('cy'),
  wheelSensitivity: 0.2,
  style: [
    {
      selector: 'node',
      style: {
      'background-color': ele => ele.data('pressureSet') === true
                               ? 'blue'
                               : ele.data('injection') > 0
                                 ? 'green'
                                 : ele.data('injection') < 0
                                   ? 'red'
                                   : '#999',
        'label': 'data(label)',
        'text-halign': 'center',
        'text-valign': 'center',
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
    'width': edge => 1 + Math.round((parseFloat(edge.data('diameter')) || 0) / 200),
    'line-color': edge => {
      const v1 = parseFloat(edge.data('v1')) || 0;
      const v2 = parseFloat(edge.data('v2')) || 0;
      return speedToColor(Math.max(Math.abs(v1), Math.abs(v2)));
    },
    'line-style': ele => ele.data('disable') ? 'dashed' : 'solid',
    'line-dash-pattern': [7, 1],
    'line-dash-offset': 0, // will be animated
    'curve-style': 'bezier',
    'target-arrow-shape': 'triangle',
    'label': 'data(label)',
    'font-size': 10,
    'text-halign': 'center',
    'text-valign': 'center',
    'text-rotation': 'autorotate',
    'text-wrap': 'wrap',
    'text-max-width': '200px'
  }
},

  ],
  layout: { name: 'preset' }
});

// Create edge data (with defaults for E, Z, T)
function createEdgeData(sourceId, targetId, length, diameter) {
  length = Math.max(length, 0.1);    // Force minimum 0.1 km
  diameter = Math.max(diameter, 50); // Force minimum 50 mm
  const segCount = getSegmentCount(length);
  return {
    id: `${sourceId}_${targetId}`,
    source: sourceId,
    target: targetId,
    flow: 0,
    v1: 0,
    v2: 0,
    length: length.toFixed(1),
    diameter: diameter.toFixed(0),
    E: "0.95",
    Z: "0.81",
    T: "15",
    name: ".",
    disable: false,
    volumeSegments: Array(segCount).fill(0),
    flowSegments: Array(segCount - 1).fill(0),
    pressureSegments: Array(segCount).fill(0),
    label: `L: ${length.toFixed(1)} km | D: ${diameter.toFixed(0)} mm\n.`
  };
}




// Update tables & labels
function updateInfo() {
  let totalVol = 0, posInj = 0, negInj = 0;
  let nodeHTML = `<table border="1" cellpadding="4" cellspacing="0">
    <tr><th>ID</th><th>Name</th><th>Pos</th>
        <th>P (MPa)</th><th>Geom</th><th>I (m³/s)</th></tr>`;
  cy.nodes().forEach(node => {
    const inj = parseFloat(node.data('injection') || 0);
    const pres = parseFloat(node.data('pressure') || 0);
    inj > 0 ? posInj += inj : negInj += inj;
    let geom = 0;
    node.connectedEdges().forEach(e => {
      const D = parseFloat(e.data('diameter')),
            L = parseFloat(e.data('length'));
      geom += Math.PI * (D / 1000) ** 2 * (L / 2) * (1000 / 4);
    });
    node.data('geometry', geom);
    let base = `P: ${pres.toFixed(2)}`;
    if (inj !== 0) base += ` | I: ${inj.toFixed(0)}`;
    node.data('label', base + "\n\n" + (node.data('name') || "."));
    nodeHTML += `<tr>
      <td>${node.id()}</td>
      <td>${node.data('name')}</td>
      <td>(${Math.round(node.position('x'))},${Math.round(node.position('y'))})</td>
      <td>${pres.toFixed(2)}</td>
      <td>${geom.toFixed(1)}</td>
      <td>${inj ? inj.toFixed(0) : ''}</td>
    </tr>`;
  });
  nodeHTML += `</table>`;

  let edgeHTML = `<table border="1" cellpadding="4" cellspacing="0">
    <tr><th>ID</th><th>Name</th><th>Src→Tgt</th>
        <th>L, km</th><th>D, mm</th><th>v1, m/s</th><th>v2, m/s</th>
        <th>Gas Vol.</th><th>Segment Volumes, m³</th><th>Segment Flows, standart m³/sec </th><th>Segment Pressures, MPa</th></tr>`;

  cy.edges().forEach(edge => {
    const vs = (edge.data('volumeSegments') || []).map(v => v.toFixed(0)).join(', ');
    const fs = (edge.data('flowSegments') || []).map(f => f.toFixed(2)).join(', ');
    const ps = (edge.data('pressureSegments') || []).map(p => p.toFixed(2)).join(', ');
    const sumVol = (edge.data('volumeSegments') || []).reduce((s, v) => s + v, 0);
    totalVol += sumVol;

    const formattedTotalVol = (() => {
      if (sumVol >= 1_000_000) return (sumVol / 1_000_000).toFixed(2) + ' M m³';
      if (sumVol >= 1_000) return (sumVol / 1_000).toFixed(1) + ' k m³';
      return sumVol.toFixed(0) + ' m³';
    })();

    edge.data('label',
      `L: ${edge.data('length')} km | D: ${edge.data('diameter')} mm\n\n` +
      `${edge.data('name') || '.'}`
    );

    edgeHTML += `<tr>
      <td>${edge.id()}</td>
      <td>${edge.data('name')}</td>
      <td>${edge.data('source')}→${edge.data('target')}</td>
      <td>${parseFloat(edge.data('length')).toFixed(1)}</td>
      <td>${edge.data('diameter')}</td>
      <td>${parseFloat(edge.data('v1') || 0).toFixed(1)}</td>
      <td>${parseFloat(edge.data('v2') || 0).toFixed(1)}</td>
      <td>${formattedTotalVol}</td>
      <td>${vs}</td>
      <td>${fs}</td>
      <td>${ps}</td>
    </tr>`;
  });
  edgeHTML += `</table>`;

  document.getElementById('info-nodes').innerHTML = nodeHTML;

  document.getElementById('info-edges').innerHTML =
    `<div style="margin: 10px 0; font-weight: bold; text-align: center;">
      Total Gas Volume: ${
        (() => {
          if (totalVol >= 1_000_000) return (totalVol / 1_000_000).toFixed(2) + ' M m³';
          if (totalVol >= 1_000) return (totalVol / 1_000).toFixed(1) + ' k m³';
          return totalVol.toFixed(0) + ' m³';
        })()
      }      |      Inputs: ${posInj.toFixed(0)} m³/s, Outputs: ${negInj.toFixed(0)} m³/s
           |      Simulation: ${Math.floor(simulatedSeconds / 3600)} h ${Math.floor((simulatedSeconds % 3600) / 60)} m ${simulatedSeconds % 60} s
    </div>` +
    edgeHTML;
}


// Reset everything
function clearGraph() {
  cy.elements().remove();
  nodeIdCounter = 0;
  simulatedSeconds = 0;
  updateInfo();

  // also erase the saved state
  localStorage.removeItem('graphState');
}

document.getElementById('clearBtn')
        .addEventListener('click', clearGraph);

// Popup helper (text & checkbox fields)
function showMultiInputPopup(fields, x, y) {
  return new Promise(resolve => {
    const pop = document.createElement('div');
    pop.style.cssText = `
      position:absolute; top:${y}px; left:${x}px;
      padding:10px; background:#fff; border:1px solid #ccc;
      box-shadow:0 2px 5px rgba(0,0,0,0.3); z-index:1000;
    `;
    pop.innerHTML = `<style>
      .popup-row { display:flex; align-items:center; margin-bottom:8px }
      .popup-row label { width:140px; margin-right:8px }
      .popup-row input { flex:1; width:60px; padding:4px }
      .popup-buttons { text-align:right; margin-top:8px }
      .popup-buttons button { margin-left:4px; width:110px }
    </style>`;
    fields.forEach((f,i) => {
      const type = f.type==='checkbox'?'checkbox':'text';
      const chk  = f.type==='checkbox'&&f.defaultValue?'checked':'';
      const val  = f.type!=='checkbox'?`value="${f.defaultValue}"`:'';
      pop.innerHTML += `
        <div class="popup-row">
          <label for="inp${i}">${f.label}</label>
          <input type="${type}" id="inp${i}" ${val} ${chk}/>
        </div>
      `;
    });
    pop.innerHTML += `
      <div class="popup-buttons">
        <button id="okBtn">OK</button>
        <button id="cancelBtn">Cancel</button>
      </div>
    `;
    document.body.appendChild(pop);
    activePopup = pop;
    const first = pop.querySelector('input[type="text"]');
    if (first) { first.focus(); first.select(); }
    pop.addEventListener('keydown', e => {
      if (e.key==='Enter') {
        e.preventDefault();
        pop.querySelector('#okBtn').click();
      }
    });
    pop.querySelector('#okBtn').addEventListener('click', () => {
      const res = {};
      fields.forEach((f,i) => {
        const inp = pop.querySelector(`#inp${i}`);
        res[f.key] = inp.type==='checkbox'?inp.checked:inp.value;
      });
      document.body.removeChild(pop);
      activePopup = null;
      resolve(res);
    });
    pop.querySelector('#cancelBtn').addEventListener('click', () => {
      document.body.removeChild(pop);
      activePopup = null;
      resolve(null);
    });
  });
}

// Ignore next close after taphold
let ignoreNextClose = false;
const _origClose = closeActivePopup;
closeActivePopup = function() {
  if (ignoreNextClose) { ignoreNextClose = false; return; }
  _origClose();
};

// Handle edge popup (recalc segments on length change)
async function handleEdgePopup(edge, x, y) {
  const originalLength = parseFloat(edge.data('length'));
  const originalDiameter = parseFloat(edge.data('diameter'));

  const result = await showMultiInputPopup([
    { key:'name',     label:"Name:",         defaultValue:edge.data('name') },
    { key:'length',   label:"Length, km:",   defaultValue:edge.data('length') },
    { key:'diameter', label:"Diameter, mm:", defaultValue:edge.data('diameter') },
    { key:'E',        label:"E",             defaultValue:edge.data('E') },
    { key:'Z',        label:"Z",             defaultValue:edge.data('Z') },
    { key:'T',        label:"T",             defaultValue:edge.data('T') },
    { key:'disable',  label:"Disable",       type:'checkbox', defaultValue:edge.data('disable') || false }
  ], x, y);

  if (!result) return;

  edge.data('name', result.name);

const newL = parseFloat(result.length);
if (parseFloat(newL.toFixed(3)) < 0.1) {
  alert('Length must be at least 0.1 km.');
  return;  // Cancel the edit
}

const newD = parseFloat(result.diameter);
if (parseFloat(newD.toFixed(2)) < 50) {
  alert('Diameter must be at least 50 mm.');
  return;  // Cancel the edit
}



  // Only reinitialize segments if length or diameter changed
  const lengthChanged = !isNaN(newL) && newL >= 0.1 && newL !== originalLength;
  const diameterChanged = !isNaN(newD) && newD > 0 && newD !== originalDiameter;

  if (lengthChanged || diameterChanged) {
    const sc = getSegmentCount(newL);
    edge.data('length', newL.toFixed(1));
    edge.data('diameter', newD.toFixed(0));
    edge.data('volumeSegments',    Array(sc).fill(0));
    edge.data('flowSegments',      Array(sc - 1).fill(0));
    edge.data('pressureSegments',  Array(sc).fill(0));
  } else {
    if (!isNaN(newL) && newL >= 0.1) edge.data('length', newL.toFixed(1));
    if (!isNaN(newD) && newD > 0) edge.data('diameter', newD.toFixed(0));
  }

  const newE = parseFloat(result.E);
  if (!isNaN(newE) && newE > 0.5 && newE <= 1) edge.data('E', newE.toFixed(2));

  const newZ = parseFloat(result.Z);
  if (!isNaN(newZ) && newZ > 0.5 && newZ <= 1) edge.data('Z', newZ.toFixed(2));

  const newT = parseFloat(result.T);
  if (!isNaN(newT) && newT > -30 && newT <= 100) edge.data('T', newT.toFixed(1));

  edge.data('disable', result.disable);

  edge.data('label',
    `L: ${edge.data('length')} km | D: ${edge.data('diameter')} mm\n\n` +
    `${edge.data('name') || '.'}`
  );

  updateInfo();
}


// Right‑click (cxttap) for nodes & edges
cy.on('cxttap', async evt => {
  if (evt.target===cy) { closeActivePopup(); return; }
  const { x,y } = evt.renderedPosition;
  if (evt.target.isNode()) {
    const n = evt.target;
    const res = await showMultiInputPopup([
      { key:'name',       label:"Name:",              defaultValue:n.data('name') },
      { key:'injection',  label:"Gas in/out, m³/s:",  defaultValue:n.data('injection') },
      { key:'pressure',   label:"Pressure, MPa:",     defaultValue:n.data('pressure') },
      { key:'pressureSet',label:"Set pressure",       type:'checkbox', defaultValue:n.data('pressureSet') }
    ], x, y);
    if (res) {
      n.data('name', res.name);
      const ni = parseFloat(res.injection);
      if (!isNaN(ni)) n.data('injection', ni);
      const np = parseFloat(res.pressure);
      if (!isNaN(np)) n.data('pressure', np);
      n.data('pressureSet', res.pressureSet);
      updateInfo();
    }
  } else if (evt.target.isEdge()) {
    await handleEdgePopup(evt.target, x, y);
  }
});

// Long‐press to open popup without immediately closing
cy.on('taphold', async evt => {
  ignoreNextClose = true;
  if (evt.target===cy) { closeActivePopup(); return; }
  const { x,y } = evt.renderedPosition;
  if (evt.target.isNode()) {
    // same handler as above
    const n = evt.target;
    const res = await showMultiInputPopup([
      { key:'name',       label:"Name:",              defaultValue:n.data('name') },
      { key:'injection',  label:"Gas in/out, m³/s:",  defaultValue:n.data('injection') },
      { key:'pressure',   label:"Pressure, MPa:",     defaultValue:n.data('pressure') },
      { key:'pressureSet',label:"Set pressure",       type:'checkbox', defaultValue:n.data('pressureSet') }
    ], x, y);
    if (res) {
      n.data('name', res.name);
      const ni = parseFloat(res.injection);
      if (!isNaN(ni)) n.data('injection', ni);
      const np = parseFloat(res.pressure);
      if (!isNaN(np)) n.data('pressure', np);
      n.data('pressureSet', res.pressureSet);
      updateInfo();
    }
  } else if (evt.target.isEdge()) {
    await handleEdgePopup(evt.target, x, y);
  }
});

// Tap‑then‑double‑tap for drawing nodes & edges
cy.on('tap', evt => {
  closeActivePopup();

  // If state is inconsistent, reset it
  if (window.creationActive && (!window.firstNode || !window.firstNode.isNode || !window.firstNode.isNode())) {
    window.creationActive = false;
    window.firstNode = null;
  }

  // cancel ongoing double tap
  if (tappedTimeout) {
    clearTimeout(tappedTimeout);
    tappedTimeout = null;

    if (evt.target !== cy) {
      evt.target.remove();
      if (window.firstNode && window.firstNode.isNode()) {
        window.firstNode.style({ 'border-color': '', 'border-width': '' });
      }
      window.creationActive = false;
      window.firstNode = null;
      updateInfo();
    }

    return;
  }

  // begin double-tap detection
  tappedTimeout = setTimeout(() => {
    if (!window.creationActive) {
      if (evt.target === cy) {
        window.firstNode = cy.add({
          group: 'nodes',
          data: { id: 'n' + nodeIdCounter, injection: 0, pressure: 0, name: '.', label: '' },
          position: evt.position
        });
        nodeIdCounter++;
        window.firstNode.style({ 'border-color': 'blue', 'border-width': '1px' });
        window.creationActive = true;
      } else if (evt.target.isNode()) {
        window.firstNode = evt.target;
        window.firstNode.style({ 'border-color': 'blue', 'border-width': '1px' });
        window.creationActive = true;
      } else {
        // Ignore tap on edge or other elements
        window.creationActive = false;
        window.firstNode = null;
      }
    } else {
      // Second tap
      if (!window.firstNode || !window.firstNode.isNode()) {
        window.creationActive = false;
        window.firstNode = null;
        return;
      }

      const source = window.firstNode.id();
      let target, L = 10, D = 565;

      if (evt.target === cy) {
        target = 'n' + nodeIdCounter;
        cy.add({
          group: 'nodes',
          data: { id: target, injection: 0, pressure: 0, name: '.', label: '' },
          position: evt.position
        });
        nodeIdCounter++;
      } else if (evt.target.isNode()) {
        target = evt.target.id();
      } else {
        // Invalid second tap — cancel
        window.firstNode.style({ 'border-color': '', 'border-width': '' });
        window.creationActive = false;
        window.firstNode = null;
        tappedTimeout = null;
        return;
      }

      if (source !== target) {
        const eData = createEdgeData(source, target, L, D);
        if (eData.length >= 0.1 && eData.diameter >= 50 && !cy.getElementById(eData.id).length) {
          cy.add({ group: 'edges', data: eData });
        }
      }

      window.firstNode.style({ 'border-color': '', 'border-width': '' });
      window.creationActive = false;
      window.firstNode = null;
      updateInfo();
    }

    tappedTimeout = null;
  }, doubleTapThreshold);
});


// Snap to grid on drag end
cy.on('dragfree','node', evt => {
  const n = evt.target, p = n.position();
  n.position({ x:Math.round(p.x/10)*10, y:Math.round(p.y/10)*10 });
});

// Save/Load from localStorage
function saveGraphToLocalStorage() {
  localStorage.setItem('graphState',
    JSON.stringify({ elements:cy.json().elements, simulatedSeconds, nodeIdCounter })
  );
}
function loadGraphFromLocalStorage() {
  const s = localStorage.getItem('graphState');
  if (!s) return;

  const state = JSON.parse(s);
  // this will remove existing elements and load the saved ones
  cy.json({ elements: state.elements });

  simulatedSeconds = state.simulatedSeconds || 0;
  nodeIdCounter = state.nodeIdCounter || 0;
  updateInfo();
}

window.addEventListener('load', () => {
  window.firstNode = null;
  window.creationActive = false;
  loadGraphFromLocalStorage();
});
window.addEventListener('beforeunload', saveGraphToLocalStorage);
