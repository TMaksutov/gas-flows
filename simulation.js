/*
 * Module: Gas Flow Simulation Framework
 *
 * This module defines the graph structure used to simulate gas flows in a pipeline network.
 * The network is represented using nodes (pipeline junctions, injection/extraction points) and edges (pipeline segments).
 *
 * Data Structures:
 *
 * 1. Nodes:
 *    - Represents a point in the gas network (e.g., junction, compressor station, injection or withdrawal point).
 *    - Attributes:
 *       • id: Unique identifier for the node (e.g., "n0", "n1", etc.).
 *       • injection: Gas injection/output value in m³/sec (positive for injection, negative for withdrawal).
 *       • volume: Current gas volume stored at the node (in m³).
 *       • geometry: A derived metric calculated from all connected edges using the formula:
 *                   geometry = Σ [ π * (D/1000)^2 * (L*1000) / 2 ]
 *                   where D is the diameter (in mm) and L is the length (in km) of each connected edge.
 *       • pressure: Calculated using the formula: pressure = volume * Zcp / geometry.
 *       • Position (x, y): Used for visualization and layout purposes.
 *
 * 2. Edges:
 *    - Represents a pipeline segment connecting two nodes.
 *    - Attributes:
 *       • id: Unique identifier, typically a combination of source and target node ids (e.g., "e0_1").
 *       • source: The id of the source node.
 *       • target: The id of the target node.
 *       • flow: The gas flow through the edge (in m³/s), calculated based on node pressures.
 *       • length: The length of the pipeline segment in km (new edges are fixed at 1 km).
 *       • diameter: The diameter of the pipeline in mm (new edges are fixed at 565 mm).
 *       • label: Display label for the edge, formatted in one line (e.g., "L: 1.000 km | D: 565.00 mm").
 *
 * Usage:
 * - This graph structure is used to calculate and simulate gas flows, pressures, and other related metrics.
 * - Node and edge properties are dynamically updated based on simulation steps.
 *
 * Note:
 * - Customize the formulas and parameters as needed for your specific gas flow calculations.
 */

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

function applyInjections(cy) {
  cy.nodes().forEach(node => {
    const injection = parseFloat(node.data('injection')) || 0;
    let volume = parseFloat(node.data('volume')) || 0;
    volume += injection;
    if (volume < 0) volume = 0;
    node.data('volume', volume);
  });
}

function updateAllNodePressures(cy) {
  cy.nodes().forEach(node => {
    const geometry = parseFloat(node.data('geometry')) || 0;
    const volume = parseFloat(node.data('volume')) || 0;
    const pressure = computeNodePressure(geometry, volume);
    node.data('pressure', pressure);
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
      const available = parseFloat(sourceNode.data('volume'));
      const actualFlow = Math.min(flow, available);
      sourceNode.data('volume', available - actualFlow);
      targetNode.data('volume', (parseFloat(targetNode.data('volume')) || 0) + actualFlow);
    } else if (p2 > p1) {
      const available = parseFloat(targetNode.data('volume'));
      const actualFlow = Math.min(flow, available);
      targetNode.data('volume', available - actualFlow);
      sourceNode.data('volume', (parseFloat(sourceNode.data('volume')) || 0) + actualFlow);
    }
  });
}

function updateSimulation(cy, updateInfoCallback) {
  applyInjections(cy);
  updateAllNodePressures(cy);
  computeFlows(cy);
  
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
