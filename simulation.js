let simulationInterval = null;
let simulationStartTime = Date.now();
let simulationMode = "sec"; // "sec", "min", "hour"
let simulatedSeconds = 0;
const MIN_FLOW_THRESHOLD = 0.01;
const PRESSURE_CHANGE_THRESHOLD = 0.01;
//cehck no changes in flows
let previousPressures = [];
let stableStepCount = 0;



function computeNodeVolume(geometry, pressure, T, Z) {
  if (geometry <= 0) return 0;
  const P_base = 0.101325;
  const T_base = 293.15;
  const T_k = T + 273.15;
  return geometry * (pressure / P_base) * (T_base / T_k) / Z;
}

function computeNodePressure(geometry, volume, T, Z) {
  if (geometry <= 0) return 0;
  const P_base = 0.101325;
  const T_base = 293.15;
  const T_k = T + 273.15;
  return volume * (P_base / geometry) * (T_k / T_base) * Z;
}


function weymouth({ E, Tb, Pb, P1, P2, G, Tf, L, D, Z, H1, H2 }) {
  // Convert temperatures from °C to K.
  const Tb_K = Tb + 273.15;
  const Tf_K = Tf + 273.15;
  
  // Calculate elevation adjustment parameter.
  const s = 0.0684 * G * ((H2 - H1) / (Tf_K * Z));
  
  // Adjusted equivalent length.
  let Le = L;
  if (Math.abs(s) > 1e-12) {
    Le = (L * (Math.exp(s) - 1)) / s;
  }
  
  // Determine pressure ordering for calculation.
  // Use the larger pressure as P_high and the smaller as P_low.
  // Also assign a sign factor indicating flow direction.
  let sign = 1, P_high = P1, P_low = P2;
  if (P2 > P1) {
    sign = -1;
    P_high = P2;
    P_low = P1;
  }
  
  // Compute flow using the Weymouth formula.
  const Q = 3.7435e-3 * (Tb_K / Pb) *
    Math.sqrt((Math.pow(P_high, 2) - Math.exp(s) * Math.pow(P_low, 2)) / (G * Tf_K * Le * Z)) *
    Math.pow(D, 2.667) * E / (24 * 60 * 60);
  
  // Return flow with appropriate sign.
  return sign * Q;
}

function getSegmentCount(lengthKm) {
  if (lengthKm <= 30) return 2;
  if (lengthKm > 300) return 30;
  const extra = Math.ceil((lengthKm - 30) / 10);
  return Math.min(2 + extra, 30);
}


/**
 * Returns the length of segment i (0-based) for a total of n segments.
 * First and last segments are half-length; others are full-length.
 */
function getSegmentLength(i, n, L) {
  // Avoid divide-by-zero
  if (n <= 1) return L;
  
  // Full length for the middle segments
  const fullLen = L / (n - 1);
  // Half length for the first and last segments
  const halfLen = fullLen / 2;
  
  // If i == 0 or i == n-1 => half-length; otherwise => full-length
  if (i === 0 || i === n - 1) {
    return halfLen;
  }
  return fullLen;
}

// --- Update node segments ---
function updateNodeSegments(cy) {
  cy.nodes().forEach(node => {
    let totalEdgeGeometry = 0;
    let connectedEdgeSegments = [];
    let existingTotalVolume = 0;

	node.connectedEdges().forEach(edge => {
	  if (edge.data('disable')) return; // skip disabled edges

      let edgeVolSegs = edge.data('volumeSegments') || [];
      const numEdgeSegs = edgeVolSegs.length;
      let D = parseFloat(edge.data('diameter')) || 0;
      let L = parseFloat(edge.data('length')) || 0;
      let Z_edge = parseFloat(edge.data('Z')) || 0;
      let T_edge = parseFloat(edge.data('T')) || 0;

      if (numEdgeSegs > 0) {
        let segIdx = edge.target().id() === node.id()
          ? numEdgeSegs - 1
          : 0;
        let segLength = getSegmentLength(segIdx, numEdgeSegs, L);
        let segGeometry = 3.1415 * Math.pow(D/1000,2) * segLength * (1000/4);
        let vol = parseFloat(edgeVolSegs[segIdx]) || 0;
        existingTotalVolume += vol;
        connectedEdgeSegments.push({
          edge, index: segIdx, geometry: segGeometry,
          Z: Z_edge, T: T_edge
        });
        totalEdgeGeometry += segGeometry;
      }
    });

    let injection = parseFloat(node.data('injection')) || 0;
    let totalVolume, newPressure;

    if (node.data('pressureSet')) {
      newPressure = parseFloat(node.data('pressure')) || 0;
      let computedVolume = 0;
      connectedEdgeSegments.forEach(seg => {
        computedVolume += computeNodeVolume(
          seg.geometry,
          newPressure,
          seg.T,
          seg.Z
        );
      });
      totalVolume = computedVolume + injection;
    } else {
      totalVolume = existingTotalVolume + injection;
      // use the T and Z of the first connected segment as-is
      let { T, Z } = connectedEdgeSegments[0] || { T: 0, Z: 1 };
      newPressure = computeNodePressure(
        totalEdgeGeometry,
        totalVolume,
        T,
        Z
      );
      node.data('pressure', newPressure);
    }

    totalVolume = Math.max(totalVolume, 0);

    connectedEdgeSegments.forEach(seg => {
      let newVol = computeNodeVolume(
        seg.geometry,
        newPressure,
        seg.T,
        seg.Z
      );
      newVol = Math.max(newVol, 0);
      let vs = seg.edge.data('volumeSegments') || [];
      vs[seg.index] = newVol;
      seg.edge.data('volumeSegments', vs);
    });

    let nodeSegs = node.data('volumeSegments') || [];
    const n = nodeSegs.length;
    if (n > 0) {
      node.data('volumeSegments', Array(n).fill(totalVolume / n));
    }
  });
}


// --- Update edge segments ---
function updateEdgeSegments(cy) {
  cy.edges().forEach(edge => {
    const edgeLength = parseFloat(edge.data('length')) || 0;
    const numSegs = getSegmentCount(edgeLength);
    let edgeVolSegs = edge.data('volumeSegments') || Array(numSegs).fill(0);
    let edgePressSegs = edge.data('pressureSegments') || Array(numSegs).fill(0);
    let prevFlows = edge.data('flowSegments') || Array(numSegs - 1).fill(0);

    const D = parseFloat(edge.data('diameter')) || 0;
    const E = parseFloat(edge.data('E')) || 0;
    const Z = parseFloat(edge.data('Z')) || 0;
    const T = parseFloat(edge.data('T')) || 0;

    let segPressures = [];
    for (let i = 0; i < numSegs; i++) {
      let volVal = parseFloat(edgeVolSegs[i]) || 0;
      let segLen = getSegmentLength(i, numSegs, edgeLength);
      let segGeometry = 3.1415 * Math.pow(D / 1000, 2) * segLen * (1000 / 4);
      let p = computeNodePressure(segGeometry, volVal, T, Z);
      segPressures.push(p);
    }
    edge.data('pressureSegments', segPressures);

    let newFlowSegments = [];
    let flowLen = numSegs > 1 ? edgeLength / (numSegs - 1) : edgeLength;

    for (let i = 0; i < numSegs - 1; i++) {
      const p1 = segPressures[i], p2 = segPressures[i + 1];

      let flow = weymouth({
        E, Tb: 20, Pb: 0.101325,
        P1: p1, P2: p2, G: 0.60,
        Tf: T, L: flowLen, D, Z, H1: 0, H2: 0
      });

      const prevFlow = prevFlows[i] || 0;
      const avgFlow = flow*0.2 + prevFlow*0.8;

      // Use avgFlow to move volumes
      let vi = edgeVolSegs[i] || 0;
      let vj = edgeVolSegs[i + 1] || 0;

      let actualFlow;

		if (avgFlow >= 0) {actualFlow = Math.min(avgFlow, vi);} 
		else {actualFlow = -Math.min(-avgFlow, vj);}
		if (Math.abs(actualFlow) < MIN_FLOW_THRESHOLD) actualFlow = 0;
		edgeVolSegs[i]     -= actualFlow;
		edgeVolSegs[i + 1] += actualFlow;


      newFlowSegments.push(actualFlow); // Store the used averaged flow
    }

    edge.data('flowSegments', newFlowSegments);
    edge.data('volumeSegments', edgeVolSegs);
  });
}




function updateEdgeVelocities(cy) {
  cy.edges().forEach(edge => {
    const flowSegments = edge.data('flowSegments') || [];
    const pressureSegments = edge.data('pressureSegments') || [];
    const D_mm = parseFloat(edge.data('diameter')) || 0;
    const D_m = D_mm / 1000;
    const area = Math.PI * Math.pow(D_m, 2) / 4;

    const Z = parseFloat(edge.data('Z')) || 1; // Compressibility
    const T = parseFloat(edge.data('T')) || 15; // Temperature [°C]
    const T_K = T + 273.15;

    const P_base = 101.325; // [kPa]
    const T_base = 293.15;  // [K]
    const R = 8.314;        // [J/(mol·K)]
    const M = 0.01604;      // [kg/mol]

    let v1 = 0, v2 = 0;

    if (flowSegments.length > 0 && area > 0 && pressureSegments.length > 1) {
      const Q1_std = flowSegments[0]; // standard m³/s
      const Q2_std = flowSegments[flowSegments.length - 1];

      let P1 = pressureSegments[0]; 
      let P2 = pressureSegments[pressureSegments.length - 1];

      // 🔥 Fix units: MPa → kPa
      const P1_kPa = P1 * 1000;
      const P2_kPa = P2 * 1000;

      // Standard density [kg/m³]
      const rho_std = (P_base * M) / (R * T_base);

      // Mass flows [kg/s]
      const mass_flow_1 = Q1_std * rho_std;
      const mass_flow_2 = Q2_std * rho_std;

      // Actual density at inlet and outlet
      const rho1_actual = (P1_kPa * M) / (Z * R * T_K);
      const rho2_actual = (P2_kPa * M) / (Z * R * T_K);

      // Actual volumetric flows (m³/s)
      const Q1_actual = mass_flow_1 / rho1_actual;
      const Q2_actual = mass_flow_2 / rho2_actual;

      // Velocities (m/s)
      v1 = Q1_actual / area;
      v2 = Q2_actual / area;
    }

    // Save velocities
    edge.data('v1', v1);
    edge.data('v2', v2);
  });
}






function checkSystemStability(cy) {
  const curr = [];
  cy.nodes().forEach(n => curr.push(n.data('pressure') || 0));
  cy.edges().forEach(e => (e.data('pressureSegments') || []).forEach(p => curr.push(p || 0)));

  if (curr.length === previousPressures.length &&
      curr.every((p, i) => Math.abs(p - previousPressures[i]) < PRESSURE_CHANGE_THRESHOLD )) {
    stableStepCount++;
    if (stableStepCount >= 3600) {
      alert("Simulation finished: Pressures are stable for 1 hour.");
      previousPressures = [];
      stableStepCount = 0;
      simulationMode = "stop"; // ✅ reflect stopped mode
      stopSimulation();
    }
  } else {
    stableStepCount = 0;
    previousPressures = curr;
  }
}




// --- Main simulation update function ---
// At every simulation step we:
// • Apply injections to nodes,
// • Update node segments (rebalancing pressures and volumes at junctions),
// • Update edge segments (computing flows between adjacent segments).
function updateSimulation(cy, updateInfoCallback) {
if (window.evaluateScripts) evaluateScripts(simulatedSeconds);
  updateNodeSegments(cy);
  updateEdgeSegments(cy);
  updateEdgeVelocities(cy);
  simulatedSeconds += 1;
  if (updateInfoCallback) updateInfoCallback();
  checkSystemStability(cy);
}

// --- Simulation control functions ---
function runSimulation(cy, updateInfoCallback) {
	if (window.firstNode) {
	  try { window.firstNode.style({ 'border-color': '', 'border-width': '' }); } catch(e) {}
	  window.creationActive = false;
	  window.firstNode = null;
	}

  if (simulationInterval) return;
  simulationInterval = setInterval(() => {
    let iterations = 1;
    if (simulationMode === "min") {
      iterations = 60;
    } else if (simulationMode === "hour") {
      iterations = 3600;
    }
    for (let i = 0; i < iterations; i++) {
      updateSimulation(cy, updateInfoCallback);
    }
  }, 1000);
}

function stopSimulation() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
  simulationMode = "stop"; 
}


function setSimulationMode(mode, cy, updateInfoCallback) {
  // Mode should be "sec", "min", "hour", or "stop".
  if (mode === "stop") {
    stopSimulation();
  } else {
    simulationMode = mode;
    if (!simulationInterval) {
      runSimulation(cy, updateInfoCallback);
    }
  }
}
function resetSimulation() {
  stopSimulation();  // Stop timer

  simulatedSeconds = 0;
  // updateTimeDisplay?.(0);  // Removed – no such function

  // Reset node data
  cy.nodes().forEach(node => {
    node.data('pressure', 0);
    node.data('pressureSet', null);
    node.data('injection', 0);
    node.data('fixed', false);
    node.data('volumeSegments', Array((node.data('volumeSegments') || []).length).fill(0));
  });

  // Reset edge data
  cy.edges().forEach(edge => {
    edge.data('flow', 0);
    edge.data('disabled', false);
    edge.data('reverse', false);
    const n = edge.data('volumeSegments')?.length || 2;
    edge.data('volumeSegments', Array(n).fill(0));
    edge.data('flowSegments', Array(n - 1).fill(0));
    edge.data('pressureSegments', Array(n).fill(0));
  });

  if (window.resetScriptEngine) window.resetScriptEngine();

updateInfo?.(); // or updateSidebar(), or similar

}




// --- Event listeners to control the simulation ---
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

document.getElementById('resetButton').addEventListener('click', resetSimulation);

