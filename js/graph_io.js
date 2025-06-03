// graph_io.js - Graph Import/Export Module
class GraphIO {
  constructor() {
    this.storageKey = 'gas-flows-saved-graphs';
    this.currentGraphKey = 'gas-flows-current-graph';
  }

  // Export current graph to JSON file
  exportGraph() {
    try {
      const graphData = this.captureGraphData();
      const dataStr = JSON.stringify(graphData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.download = `gas-flows-graph-${timestamp}.json`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('Graph exported successfully');
      
      // Also save to localStorage as backup
      this.saveToLocalStorage(graphData);
      
    } catch (error) {
      console.error('Error exporting graph:', error);
      alert('Error exporting graph: ' + error.message);
    }
  }

  // Import graph from JSON file
  importGraph() {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      input.onchange = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const graphData = JSON.parse(e.target.result);
            this.loadGraphData(graphData);
            console.log('Graph imported successfully');
            
            // Save imported graph to localStorage
            this.saveToLocalStorage(graphData);
            
          } catch (error) {
            console.error('Error parsing imported file:', error);
            alert('Error importing graph: Invalid JSON file format');
          }
        };
        reader.readAsText(file);
      };
      
      input.click();
      
    } catch (error) {
      console.error('Error importing graph:', error);
      alert('Error importing graph: ' + error.message);
    }
  }

  // Capture current graph data
  captureGraphData() {
    const elements = cy.json().elements;
    
    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      simulatedSeconds: simulatedSeconds || 0,
      nodeIdCounter: nodeIdCounter || 0,
      uiMode: uiMode || 'build',
      simState: simState || 'pause',
      elements: elements,
      metadata: {
        nodeCount: cy.nodes().length,
        edgeCount: cy.edges().length,
        totalVolume: this.calculateTotalVolume(),
        description: 'Gas Flows Simulator Graph Export'
      }
    };
  }

  // Load graph data into the simulator
  loadGraphData(graphData, silent = false) {
    try {
      // Validate data structure
      if (!graphData.elements) {
        throw new Error('Invalid graph data: missing elements');
      }

      // Stop any running simulation
      if (window.setSimulationMode) {
        window.setSimulationMode('stop', cy, updateInfo);
      }

      // Clear existing graph
      cy.elements().remove();

      // Load elements
      cy.json({ elements: graphData.elements });

      // Restore simulation state
      if (graphData.simulatedSeconds !== undefined) {
        simulatedSeconds = graphData.simulatedSeconds;
      }
      if (graphData.nodeIdCounter !== undefined) {
        nodeIdCounter = graphData.nodeIdCounter;
      }

      // Restore UI state
      if (graphData.uiMode && window.setUIMode) {
        window.setUIMode(graphData.uiMode);
      }
      if (graphData.simState && window.setSimState) {
        window.setSimState(graphData.simState);
      }

      // Update display
      if (window.updateInfo) {
        window.updateInfo();
      }

      // Log success instead of showing alert
      console.log(`Graph loaded successfully! Nodes: ${graphData.metadata?.nodeCount || cy.nodes().length}, Edges: ${graphData.metadata?.edgeCount || cy.edges().length}`);

    } catch (error) {
      console.error('Error loading graph data:', error);
      alert('Error loading graph: ' + error.message);
    }
  }

  // Save to localStorage for persistence
  saveToLocalStorage(graphData) {
    try {
      const savedGraphs = this.getSavedGraphs();
      
      // Add current graph to saved list
      const graphEntry = {
        id: Date.now(),
        name: `Graph ${new Date().toLocaleString()}`,
        timestamp: new Date().toISOString(),
        data: graphData
      };
      
      savedGraphs.push(graphEntry);
      
      // Keep only last 10 saved graphs
      if (savedGraphs.length > 10) {
        savedGraphs.splice(0, savedGraphs.length - 10);
      }
      
      localStorage.setItem(this.storageKey, JSON.stringify(savedGraphs));
      localStorage.setItem(this.currentGraphKey, JSON.stringify(graphData));
      
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }

  // Load from localStorage
  loadFromLocalStorage() {
    try {
      const currentGraph = localStorage.getItem(this.currentGraphKey);
      if (currentGraph) {
        const graphData = JSON.parse(currentGraph);
        this.loadGraphData(graphData, true); // silent = true for automatic loading
        return true;
      }
    } catch (error) {
      console.error('Error loading from localStorage:', error);
    }
    return false;
  }

  // Get list of saved graphs
  getSavedGraphs() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error('Error getting saved graphs:', error);
      return [];
    }
  }

  // Auto-save current graph state
  autoSave() {
    try {
      const graphData = this.captureGraphData();
      localStorage.setItem(this.currentGraphKey, JSON.stringify(graphData));
    } catch (error) {
      console.error('Error auto-saving:', error);
    }
  }

  // Calculate total volume for metadata
  calculateTotalVolume() {
    let totalVol = 0;
    cy.edges().forEach(edge => {
      const volumeSegments = edge.data('volumeSegments') || [];
      const sumVol = volumeSegments.reduce((s, v) => s + (v || 0), 0);
      totalVol += sumVol;
    });
    return totalVol;
  }

  // Clear all saved data
  clearSavedData() {
    try {
      localStorage.removeItem(this.storageKey);
      localStorage.removeItem(this.currentGraphKey);
      console.log('All saved graph data cleared');
    } catch (error) {
      console.error('Error clearing saved data:', error);
    }
  }

  // Show saved graphs list (for future enhancement)
  showSavedGraphsList() {
    const savedGraphs = this.getSavedGraphs();
    if (savedGraphs.length === 0) {
      console.log('No saved graphs found.');
      return;
    }

    let list = 'Saved Graphs:\n\n';
    savedGraphs.forEach((graph, index) => {
      list += `${index + 1}. ${graph.name}\n   ${new Date(graph.timestamp).toLocaleString()}\n   Nodes: ${graph.data.metadata?.nodeCount || 'Unknown'}, Edges: ${graph.data.metadata?.edgeCount || 'Unknown'}\n\n`;
    });
    
    console.log(list);
  }

  // Recover last saved graph
  recoverLastGraph() {
    try {
      const currentGraph = localStorage.getItem(this.currentGraphKey);
      if (currentGraph) {
        const graphData = JSON.parse(currentGraph);
        
        // Ask user for confirmation
        const nodeCount = graphData.metadata?.nodeCount || 'Unknown';
        const edgeCount = graphData.metadata?.edgeCount || 'Unknown';
        const timestamp = new Date(graphData.timestamp).toLocaleString();
        
        const confirmed = confirm(
          `Recover last saved graph?\n\n` +
          `Saved: ${timestamp}\n` +
          `Nodes: ${nodeCount}, Edges: ${edgeCount}\n\n` +
          `This will replace your current graph.`
        );
        
        if (confirmed) {
          this.loadGraphData(graphData);
          return true;
        }
      } else {
        console.log('No saved graph found to recover.');
      }
    } catch (error) {
      console.error('Error recovering last graph:', error);
      alert('Error recovering graph: ' + error.message);
    }
    return false;
  }
}

// Create global instance
window.graphIO = new GraphIO();

// Wire up export/import buttons when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  const exportButton = document.getElementById('exportButton');
  const importButton = document.getElementById('importButton');
  const recoverButton = document.getElementById('recoverButton');
  
  if (exportButton) {
    exportButton.addEventListener('click', () => {
      if (cy.elements().length === 0) {
        console.log('No graph data to export. Please create some nodes and edges first.');
        return;
      }
      window.graphIO.exportGraph();
    });
  }
  
  if (importButton) {
    importButton.addEventListener('click', () => {
      window.graphIO.importGraph();
    });
  }

  if (recoverButton) {
    recoverButton.addEventListener('click', () => {
      window.graphIO.recoverLastGraph();
    });
  }
});

// Auto-save every 30 seconds when there are changes
setInterval(() => {
  if (cy && cy.elements().length > 0) {
    window.graphIO.autoSave();
  }
}, 30000);

// Save on page unload
window.addEventListener('beforeunload', () => {
  if (window.graphIO && cy && cy.elements().length > 0) {
    window.graphIO.autoSave();
  }
});