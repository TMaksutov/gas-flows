/******************************************************
 * Weymouth Equation Calculator (SI Units)
 *   Q  = Volume flow rate, standard m³/s
 *   E  = Pipeline efficiency, a value less than 1
 *   Tb = Base temperature, °C (converted to K in function)
 *   Pb = Base pressure, kPa
 *   P1 = Upstream pressure, kPa
 *   P2 = Downstream pressure, kPa
 *   G  = Gas gravity (air = 1)
 *   Tf = Gas flow temperature at average condition, °C (converted to K)
 *   Le = Equivalent length of pipe segment, km
 *   L  = Length of pipe segment, km
 *   Z  = Gas compressibility factor, dimensionless
 *   D  = Pipe inside diameter, mm
 *   s  = Elevation adjustment parameter, dimensionless
 *   H1 = Upstream elevation, m
 *   H2 = Downstream elevation, m
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

// Expose globally
window.weymouth = weymouth;
