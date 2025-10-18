// AGA8Flow.js - Combined AGA8 composition and Panhandle B flow calculator
// This file combines the functionality from aga8.html and index.html

// Define the component orders
const GROUPED_ORDER = [
  'methane', 'ethane', 'propane', 'isobutane', 'n-butane', 
  'isopentane', 'n-pentane', 'n-hexane', 'n-heptane', 'n-octane',
  'n-nonane', 'n-decane', 'helium', 'argon', 'nitrogen',
  'oxygen', 'carbon-monoxide', 'carbon-dioxide', 'hydrogen',
  'water', 'hydrogen-sulfide'
];

// Standard atmospheric pressure for conversion between gauge and absolute pressure
const ATMOSPHERIC_PRESSURE_BAR = 1.01325;

const AGA8_ORDER = [
  'methane', 'nitrogen', 'carbon-dioxide', 'ethane', 'propane',
  'water', 'hydrogen-sulfide', 'hydrogen', 'carbon-monoxide', 'oxygen',
  'isobutane', 'n-butane', 'isopentane', 'n-pentane', 'n-hexane',
  'n-heptane', 'n-octane', 'n-nonane', 'n-decane', 'helium', 'argon'
];

// Storage keys
const STORAGE_KEY = 'aga8FlowUserInputs';
const ORDER_KEY = 'aga8FlowOrderMode';

// Pressure conversion functions
function bargToBarA(barg) {
  return barg + ATMOSPHERIC_PRESSURE_BAR;
}

function barAToBarg(barA) {
  return barA - ATMOSPHERIC_PRESSURE_BAR;
}

// Default values
const defaultValues = {
  // Gas composition
  temperature: 15,
  methane: 0.9659,
  ethane: 0.02751,
  propane: 0.00046,
  isobutane: 0.00046,
  'n-butane': 0.00010,
  isopentane: 0.00004,
  'n-pentane': 0.00002,
  'n-hexane': 0.00002,
  'n-heptane': 0.0,
  'n-octane': 0.0,
  'n-nonane': 0.0,
  'n-decane': 0.0,
  helium: 0.0,
  argon: 0.0,
  nitrogen: 0.002,
  oxygen: 0.0,
  'carbon-monoxide': 0.0,
  'carbon-dioxide': 0.00349,
  hydrogen: 0.0,
  water: 0.0,
  'hydrogen-sulfide': 0.0,
  // Flow parameters (Pb stays barA, others are barg)
  Tb: 20,
  Pb: 1.01325,
  E: 0.95,
  H1: 0,
  H2: 0,
  L: 100,
  D: 500,
  P1:50,
  P2: 20,
  // Pressure range parameters
  P1_min: 50,
  P1_max: 60,
  P2_min: 20,
  P2_max: 30,
  pressureStep: 1
};

// Function to reorder components
function reorderComponents(order) {
  const container = document.querySelector('.column');
  if (!container) {
    console.error('Could not find .column container');
    return;
  }
  const components = Array.from(container.querySelectorAll('.field-group')).filter(
    div => div.querySelector('input[id^="mol_"]')
  );
  
  // Create a map of component divs by their ID
  const componentMap = {};
  components.forEach(div => {
    const input = div.querySelector('input[id^="mol_"]');
    const id = input.id.replace('mol_', '');
    componentMap[id] = div;
  });

  // Remove all component divs
  components.forEach(div => div.remove());

  // Find the first section heading within the composition column (language-agnostic)
  const gasCompositionHeading = container.querySelector('h3');
  
  // Add them back in the specified order
  if (gasCompositionHeading) {
    let insertAfter = gasCompositionHeading;
    order.forEach(id => {
      if (componentMap[id]) {
        insertAfter.insertAdjacentElement('afterend', componentMap[id]);
        insertAfter = componentMap[id];
      }
    });
  } else {
    // Fallback: append to the end of the column
    order.forEach(id => {
      if (componentMap[id]) {
        container.appendChild(componentMap[id]);
      }
    });
  }
}

// Function to update button active states
function updateButtonStates(activeButton) {
  const buttons = document.querySelectorAll('.controlButton');
  buttons.forEach(button => button.classList.remove('active'));
  activeButton.classList.add('active');
}

// Persistence functions
function saveUserInputs() {
  const data = {
    temperature: document.getElementById('temperature').value,
  };
  
  // Save composition data
  GROUPED_ORDER.forEach(id => {
    const input = document.getElementById('mol_' + id);
    if (input) data[id] = input.value;
  });
  
  // Save flow parameters
  ['Tb', 'Pb', 'E', 'H1', 'H2', 'L', 'D', 'P1', 'P2', 'P1_min', 'P1_max', 'P2_min', 'P2_max', 'pressureStep'].forEach(id => {
    const input = document.getElementById(id);
    if (input) data[id] = input.value;
  });
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function saveOrderMode(mode) {
  localStorage.setItem(ORDER_KEY, mode);
}

function loadOrderMode() {
  return localStorage.getItem(ORDER_KEY);
}

function clearOrderMode() {
  localStorage.removeItem(ORDER_KEY);
}

function loadUserInputs() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return;
  try {
    const vals = JSON.parse(data);
    
    // Load temperature
    if (vals.temperature !== undefined) {
      document.getElementById('temperature').value = vals.temperature;
    }
    
    // Load composition data
    GROUPED_ORDER.forEach(id => {
      if (vals[id] !== undefined) {
        const input = document.getElementById('mol_' + id);
        if (input) input.value = vals[id];
      }
    });
    
    // Load flow parameters
    ['Tb', 'Pb', 'E', 'H1', 'H2', 'L', 'D', 'P1', 'P2', 'P1_min', 'P1_max', 'P2_min', 'P2_max', 'pressureStep'].forEach(id => {
      if (vals[id] !== undefined) {
        const input = document.getElementById(id);
        if (input) input.value = vals[id];
      }
    });
  } catch {}
}

function clearUserInputs() {
  localStorage.removeItem(STORAGE_KEY);
}

// Calculate molar mass from composition
function calculateMolarMass(xj) {
  // Map from grouped order (xj) to ISO order (MW array)
  // xj order: methane, ethane, propane, isobutane, n-butane, isopentane, n-pentane, n-hexane, n-heptane, n-octane, n-nonane, n-decane, helium, argon, nitrogen, oxygen, carbon-monoxide, carbon-dioxide, hydrogen, water, hydrogen-sulfide
  // MW order: methane, nitrogen, carbon-dioxide, ethane, propane, water, hydrogen-sulfide, hydrogen, carbon-monoxide, oxygen, isobutane, n-butane, isopentane, n-pentane, n-hexane, n-heptane, n-octane, n-nonane, n-decane, helium, argon
  const MW_INDICES = [0, 3, 4, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 1, 9, 8, 2, 7, 5, 6];
  return xj.reduce((sum, x, i) => sum + x * MW[MW_INDICES[i]], 0);
}

// Calculate flow and volume for specific pressure pair
function calculateFlowForPressures(xj, P1_kPa, P2_kPa) {
  // Get flow parameters (Pb is already barA, convert to kPa for calculations)
  const T_C = parseFloat(document.getElementById('temperature').value);
  const T = T_C + 273.15; // K
  const Tb = parseFloat(document.getElementById('Tb').value);
  const Pb = parseFloat(document.getElementById('Pb').value) * 100; // Pb is already barA, convert to kPa
  const E = parseFloat(document.getElementById('E').value);
  const H1 = parseFloat(document.getElementById('H1').value);
  const H2 = parseFloat(document.getElementById('H2').value);
  const L = parseFloat(document.getElementById('L').value);
  const D_mm = parseFloat(document.getElementById('D').value);

  // Calculate proper average pressure (same as used in Panhandle B)
  let Pavg;
  if (P1_kPa !== P2_kPa) {
    Pavg = (2 / 3) * ((Math.pow(P1_kPa, 3) - Math.pow(P2_kPa, 3)) / (Math.pow(P1_kPa, 2) - Math.pow(P2_kPa, 2)));
  } else {
    Pavg = P1_kPa;
  }

  // Calculate Z-factor and gas properties using the proper average pressure
  const P = Pavg / 1000; // Convert kPa to MPa for AGA8 (1 MPa = 1000 kPa)
  const { Z, D } = compressibilityFactor(xj, T, P); // D → kmol·m⁻³
  
  const M_mix = calculateMolarMass(xj); // g/mol
  const G = M_mix / 28.9647; // Relative density (air = 1)
  
  // Calculate flow using Panhandle B with calculated Z and G
  const formulaParams = { 
    E, 
    Tb, 
    Pb, 
    P1: P1_kPa, 
    P2: P2_kPa, 
    G, 
    Tf: T_C, 
    L, 
    D: D_mm, 
    Z, 
    H1, 
    H2 
  };
  
  const Q_std_m3s = panhandleB(formulaParams);
  const Q_MSm3d = Q_std_m3s * 86400 / 1e6; // Convert to million m³/day

  // Calculate volume inside pipeline (million m³)
  const D_m = D_mm / 1000;
  const T_K = T_C + 273.15;
  const P_base = Pb; // kPa (already converted from barA)
  const T_base = Tb + 273.15; // K
  const Volume = Math.PI * Math.pow(D_m, 2) / 4 * (L * 1000) * (Pavg / P_base) * (T_base / (Z * T_K)) / 1e6; // Convert to million m³

  return { Q_MSm3d, Volume };
}

// Generate and populate pressure range tables
function generatePressureTables() {
  const P1_min = parseFloat(document.getElementById('P1_min').value);
  const P1_max = parseFloat(document.getElementById('P1_max').value);
  const P2_min = parseFloat(document.getElementById('P2_min').value);
  const P2_max = parseFloat(document.getElementById('P2_max').value);
  const step = parseFloat(document.getElementById('pressureStep').value);

  // Validate pressure ranges and step
  if (P1_min >= P1_max || P2_min >= P2_max || P1_min <= 0 || P2_min <= 0 || step <= 0) {
    return;
  }

  // Create pressure arrays
  const P1_values = [];
  const P2_values = [];
  
  for (let p = P1_min; p <= P1_max; p += step) {
    P1_values.push(p);
  }
  if (P1_values[P1_values.length - 1] !== P1_max) {
    P1_values.push(P1_max);
  }
  
  // Reverse P1_values so higher pressures appear in top rows
  P1_values.reverse();
  
  for (let p = P2_min; p <= P2_max; p += step) {
    P2_values.push(p);
  }
  if (P2_values[P2_values.length - 1] !== P2_max) {
    P2_values.push(P2_max);
  }

  // Get composition data
  const molInputs = [];
  let moleSum = 0;
  const componentIds = GROUPED_ORDER;

  for (const id of componentIds) {
    let input = document.getElementById('mol_' + id);
    let v = parseFloat(input.value);
    if (isNaN(v) || v < 0) v = 0;
    else if (v > 1) v = 1;
    molInputs.push(v);
    moleSum += v;
  }

  // Only generate tables if composition sums to 1
  if (Math.abs(moleSum - 1) > 1e-6) {
    clearTables();
    return;
  }

  const xj = molInputs;

  try {
    // Generate flow table
    const flowTable = document.getElementById('flowTable');
    const flowThead = flowTable.querySelector('thead tr');
    const flowTbody = flowTable.querySelector('tbody');
    
    // Clear existing content
    flowThead.innerHTML = '<th style="border: 1px solid #ccc; padding: 4px; background-color: #f5f5f5;">P1\\P2</th>';
    flowTbody.innerHTML = '';
    
    // Add column headers (P2 values)
    P2_values.forEach(p2 => {
      const th = document.createElement('th');
      th.style.cssText = 'border: 1px solid #ccc; padding: 4px; background-color: #f5f5f5; font-size: 10px;';
      th.textContent = p2.toFixed(1);
      flowThead.appendChild(th);
    });
    
    // Add rows (P1 values)
    P1_values.forEach(p1 => {
      const tr = document.createElement('tr');
      
      // Row header
      const th = document.createElement('th');
      th.style.cssText = 'border: 1px solid #ccc; padding: 4px; background-color: #f5f5f5; font-size: 10px;';
      th.textContent = p1.toFixed(1);
      tr.appendChild(th);
      
      // Data cells
      P2_values.forEach(p2 => {
        const td = document.createElement('td');
        td.style.cssText = 'border: 1px solid #ccc; padding: 4px; text-align: center; font-size: 10px;';
        
        if (p1 > p2) {
          try {
            const result = calculateFlowForPressures(xj, bargToBarA(p1) * 100, bargToBarA(p2) * 100); // Convert barg to barA to kPa
            td.textContent = result.Q_MSm3d.toFixed(1);
          } catch (err) {
            td.textContent = 'Error';
            td.style.color = 'red';
          }
        } else {
          td.textContent = 'N/A';
          td.style.color = '#999';
        }
        
        tr.appendChild(td);
      });
      
      flowTbody.appendChild(tr);
    });

    // Generate volume table
    const volumeTable = document.getElementById('volumeTable');
    const volumeThead = volumeTable.querySelector('thead tr');
    const volumeTbody = volumeTable.querySelector('tbody');
    
    // Clear existing content
    volumeThead.innerHTML = '<th style="border: 1px solid #ccc; padding: 4px; background-color: #f5f5f5;">P1\\P2</th>';
    volumeTbody.innerHTML = '';
    
    // Add column headers (P2 values)
    P2_values.forEach(p2 => {
      const th = document.createElement('th');
      th.style.cssText = 'border: 1px solid #ccc; padding: 4px; background-color: #f5f5f5; font-size: 10px;';
      th.textContent = p2.toFixed(1);
      volumeThead.appendChild(th);
    });
    
    // Add rows (P1 values)
    P1_values.forEach(p1 => {
      const tr = document.createElement('tr');
      
      // Row header
      const th = document.createElement('th');
      th.style.cssText = 'border: 1px solid #ccc; padding: 4px; background-color: #f5f5f5; font-size: 10px;';
      th.textContent = p1.toFixed(1);
      tr.appendChild(th);
      
      // Data cells
      P2_values.forEach(p2 => {
        const td = document.createElement('td');
        td.style.cssText = 'border: 1px solid #ccc; padding: 4px; text-align: center; font-size: 10px;';
        
        if (p1 > p2) {
          try {
            const result = calculateFlowForPressures(xj, bargToBarA(p1) * 100, bargToBarA(p2) * 100); // Convert barg to barA to kPa
            td.textContent = result.Volume.toFixed(1);
          } catch (err) {
            td.textContent = 'Error';
            td.style.color = 'red';
          }
        } else {
          td.textContent = 'N/A';
          td.style.color = '#999';
        }
        
        tr.appendChild(td);
      });
      
      volumeTbody.appendChild(tr);
    });

  } catch (err) {
    console.error('Error generating tables:', err);
    clearTables();
  }
}

// Clear tables when composition is invalid
function clearTables() {
  const flowTable = document.getElementById('flowTable');
  const volumeTable = document.getElementById('volumeTable');
  
  if (flowTable) {
    const flowTbody = flowTable.querySelector('tbody');
    if (flowTbody) flowTbody.innerHTML = '';
  }
  
  if (volumeTable) {
    const volumeTbody = volumeTable.querySelector('tbody');
    if (volumeTbody) volumeTbody.innerHTML = '';
  }
}

// Main calculation function combining AGA8 and flow calculations
function calculateFlow() {
  const tol = 1e-6;
  const molInputs = [];
  let moleSum = 0;

  // Gather 21 user mole-fraction inputs
  const componentIds = GROUPED_ORDER;

  for (const id of componentIds) {
    let input = document.getElementById('mol_' + id);
    let v = parseFloat(input.value);
    if (isNaN(v) || v < 0) {
      v = 0;
      input.value = "0.0";
    } else if (v > 1) {
      v = 1;
      input.value = "1.0";
    }
    molInputs.push(v);
    moleSum += v;
  }

  // Result fields
  const zField = document.getElementById('zResult');
  const relField = document.getElementById('relativeResult');
  const sumField = document.getElementById('sumResult');
  
  // Additional result fields from aga8.html
  const densityField = document.getElementById('densityResult');
  const massField = document.getElementById('massDensityResult');
  const baseField = document.getElementById('massDensityBaseResult');

  // Display sum of mole fractions
  if (Math.abs(moleSum - 1) > tol) {
    sumField.value = moleSum.toFixed(6) + ' ❌';
  } else {
    sumField.value = moleSum.toFixed(6);
  }

  // Clear results if composition doesn't sum to 1
  if (Math.abs(moleSum - 1) > tol) {
    zField.value = '';
    relField.value = '';
    densityField.value = '';
    massField.value = '';
    baseField.value = '';
    // Clear flow results
    ['Q_m3s', 'Q_th_m3h', 'Q_mil_m3d', 'V1', 'V2', 'Pavg', 'Volume'].forEach(id => {
      document.getElementById(id).value = '';
    });
    return;
  }

  // Get flow parameters (Pb is already barA, convert P1/P2 from barg to barA, then to kPa for calculations)
  const T_C = parseFloat(document.getElementById('temperature').value);
  const T = T_C + 273.15; // K
  const Tb = parseFloat(document.getElementById('Tb').value);
  const Pb = parseFloat(document.getElementById('Pb').value) * 100; // Pb is already barA, convert to kPa
  const E = parseFloat(document.getElementById('E').value);
  const H1 = parseFloat(document.getElementById('H1').value);
  const H2 = parseFloat(document.getElementById('H2').value);
  const L = parseFloat(document.getElementById('L').value);
  const D_mm = parseFloat(document.getElementById('D').value);
  const P1_barg = parseFloat(document.getElementById('P1').value);
  const P2_barg = parseFloat(document.getElementById('P2').value);
  const P1_kPa = bargToBarA(P1_barg) * 100; // Convert barg to barA to kPa
  const P2_kPa = bargToBarA(P2_barg) * 100; // Convert barg to barA to kPa

  // Use the 21-component vector directly
  const xj = molInputs;

  try {
    // Calculate proper average pressure (same as used in Panhandle B)
    let Pavg;
    if (P1_kPa !== P2_kPa) {
      Pavg = (2 / 3) * ((Math.pow(P1_kPa, 3) - Math.pow(P2_kPa, 3)) / (Math.pow(P1_kPa, 2) - Math.pow(P2_kPa, 2)));
    } else {
      Pavg = P1_kPa;
    }

    // Calculate Z-factor and gas properties using the proper average pressure
    const P = Pavg / 1000; // Convert kPa to MPa for AGA8 (1 MPa = 1000 kPa)
    const { Z, D } = compressibilityFactor(xj, T, P); // D → kmol·m⁻³
    
    // Update Z result field
    zField.value = Z.toFixed(5);
    
    // Update molar density
    densityField.value = D.toFixed(4);

    const M_mix = calculateMolarMass(xj); // g/mol
    const G = M_mix / 28.9647; // Relative density (air = 1)
    
    // Update relative density field
    relField.value = G.toFixed(3);
    
    // Calculate mass density at operating conditions
    const rho = D * M_mix; // kg·m⁻³ (D kmol/m³ × g/mol × 1 kg/1000 g × 1000 mol/kmol)
    massField.value = rho.toFixed(3);

    // Calculate base-condition density (20 °C & base pressure)
    const Tbase = 293.15;          // 20 °C in K
    const Pbase = Pb / 1000;       // Convert kPa to MPa for AGA8
    const { D: Dbase } = compressibilityFactor(xj, Tbase, Pbase);
    const rhoBase = Dbase * M_mix; // kg·m⁻³
    baseField.value = rhoBase.toFixed(3);

    // Calculate flow using Panhandle B with calculated Z and G
    const formulaParams = { 
      E, 
      Tb, 
      Pb, 
      P1: P1_kPa, 
      P2: P2_kPa, 
      G, 
      Tf: T_C, 
      L, 
      D: D_mm, 
      Z, 
      H1, 
      H2 
    };
    
    const Q_std_m3s = panhandleB(formulaParams);

    // Derived flows
    const Q_th_m3h = Q_std_m3s * 3600 / 1000;
    const Q_mil_m3d = Q_std_m3s * 86400 / 1e6;

    document.getElementById('Q_m3s').value = Q_std_m3s.toFixed(3);
    document.getElementById('Q_th_m3h').value = Q_th_m3h.toFixed(3);
    document.getElementById('Q_mil_m3d').value = Q_mil_m3d.toFixed(3);

    // Calculate velocities and other parameters
    const D_m = D_mm / 1000;
    const area = Math.PI * Math.pow(D_m, 2) / 4;
    const T_K = T_C + 273.15;
    const R = 8.314; // J/(mol·K)
    const M = M_mix / 1000; // kg/mol (convert from g/mol to kg/mol)

    // Standard density at base conditions
    const P_base = Pb; // kPa (already converted from barA)
    const T_base = Tb + 273.15; // K
    const rho_std = (P_base * M) / (R * T_base);

    // Mass flow
    const mass_flow = Q_std_m3s * rho_std;

    // Actual densities at inlet and outlet
    const rho1_actual = (P1_kPa * M) / (Z * R * T_K);
    const rho2_actual = (P2_kPa * M) / (Z * R * T_K);

    // Actual volumetric flows
    const Q1_actual_m3s = mass_flow / rho1_actual;
    const Q2_actual_m3s = mass_flow / rho2_actual;

    // Velocities
    const V1 = Q1_actual_m3s / area;
    const V2 = Q2_actual_m3s / area;

    document.getElementById('V1').value = V1.toFixed(2);
    document.getElementById('V2').value = V2.toFixed(2);

    // Display the average pressure (convert back to barg for display)
    document.getElementById('Pavg').value = barAToBarg(Pavg / 100).toFixed(1);

    // Volume inside pipeline (thousand m³)
    const Volume = Math.PI * Math.pow(D_m, 2) / 4 * (L * 1000) * (Pavg / P_base) * (T_base / (Z * T_K)) / 1000;

    document.getElementById('Volume').value = Volume.toFixed(3);

    // Generate pressure range tables
    generatePressureTables();

  } catch (err) {
    zField.value = `Error: ${err.message} ❌`;
    relField.value = '';
    densityField.value = '';
    massField.value = '';
    baseField.value = '';
    // Clear flow results on error
    ['Q_m3s', 'Q_th_m3h', 'Q_mil_m3d', 'V1', 'V2', 'Pavg', 'Volume'].forEach(id => {
      document.getElementById(id).value = '';
    });
    // Clear tables on error
    clearTables();
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
  loadUserInputs(); // Restore saved values if present
  
  // Restore order mode if present
  const savedOrder = loadOrderMode();
  if (savedOrder === 'aga8') {
    reorderComponents(AGA8_ORDER);
    updateButtonStates(document.getElementById('AGAOrder'));
  } else {
    reorderComponents(GROUPED_ORDER);
    updateButtonStates(document.getElementById('groupedOrder'));
  }
  
  calculateFlow(); // Auto-calculate on page load
  
  // Add event listeners for all inputs
  document.querySelectorAll(
    '#temperature, input[id^="mol_"], #Tb, #Pb, #E, #H1, #H2, #L, #D, #P1, #P2, #P1_min, #P1_max, #P2_min, #P2_max, #pressureStep'
  ).forEach(el => el.addEventListener('input', () => {
    calculateFlow();
    saveUserInputs();
  }));
});

// Order button event listeners
document.getElementById('groupedOrder').addEventListener('click', function() {
  reorderComponents(GROUPED_ORDER);
  updateButtonStates(this);
  saveOrderMode('grouped');
});

document.getElementById('AGAOrder').addEventListener('click', function() {
  reorderComponents(AGA8_ORDER);
  updateButtonStates(this);
  saveOrderMode('aga8');
});

// Reset button logic
document.getElementById('resetButton').addEventListener('click', function() {
  clearUserInputs();
  clearOrderMode();
  
  // Reset temperature
  document.getElementById('temperature').value = defaultValues.temperature;
  
  // Reset composition
  GROUPED_ORDER.forEach(id => {
    const input = document.getElementById('mol_' + id);
    if (input && defaultValues[id] !== undefined) {
      input.value = defaultValues[id];
    }
  });
  
  // Reset flow parameters
  ['Tb', 'Pb', 'E', 'H1', 'H2', 'L', 'D', 'P1', 'P2', 'P1_min', 'P1_max', 'P2_min', 'P2_max', 'pressureStep'].forEach(id => {
    const input = document.getElementById(id);
    if (input && defaultValues[id] !== undefined) {
      input.value = defaultValues[id];
    }
  });
  
  reorderComponents(GROUPED_ORDER);
  updateButtonStates(document.getElementById('groupedOrder'));
  calculateFlow();
  saveUserInputs();
  saveOrderMode('grouped');
}); 