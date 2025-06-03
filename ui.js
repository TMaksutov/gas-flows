// ui.js
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

// Collapsible container functionality
function initializeCollapsibleContainers() {
  const headers = document.querySelectorAll('.collapsible-header');
  
  headers.forEach(header => {
    const content = header.nextElementSibling;
    const toggle = header.querySelector('.collapsible-toggle');
    
    // Set initial collapsed state
    header.classList.add('collapsed');
    content.classList.add('collapsed');
    content.classList.remove('expanded');
    
    header.addEventListener('click', () => {
      const isCollapsed = header.classList.contains('collapsed');
      
      if (isCollapsed) {
        // Expand
        header.classList.remove('collapsed');
        content.classList.remove('collapsed');
        content.classList.add('expanded');
      } else {
        // Collapse
        header.classList.add('collapsed');
        content.classList.add('expanded');
        content.classList.remove('expanded');
        setTimeout(() => {
          content.classList.add('collapsed');
        }, 10);
      }
    });
  });
}

// Base closeActivePopup
function closeActivePopup() {
  if (activePopup) {
    document.body.removeChild(activePopup);
    activePopup = null;
  }
}

window.addEventListener('load', () => {
  window.firstNode = null;
  window.creationActive = false;
  loadGraphFromLocalStorage();
  
  // Initialize collapsible containers after page load
  setTimeout(initializeCollapsibleContainers, 100);
}); 