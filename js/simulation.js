// simulation.js
let simulationInterval = null;
let simulationStartTime = Date.now();
let simulationMode = "sec"; // "sec", "min", "hour"
let simulatedSeconds = 0;
const MIN_FLOW_THRESHOLD = 0.01;
const PRESSURE_CHANGE_THRESHOLD = 0.02;
//cehck no changes in flows
let previousPressures = [];
let stableStepCount = 0;
let highPressureStepCount = 0;

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

// Calculate Z-factor for segments based on pressure and temperature 0.96 methane composition
function calculateSegmentZ(pressureSegments, T_C) {
  // --- 1. Temperature quantities (done once) ----------------------------
  const T_K = T_C + 273.15;              // convert °C → K
  const Tr  = T_K / 198.0498;            // critical temperature

  // --- 2. Temperature-dependent coefficients ----------------------------
  const A1 = -1.0000 + 3.8740 / Tr - 4.5767 / (Tr * Tr) + 1.1813 / (Tr * Tr * Tr);
  const A2 = 0.1708 - 0.5606 / Tr + 0.4857 / (Tr * Tr);

  // --- 3. Map over each pressure and get Z ------------------------------
  return pressureSegments.map(P_MPa => {
    const Pr = P_MPa / 4.4999;           // critical pressure
    return 1 + A1 * Pr + A2 * Pr * Pr;   // Z = 1 + A1·Pr + A2·Pr²
  });
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
      let edgeZSegs = edge.data('zSegments') || [];
      const numEdgeSegs = edgeVolSegs.length;
      let D = parseFloat(edge.data('diameter')) || 0;
      let L = parseFloat(edge.data('length')) || 0;
      let T_edge = parseFloat(edge.data('T')) || 0;

      if (numEdgeSegs > 0) {
        let segIdx = edge.target().id() === node.id()
          ? numEdgeSegs - 1
          : 0;
        let segLength = getSegmentLength(segIdx, numEdgeSegs, L);
        let segGeometry = 3.1415 * Math.pow(D/1000,2) * segLength * (1000/4);
        let vol = parseFloat(edgeVolSegs[segIdx]) || 0;
        let Z_seg = edgeZSegs[segIdx] || 0.85; // Use segment-specific Z or default
        existingTotalVolume += vol;
        connectedEdgeSegments.push({
          edge, index: segIdx, geometry: segGeometry,
          Z: Z_seg, T: T_edge
        });
        totalEdgeGeometry += segGeometry;
      }
    });

    // injection is already stored in m³/s internally
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
      
      // FIXED: Use correct physics formula with all connected segments' T and Z
      const P_base = 0.101325, T_base = 293.15;
      let denom = 0;
      connectedEdgeSegments.forEach(seg => {
        const Tk = seg.T + 273.15;
        denom += seg.geometry / (Tk * seg.Z);
      });
      newPressure = denom ? (totalVolume * P_base) / (T_base * denom) : 0;
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
    const T = parseFloat(edge.data('T')) || 0;

    let segPressures = [];
    // First calculate pressures using a default Z for initial calculation
    const defaultZ = 0.85;
    for (let i = 0; i < numSegs; i++) {
      let volVal = parseFloat(edgeVolSegs[i]) || 0;
      let segLen = getSegmentLength(i, numSegs, edgeLength);
      let segGeometry = 3.1415 * Math.pow(D / 1000, 2) * segLen * (1000 / 4);
      let p = computeNodePressure(segGeometry, volVal, T, defaultZ);
      segPressures.push(p);
    }

    // Calculate Z-factor array for segments based on initial pressures
    let segZ = calculateSegmentZ(segPressures, T);
    
    // Recalculate pressures with correct Z-factors
    for (let i = 0; i < numSegs; i++) {
      let volVal = parseFloat(edgeVolSegs[i]) || 0;
      let segLen = getSegmentLength(i, numSegs, edgeLength);
      let segGeometry = 3.1415 * Math.pow(D / 1000, 2) * segLen * (1000 / 4);
      let p = computeNodePressure(segGeometry, volVal, T, segZ[i]);
      segPressures[i] = p;
    }
    
    edge.data('pressureSegments', segPressures);
    edge.data('zSegments', segZ);

    let newFlowSegments = [];
    let flowLen = numSegs > 1 ? edgeLength / (numSegs - 1) : edgeLength;

    for (let i = 0; i < numSegs - 1; i++) {
      const p1 = segPressures[i], p2 = segPressures[i + 1];
      // Use average Z-factor for the flow segment
      const avgZ = (segZ[i] + segZ[i + 1]) / 2;

      // Determine pressure ordering for bidirectional flow and convert units
      let sign = 1, P_high = p1, P_low = p2;
      if (p2 > p1) {
        sign = -1;
        P_high = p2;
        P_low = p1;
      }

      // Choose Panhandle formula based on diameter: B for D>=1000mm, A otherwise
      const panhandleFunction = D >= 1000 ? window.panhandleB : window.panhandleA;
      
      // Panhandle returns flow in m³/s
      let flow = sign * panhandleFunction({
        E, 
        Tb: 20, 
        Pb: 0.101325 * 1000, // Convert from MPa to kPa
        P1: P_high * 1000,   // Convert from MPa to kPa  
        P2: P_low * 1000,    // Convert from MPa to kPa
        G: 0.60,
        Tf: T, 
        L: flowLen, 
        D, 
        Z: avgZ, 
        H1: 0, 
        H2: 0
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


      newFlowSegments.push(actualFlow); // Store the used averaged flow in m³/s
    }

    edge.data('flowSegments', newFlowSegments);
    edge.data('volumeSegments', edgeVolSegs);
  });
}




function updateEdgeVelocities(cy) {
  cy.edges().forEach(edge => {
    const flowSegments = edge.data('flowSegments') || [];
    const pressureSegments = edge.data('pressureSegments') || [];
    const zSegments = edge.data('zSegments') || [];
    const D_mm = parseFloat(edge.data('diameter')) || 0;
    const D_m = D_mm / 1000;
    const area = Math.PI * Math.pow(D_m, 2) / 4;

    const T = parseFloat(edge.data('T')) || 15; // Temperature [°C]
    const T_K = T + 273.15;

    const P_base = 101.325; // [kPa]
    const T_base = 293.15;  // [K]
    const R = 8.314;        // [J/(mol·K)]
    const M = 0.01604;      // [kg/mol]

    let v1 = 0, v2 = 0;

    if (flowSegments.length > 0 && area > 0 && pressureSegments.length > 1 && zSegments.length > 0) {
      // Q1_std and Q2_std are in m³/s
      const Q1_std = flowSegments[0]; 
      const Q2_std = flowSegments[flowSegments.length - 1];

      let P1 = pressureSegments[0]; 
      let P2 = pressureSegments[pressureSegments.length - 1];
      let Z1 = zSegments[0] || 0.85;
      let Z2 = zSegments[zSegments.length - 1] || 0.85;

      // 🔥 Fix units: MPa → kPa
      const P1_kPa = P1 * 1000;
      const P2_kPa = P2 * 1000;

      // Standard density [kg/m³]
      const rho_std = (P_base * M) / (R * T_base);

      // Mass flows [kg/s]
      const mass_flow_1 = Q1_std * rho_std;
      const mass_flow_2 = Q2_std * rho_std;

      // Actual density at inlet and outlet using segment-specific Z
      const rho1_actual = (P1_kPa * M) / (Z1 * R * T_K);
      const rho2_actual = (P2_kPa * M) / (Z2 * R * T_K);

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
  // Only check every 10 hours (36000 seconds)
  if (simulatedSeconds % 36000 !== 0) return;

  // Get current pressures from all edge segments
  const curr = [];
  cy.edges().forEach(edge => {
    const pressureSegments = edge.data('pressureSegments') || [];
    curr.push(...pressureSegments);
  });

  // Check for over-pressure in any segment
  const MAX_PRESSURE_MPA = 100;
  if (curr.some(p => p >= MAX_PRESSURE_MPA)) {
    stopSimulation();
    setSimState('pause');
    simulationMode = "stop";
    alert("Simulation stopped: Pressure above 1000 bar detected in pipeline segment.");
    return;
  }

  // Compare with previous segment pressures if we have them
  if (previousPressures.length > 0) {
    const isStable = curr.length === previousPressures.length && 
                    curr.every((p, i) => Math.abs(p - previousPressures[i]) < PRESSURE_CHANGE_THRESHOLD);

    if (isStable) {
      stopSimulation(); 
      setSimState('pause');
      simulationMode = "stop";
      alert("Simulation finished: All pressures are stable for 10 hours.");
      console.log("Simulation finished: All pressures are stable for 10 hours.");
    }
  }

  // Save current segment pressures for next check
  previousPressures = curr;
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
  
  // Log data every minute using the CSV logger
  if (window.logSimulationData) {
    window.logSimulationData(cy, simulatedSeconds);
  }
  
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
  
  // Initialize CSV headers when starting simulation
  if (window.initializeCSVHeaders && window.hasCSVData && !window.hasCSVData()) {
    window.initializeCSVHeaders(cy);
  }
  
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
  // Clear any ongoing node creation state
  if (window.firstNode) {
    try { window.firstNode.style({ 'border-color': '', 'border-width': '' }); } catch(e) {}
    window.creationActive = false;
    window.firstNode = null;
  }

  if (mode === "stop") {
    stopSimulation();
  } else {
    // make sure there is no old interval hanging around
    stopSimulation();
    simulationMode = mode;
    // now start a fresh one
    runSimulation(cy, updateInfoCallback);
  }
}


function resetSimulation() {
  stopSimulation();  // Stop timer

  // Clear any ongoing node creation state
  if (window.firstNode) {
    try { window.firstNode.style({ 'border-color': '', 'border-width': '' }); } catch(e) {}
    window.creationActive = false;
    window.firstNode = null;
  }

  simulatedSeconds = 0;
  // updateTimeDisplay?.(0);  // Removed – no such function

  // Reset CSV data
  if (window.resetCSVData) {
    window.resetCSVData();
  }

  // Reset node volume segments but preserve pressure, injection, and pressureSet data
  cy.nodes().forEach(node => {
    // Keep existing: pressure, pressureSet, injection
    // Only reset volume segments and fixed state
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
    edge.data('flowSegments', Array(n - 1).fill(0)); // These are stored in m³/s internally
    edge.data('pressureSegments', Array(n).fill(0));
    edge.data('zSegments', Array(n).fill(0.85));
  });

  if (window.resetScriptEngine) window.resetScriptEngine();

updateInfo?.(); // or updateSidebar(), or similar

}
