let simulationInterval = null;
let simulationStartTime = Date.now();
let simulationMode = "sec"; // "sec", "min", "hour"
let simulatedSeconds = 0;


function computeNodePressure(geometry, volume) {
  if (geometry <= 0) return 0;
  const Zcp = 0.9;
  const Pc = 0.101325; // MPa Standard conditions 
  return volume * Zcp * Pc / geometry;
}

function computeNodeVolume(geometry, pressure) {
  if (geometry <= 0) return 0;
  const Zcp = 0.9;
  const Pc = 0.101325; // MPa Standard conditions 
  return (pressure * geometry) / (Zcp * Pc);
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
    let totalEdgeGeometry = 0;       // Sum of the geometries of the connected segments.
    let connectedEdgeSegments = [];  // Array to store each connected segment’s info.
    let existingTotalVolume = 0;     // Sum of currently stored volumes from connected segments.

    // Process every edge connected to this node.
    node.connectedEdges().forEach(edge => {
      let edgeVolSegs = edge.data('volumeSegments') || [];
      const numEdgeSegs = edgeVolSegs.length;
      let D = parseFloat(edge.data('diameter')) || 0;
      let L = parseFloat(edge.data('length')) || 0;
      
      if (numEdgeSegs > 0) {
        // Determine which segment index corresponds to this node.
        // For a source node, use index 0; for a target node, use the last segment.
        let segIdx = 0;
        if (edge.target().id() === node.id()) {
          segIdx = numEdgeSegs - 1;
        }
        
        // Compute the actual length of that specific segment.
        let segLength = getSegmentLength(segIdx, numEdgeSegs, L);
        // Compute the geometry for this segment.
        let segGeometry = 3.1415 * Math.pow(D / 1000, 2) * segLength * (1000 / 4);
        
        // Sum the existing volume from this connected segment.
        let vol = parseFloat(edgeVolSegs[segIdx]) || 0;
        existingTotalVolume += vol;
        
        // Save this segment’s information for later volume redistribution.
        connectedEdgeSegments.push({ 
          edge: edge, 
          index: segIdx, 
          geometry: segGeometry 
        });
        
        // Accumulate total geometry for the node.
        totalEdgeGeometry += segGeometry;
      }
    });
    
    // Get the node’s injection (if any)
    let injection = parseFloat(node.data('injection')) || 0;
    let totalVolume;  // Effective volume at the node.
    let newPressure;  // Final pressure to use for updating volumes.
    
    if (node.data('pressureSet')) {
      // If the user sets the pressure, use that pressure...
      newPressure = parseFloat(node.data('pressure')) || 0;
      // ...and recompute the volumes on the connected segments using the user–set pressure.
      let computedVolume = 0;
      connectedEdgeSegments.forEach(seg => {
        computedVolume += computeNodeVolume(seg.geometry, newPressure);
      });
      // Effective node volume is computed from connected segments plus injection.
      totalVolume = computedVolume + injection;
    } else {
      // Otherwise, use the currently stored volumes plus injection.
      totalVolume = existingTotalVolume + injection;
      // Compute the node pressure from the total geometry and effective volume.
      newPressure = computeNodePressure(totalEdgeGeometry, totalVolume);
      // Save the computed pressure to the node.
      node.data('pressure', newPressure);
    }
    
    // Clamp totalVolume to a minimum of 0 to avoid negative volume issues.
    totalVolume = Math.max(totalVolume, 0);
    
    // Redistribute volumes on each connected edge segment using the (user–set or computed) pressure.
    connectedEdgeSegments.forEach(seg => {
      let newVol = computeNodeVolume(seg.geometry, newPressure);
      // Ensure volume does not go below 0.
      newVol = Math.max(newVol, 0);
      let edge = seg.edge;
      let edgeVolSegs = edge.data('volumeSegments') || [];
      edgeVolSegs[seg.index] = newVol;
      edge.data('volumeSegments', edgeVolSegs);
    });
    
    // Optionally update the node’s own display volumeSegments (evenly distributing totalVolume among them)
    let nodeSegs = node.data('volumeSegments') || [];
    const numNodeSegs = nodeSegs.length;
    if (numNodeSegs > 0) {
      let newNodeVolumePerSeg = totalVolume / numNodeSegs;
      let newNodeSegs = new Array(numNodeSegs).fill(newNodeVolumePerSeg);
      node.data('volumeSegments', newNodeSegs);
    }
  });
}





// --- Update edge segments ---
function updateEdgeSegments(cy) {
  cy.edges().forEach(edge => {
    // Retrieve or initialize the edge's volume and pressure segments.
    let edgeVolSegs = edge.data('volumeSegments') || Array(SEGMENT_COUNT).fill(0);
    let edgePressSegs = edge.data('pressureSegments') || Array(SEGMENT_COUNT).fill(0);
    const numSegs = SEGMENT_COUNT;

    let edgeLength = parseFloat(edge.data('length')) || 0;
    let D = parseFloat(edge.data('diameter')) || 0;

    // 1) Compute pressure for each segment using the proper segment length.
    let segPressures = [];
    for (let i = 0; i < numSegs; i++) {
      let volVal = parseFloat(edgeVolSegs[i]) || 0;
      // Actual segment length: half for first/last segments, full-length for middle segments.
      let segLen = getSegmentLength(i, numSegs, edgeLength);
      // Geometry = π * (D/1000)^2 * segLen * (1000/4)
      let segGeometry = 3.1415 * Math.pow(D / 1000, 2) * segLen * (1000 / 4);
      let p = computeNodePressure(segGeometry, volVal);
      segPressures.push(p);
    }
    // Update the edge's pressure segments.
    edge.data('pressureSegments', segPressures);

    // 2) Compute flows between adjacent segments.
    // Each gap is treated as a full segment length of L/(numSegs - 1).
    let flowSegments = [];
    let flowLen = (numSegs > 1) ? (edgeLength / (numSegs - 1)) : edgeLength;

    for (let i = 0; i < numSegs - 1; i++) {
      let p1 = segPressures[i];
      let p2 = segPressures[i + 1];

      // Calculate flow via the weymouth function which returns negative values for backflow.
      let flow = weymouth({
        E: 0.95,
        Tb: 20,
        Pb: 0.101325,
        P1: p1,
        P2: p2,
        G: 0.61,
        Tf: 15,
        L: flowLen,
        D: D,
        Z: 0.91,
        H1: 0,
        H2: 0
      });
      flowSegments.push(flow);

      // 3) Transfer volume:
      // Subtract flow from segment i and add it to segment i+1.
      // Clamp both results to a minimum of 0.
      let vol_i = (parseFloat(edgeVolSegs[i]) || 0) - flow;
      let vol_next = (parseFloat(edgeVolSegs[i + 1]) || 0) + flow;
      edgeVolSegs[i] = Math.max(vol_i, 0);
      edgeVolSegs[i + 1] = Math.max(vol_next, 0);
    }

    // Save updated flows and volumes back to the edge.
    edge.data('flowSegments', flowSegments);
    edge.data('volumeSegments', edgeVolSegs);
  });
}






// --- Main simulation update function ---
// At every simulation step we:
// • Apply injections to nodes,
// • Update node segments (rebalancing pressures and volumes at junctions),
// • Update edge segments (computing flows between adjacent segments).
function updateSimulation(cy, updateInfoCallback) {
  updateNodeSegments(cy);
  updateEdgeSegments(cy);
  simulatedSeconds += 1;
  if (updateInfoCallback) updateInfoCallback();
}

// --- Simulation control functions ---
function runSimulation(cy, updateInfoCallback) {
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
