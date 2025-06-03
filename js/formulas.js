/******************************************************
 * Gas Flow Equations - Parameter Units (SI Units)
 * 
 * Parameter | Description                                          | Units
 * ----------|------------------------------------------------------|--------
 * Q         | Volume flow rate, standard                           | m³/s
 * E         | Pipeline efficiency, a value less than 1             | dimensionless
 * Tb        | Base temperature (converted to K in function)        | °C
 * Pb        | Base pressure                                        | kPa
 * P1        | Upstream pressure                                    | kPa
 * P2        | Downstream pressure                                  | kPa
 * G         | Gas gravity (air = 1)                                | dimensionless
 * Tf        | Gas flow temperature at average condition (converted to K) | °C
 * Le        | Equivalent length of pipe segment                    | km
 * L         | Length of pipe segment                               | km
 * Z         | Gas compressibility factor                           | dimensionless
 * D         | Pipe inside diameter                                 | mm
 * s         | Elevation adjustment parameter                       | dimensionless
 * H1        | Upstream elevation                                   | m
 * H2        | Downstream elevation                                 | m
 * f         | Darcy friction factor (Darcy-Weisbach only)          | dimensionless
 * rho       | Gas density at flowing conditions (Darcy-Weisbach only) | kg/m³
 * 
 * Notes:
 * - Weymouth: General purpose gas flow equation
 * - Darcy-Weisbach: Fundamental fluid mechanics approach
 * - Panhandle A: Valid for Reynolds 5-11 million, 12-60 inch pipes, 800-1500 psia
 * - Panhandle B: Valid for Reynolds 4-40 million, >36 inch pipes, >1000 psia
 ******************************************************/
function weymouth({ E, Tb, Pb, P1, P2, G, Tf, L, D, Z, H1, H2 }) {
  // Convert temperatures from °C to K
  const Tb_K = Tb + 273.15;
  const Tf_K = Tf + 273.15;

  // Elevation adjustment parameter
  const s = 0.0684 * G * ((H2 - H1) / (Tf_K * Z));

  // Equivalent length (Le)
  let Le = L;
  if (Math.abs(s) > 1e-12) {
    Le = (L * (Math.exp(s) - 1)) / s;
  }

  // Full Weymouth equation
  const Q = 3.7435e-3 * (Tb_K / Pb) * Math.sqrt((Math.pow(P1, 2) - Math.exp(s) * Math.pow(P2, 2)) / (G * Tf_K * Le * Z)) * Math.pow(D, 2.667) * E / (24 * 60 * 60);

  return Q;
}

function darcyWeisbach({ E, Tb, Pb, P1, P2, G, Tf, L, D, Z, f, rho, H1, H2 }) {
  // Convert temperatures from °C to K
  const Tb_K = Tb + 273.15;
  const Tf_K = Tf + 273.15;
  
  // Convert units
  const D_m = D / 1000;  // mm to m
  const L_m = L * 1000;  // km to m
  const P1_Pa = P1 * 1000;  // kPa to Pa
  const P2_Pa = P2 * 1000;  // kPa to Pa
  const Pb_Pa = Pb * 1000;  // kPa to Pa
  
  // Calculate pressure drop including elevation effects
  const g = 9.81;  // gravity acceleration
  const deltaPf = P1_Pa - P2_Pa - rho * g * (H2 - H1);  // Frictional pressure drop
  
  // Calculate velocity from Darcy-Weisbach equation: ΔPf = f * (L/D) * (ρ*v²/2)
  // Rearranged: v = sqrt(2 * ΔPf * D / (f * L * ρ))
  const velocity = Math.sqrt((2 * deltaPf * D_m) / (f * L_m * rho));
  
  // Calculate cross-sectional area
  const area = Math.PI * Math.pow(D_m, 2) / 4;
  
  // Calculate actual volumetric flow rate
  const Q_actual = velocity * area * E;
  
  // Convert to standard conditions
  const Q_standard = Q_actual * (P1_Pa / Pb_Pa) * (Tb_K / Tf_K) * Z;
  
  return Q_standard;
}

function panhandleA({ E, Tb, Pb, P1, P2, G, Tf, L, D, Z, H1, H2 }) {
  // Convert temperatures from °C to K
  const Tb_K = Tb + 273.15;
  const Tf_K = Tf + 273.15;

  // Elevation adjustment parameter
  const s = 0.0684 * G * ((H2 - H1) / (Tf_K * Z));

  // Equivalent length (Le)
  let Le = L;
  if (Math.abs(s) > 1e-12) {
    Le = (L * (Math.exp(s) - 1)) / s;
  }

  // Panhandle A equation (SI Units)
  // Q = 4.5965×10^-3 × (Tb/Pb)^1.0788 × ((P1^2 - e^s × P2^2)/(G^0.8539 × Tf × Le × Z))^0.5394 × D^2.6182 × E
  const Q_daily = 4.5965e-3 * Math.pow(Tb_K / Pb, 1.0788) * 
                  Math.pow((Math.pow(P1, 2) - Math.exp(s) * Math.pow(P2, 2)) / 
                  (Math.pow(G, 0.8539) * Tf_K * Le * Z), 0.5394) * 
                  Math.pow(D, 2.6182) * E;

  // Convert from m³/day to m³/s
  const Q = Q_daily / (24 * 60 * 60);

  return Q;
}

function panhandleB({ E, Tb, Pb, P1, P2, G, Tf, L, D, Z, H1, H2 }) {
  // Convert temperatures from °C to K
  const Tb_K = Tb + 273.15;
  const Tf_K = Tf + 273.15;

  // Elevation adjustment parameter
  const s = 0.0684 * G * ((H2 - H1) / (Tf_K * Z));

  // Equivalent length (Le)
  let Le = L;
  if (Math.abs(s) > 1e-12) {
    Le = (L * (Math.exp(s) - 1)) / s;
  }

  // Panhandle B equation (SI Units)
  // Q = 1.002×10^-2 × (Tb/Pb)^1.02 × ((P1^2 - e^s × P2^2)/(G^0.961 × Tf × Le × Z))^0.51 × D^2.53 × E
  const Q_daily = 1.002e-2 * Math.pow(Tb_K / Pb, 1.02) * 
                  Math.pow((Math.pow(P1, 2) - Math.exp(s) * Math.pow(P2, 2)) / 
                  (Math.pow(G, 0.961) * Tf_K * Le * Z), 0.51) * 
                  Math.pow(D, 2.53) * E;

  // Convert from m³/day to m³/s
  const Q = Q_daily / (24 * 60 * 60);

  return Q;
}

// Expose globally
window.weymouth = weymouth;
window.darcyWeisbach = darcyWeisbach;
window.panhandleA = panhandleA;
window.panhandleB = panhandleB;
