
let simulationInterval = null;
let simulationStartTime = Date.now();
let simulationMode = "sec"; // can be "sec", "min", or "hour"
let simulatedSeconds = 0;

function computeFlow(D, p1, p2, L) {
  const ro = 0.61;
  const Zcp = 0.9;
  const Tcp = 293.2;
  const lambdaConst = 0.010317381;
  const pressureDiff = Math.abs(p1 * p1 - p2 * p2);
  const numerator = 3.32 * Math.pow(D, 2.5) * Math.sqrt(pressureDiff);
  const denominator = Math.sqrt(lambdaConst * ro * Zcp * Tcp * L) * (24 * 60 * 60);
  return numerator / denominator;
}

function computeNodePressure(geometry, volume) {
  if (geometry <= 0) return 0;
  const Zcp = 0.9;
  const Pc = 0.101325; //MPa Standart conditions 
  return volume * Zcp * Pc / (geometry);
}

function computeNodeVolume(geometry, pressure) {
  if (geometry <= 0) return 0;
  const Zcp = 0.9;
  const Pc = 0.101325; // MPa Standard conditions 
  return (pressure * geometry) / (Zcp * Pc);
}


function updateAllNodePressures(cy) {
  cy.nodes().forEach(node => {
    // Only update injection if pressure is NOT set.
    if (!node.data('pressureSet')) {
    const geometry = parseFloat(node.data('geometry')) || 0;
    const volume = parseFloat(node.data('volume')) || 0;
    const pressure = computeNodePressure(geometry, volume);
    node.data('pressure', pressure);
	}
  });
}

function updateAllNodeVolumes(cy) {
  cy.nodes().forEach(node => {
    // Only update volume if pressure flag is set.
    if (node.data('pressureSet')) {
      const geometry = parseFloat(node.data('geometry')) || 0;
      const pressure = parseFloat(node.data('pressure')) || 0;
      const volume = computeNodeVolume(geometry, pressure);
      node.data('volume', volume);
    }
  });
}



function applyInjections(cy) {
  cy.nodes().forEach(node => {
    // Only update injection if pressure is NOT set.
    if (!node.data('pressureSet')) {
      const injection = parseFloat(node.data('injection')) || 0;
      let volume = parseFloat(node.data('volume')) || 0;
      volume += injection;
      if (volume < 0) volume = 0;
      node.data('volume', volume);
    } else {
		  node.data('injection', 0);
			}
  });
}



function computeFlows(cy) {
  cy.edges().forEach(edge => {
    const sourceNode = edge.source();
    const targetNode = edge.target();
    const p1 = parseFloat(sourceNode.data('pressure')) || 0;
    const p2 = parseFloat(targetNode.data('pressure')) || 0;
    const D = parseFloat(edge.data('diameter'));
    const L = parseFloat(edge.data('length'));
    const flow = computeFlow(D, p1, p2, L);
    edge.data('flow', flow);

    if (p1 > p2) {
      // Flow from source (higher pressure) to target (lower pressure)
      const available = parseFloat(sourceNode.data('volume'));
      let actualFlow;
      if (!sourceNode.data('pressureSet')) {
        // Pressure flag not set: move volume from source to target.
        actualFlow = Math.min(flow, available);
        sourceNode.data('volume', available - actualFlow);
      } else {
        // Pressure flag set: do not remove volume from source, just add new volume.
        actualFlow = flow;
      }
      targetNode.data('volume', (parseFloat(targetNode.data('volume')) || 0) + actualFlow);
    } else if (p2 > p1) {
      // Flow from target (higher pressure) to source (lower pressure)
      const available = parseFloat(targetNode.data('volume'));
      let actualFlow;
      if (!targetNode.data('pressureSet')) {
        // Pressure flag not set: move volume from target to source.
        actualFlow = Math.min(flow, available);
        targetNode.data('volume', available - actualFlow);
      } else {
        // Pressure flag set: do not remove volume from target, just add new volume.
        actualFlow = flow;
      }
      sourceNode.data('volume', (parseFloat(sourceNode.data('volume')) || 0) + actualFlow);
    }
  });
}




function updateSimulation(cy, updateInfoCallback) {
  applyInjections(cy);
  updateAllNodePressures(cy);  
  computeFlows(cy);
  updateAllNodeVolumes(cy);  
  // Each call represents 1 simulated second.
  simulatedSeconds += 1;
  
  if (updateInfoCallback) updateInfoCallback();
}

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
  // mode should be "sec", "min", "hour", or "stop"
  if (mode === "stop") {
    stopSimulation();
  } else {
    simulationMode = mode;
    if (!simulationInterval) {
      runSimulation(cy, updateInfoCallback);
    }
  }
}
