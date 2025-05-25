// csv_logger.js
// CSV Data logging functionality for Gas Flows Simulator
// Logs simulation data every minute and provides download capability

// CSV Data logging variables
let csvData = [];
let csvHeaders = [];
let lastLoggedMinute = -1;

// --- CSV Data Logging Functions ---
function initializeCSVHeaders(cy) {
  csvHeaders = ['Time'];
  
  // Add node pressure columns
  cy.nodes().forEach(node => {
    csvHeaders.push(`Node_${node.id()}_Pressure_MPa`);
  });
  
  // Add edge segment data columns
  cy.edges().forEach(edge => {
    const edgeId = edge.id();
    const name = edge.data('name') || '.';
    const L = edge.data('length');
    const D = edge.data('diameter');
    
    csvHeaders.push(`Edge_${edgeId}_Name`);
    csvHeaders.push(`Edge_${edgeId}_L_km`);
    csvHeaders.push(`Edge_${edgeId}_D_mm`);
    csvHeaders.push(`Edge_${edgeId}_v1_ms`);
    csvHeaders.push(`Edge_${edgeId}_v2_ms`);
    csvHeaders.push(`Edge_${edgeId}_TotalVolume_m3`);
    
    // Add segment volumes
    const volumeSegments = edge.data('volumeSegments') || [];
    for (let i = 0; i < volumeSegments.length; i++) {
      csvHeaders.push(`Edge_${edgeId}_SegVol${i}_m3`);
    }
    
    // Add segment flows
    const flowSegments = edge.data('flowSegments') || [];
    for (let i = 0; i < flowSegments.length; i++) {
      csvHeaders.push(`Edge_${edgeId}_SegFlow${i}_m3h`);
    }
    
    // Add segment pressures
    const pressureSegments = edge.data('pressureSegments') || [];
    for (let i = 0; i < pressureSegments.length; i++) {
      csvHeaders.push(`Edge_${edgeId}_SegPress${i}_MPa`);
    }
  });
}

function formatTimeForExcel(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  // Format as HH:MM:SS for Excel compatibility
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function logSimulationData(cy, simulatedSeconds) {
  const currentMinute = Math.floor(simulatedSeconds / 60);
  
  // Only log once per minute
  if (currentMinute === lastLoggedMinute) return;
  lastLoggedMinute = currentMinute;
  
  const row = [];
  
  // Time column in Excel format
  row.push(formatTimeForExcel(simulatedSeconds));
  
  // Node pressures
  cy.nodes().forEach(node => {
    const pressure = parseFloat(node.data('pressure')) || 0;
    row.push(pressure.toFixed(3));
  });
  
  // Edge segment data
  cy.edges().forEach(edge => {
    const name = edge.data('name') || '.';
    const L = edge.data('length');
    const D = edge.data('diameter');
    const v1 = parseFloat(edge.data('v1')) || 0;
    const v2 = parseFloat(edge.data('v2')) || 0;
    
    // Calculate total volume
    const volumeSegments = edge.data('volumeSegments') || [];
    const totalVolume = volumeSegments.reduce((sum, vol) => sum + (parseFloat(vol) || 0), 0);
    
    row.push(name, L, D, v1.toFixed(3), v2.toFixed(3), totalVolume.toFixed(1));
    
    // Segment volumes
    volumeSegments.forEach(vol => {
      row.push((parseFloat(vol) || 0).toFixed(1));
    });
    
    // Segment flows (convert from m³/s to m³/h)
    const flowSegments = edge.data('flowSegments') || [];
    flowSegments.forEach(flow => {
      row.push(((parseFloat(flow) || 0) * 3600).toFixed(2));
    });
    
    // Segment pressures
    const pressureSegments = edge.data('pressureSegments') || [];
    pressureSegments.forEach(pressure => {
      row.push((parseFloat(pressure) || 0).toFixed(3));
    });
  });
  
  csvData.push(row);
  
  // Update CSV button state
  updateCSVButtonState();
}

function generateCSV() {
  if (csvData.length === 0) {
    alert('No simulation data to export. Run a simulation for at least 1 minute first.');
    return;
  }
  
  let csvContent = csvHeaders.join(',') + '\n';
  csvData.forEach(row => {
    csvContent += row.join(',') + '\n';
  });
  
  // Create and download the file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  
  // Generate filename with timestamp
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 19).replace(/[:.]/g, '-');
  link.setAttribute('download', `gas_simulation_${timestamp}.csv`);
  
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function resetCSVData() {
  csvData = [];
  csvHeaders = [];
  lastLoggedMinute = -1;
  updateCSVButtonState();
}

function hasCSVData() {
  return csvData.length > 0;
}

function updateCSVButtonState() {
  const csvButton = document.getElementById('csvButton');
  if (csvButton) {
    if (hasCSVData()) {
      csvButton.classList.remove('deactivated');
      csvButton.disabled = false;
    } else {
      csvButton.classList.add('deactivated');
      csvButton.disabled = true;
    }
  }
}

// Make CSV functions globally available
window.generateCSV = generateCSV;
window.resetCSVData = resetCSVData;
window.initializeCSVHeaders = initializeCSVHeaders;
window.logSimulationData = logSimulationData;
window.hasCSVData = hasCSVData;
window.updateCSVButtonState = updateCSVButtonState;

// Initialize CSV button state when the page loads
document.addEventListener('DOMContentLoaded', function() {
  // Small delay to ensure all other scripts have loaded
  setTimeout(updateCSVButtonState, 100);
}); 