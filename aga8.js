// aga8.js – Corrected AGA8‑92DC compressibility‑factor implementation
// Implements the ISO 12213‑2 Annex F reference algorithm in plain ES2020.
// All coefficient/parameter arrays are imported from constants.js (same file as before).
// Major fix: the "DR·CNS/T^U" subtraction for terms 13‑18 (Fortran) was missing – now restored.
// -----------------------------------------------------------------------------

/* global A, B, C, K, G, Q, F, S, W, U, MW, EI, KI, GI, QI, FI, SI, WI, EIJ, UIJ, KIJ, GIJ */

const RGAS = 8.314462618e-3;                  // MJ·kmol⁻¹·K⁻¹ (ISO 6976)

// ─────────────────────────── utility helpers ────────────────────────────────
const pow = Math.pow;
const exp = Math.exp;

// Map the user 21‑component vector xj[0‥20] to the ISO/Fortran XI ordering
function mapXJtoXI (xj) {
  const XI = Array(21).fill(0);
  XI[0]  = xj[0];   XI[3]  = xj[1];  XI[4]  = xj[2];
  XI[10] = xj[3];   XI[11] = xj[4];  XI[12] = xj[5];
  XI[13] = xj[6];   XI[14] = xj[7];  XI[15] = xj[8];
  XI[16] = xj[9];   XI[17] = xj[10]; XI[18] = xj[11];
  XI[2]  = xj[12];  XI[1]  = xj[13]; XI[6]  = xj[14];
  XI[19] = xj[15];  XI[5]  = xj[16]; XI[9]  = xj[17];
  XI[20] = xj[18];  XI[7]  = xj[19]; XI[8]  = xj[20];
  return XI;
}

// ─────────────────── Build mixture‑dependent coefficients (DCAGA) ───────────
function buildMixtureCoefficients (xj) {
  const XI = mapXJtoXI(xj);
  const N = 21;
  const sum = XI.reduce((s, v) => s + v, 0);
  for (let i = 0; i < N; i++) XI[i] /= sum;           // normalise mole fractions

  /* ——— first‑order (pure component) contributions ——— */
  let K1 = 0, U1 = 0, G1 = 0, Q1 = 0, F1 = 0, E1 = 0;
  for (let i = 0; i < N; i++) {
    K1 += XI[i] * pow(KI[i], 2.5);
    U1 += XI[i] * pow(EI[i], 2.5);
    G1 += XI[i] * GI[i];
    Q1 += XI[i] * QI[i];
    F1 += XI[i] * XI[i] * FI[i];
    E1 += XI[i] * EI[i];
  }

  /* ——— square before adding pair contributions (exact ISO algorithm) ——— */
  K1 *= K1;
  U1 *= U1;

  /* ——— pair contributions for the first 8 × 19 components ——— */
  for (let i = 0; i < 8; i++) {
    for (let j = i + 1; j < 19; j++) {
      const xij = XI[i] * XI[j];
      if (xij === 0) continue;
      K1 += 2 * xij * (pow(KIJ[i][j], 5) - 1) * pow(KI[i] * KI[j], 2.5);
      U1 += 2 * xij * (pow(UIJ[i][j], 5) - 1) * pow(EI[i] * EI[j], 2.5);
      G1 +=     xij * (GIJ[i][j] - 1) * (GI[i] + GI[j]);
    }
  }

  /* ——— convert to mixture parameters ——— */
  const Kmix = pow(K1, 0.2);
  const Umix = pow(U1, 0.2);

  /* ——— BI (second virial) coefficients, n = 1‥18 (0‥17 JS) ——— */
  const BI = Array(18).fill(0);
  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      let xij = XI[i] * XI[j];
      if (xij === 0) continue;
      if (i !== j) xij *= 2;
      const EIJ0 = EIJ[i][j] * Math.sqrt(EI[i] * EI[j]);
      const GIJ0 = GIJ[i][j] * (GI[i] + GI[j]) / 2;
      for (let n = 0; n < 18; n++) {
        const BN = pow(GIJ0 + 1 - G[n], G[n]) *
                   pow(QI[i] * QI[j] + 1 - Q[n], Q[n]) *
                   pow(Math.sqrt(FI[i] * FI[j]) + 1 - F[n], F[n]) *
                   pow(SI[i] * SI[j] + 1 - S[n], S[n]) *
                   pow(WI[i] * WI[j] + 1 - W[n], W[n]);
        BI[n] += A[n] * xij * pow(EIJ0, U[n]) * pow(KI[i] * KI[j], 1.5) * BN;
      }
    }
  }

  /* ——— composition / temperature coefficients C*(n) for n = 13‥58 (12‥57 JS) ——— */
  const CNS = Array(58).fill(0);
  for (let n = 12; n < 58; n++) {
    CNS[n] = pow(G1 + 1 - G[n], G[n]) *
             pow(Q1 * Q1 + 1 - Q[n], Q[n]) *
             pow(F1 + 1 - F[n], F[n]) *
             A[n] * pow(Umix, U[n]);
  }

  return { Kmix, CNS, BI };
}

// ───────────────────── equation of state P(Z) at given ρ —──────────────────
function pzOfDT (D, T, pars) {
  const { Kmix, CNS, BI } = pars;
  const DR = D * pow(Kmix, 3);

  // BMIX – second virial contribution (n = 1‥18)
  let BMIX = 0;
  for (let n = 0; n < 18; n++) BMIX += BI[n] / pow(T, U[n]);

  // Initial Z value
  let Z = 1 + BMIX * D;

  // Extra subtraction for n = 13‥18 (Fortran indices) — THIS WAS MISSING!
  for (let n = 12; n < 18; n++) {
    Z -= DR * CNS[n] / pow(T, U[n]);
  }

  // Main summation n = 13‥58
  for (let n = 12; n < 58; n++) {
    const DR_pow_K = pow(DR, K[n]);
    Z += (CNS[n] / pow(T, U[n])) *
         (B[n] - C[n] * K[n] * DR_pow_K) *
         pow(DR, B[n]) *
         exp(-C[n] * DR_pow_K);
  }

  return { Pcalc: D * RGAS * T * Z, Z, BMIX };
}

// ─────────────────────────── density root‑finder ────────────────────────────
function densityFromPT (P, T, pars) {
  if (P <= 0) return 0;               // ideal limit

  // Bracket the root
  let dLow = 1e-6;
  let dHigh = 40;
  let fLow = pzOfDT(dLow, T, pars).Pcalc - P;
  let fHigh = pzOfDT(dHigh, T, pars).Pcalc - P;
  while (fLow * fHigh > 0 && dHigh < 1e3) {
    dHigh *= 2;
    fHigh = pzOfDT(dHigh, T, pars).Pcalc - P;
  }
  if (fLow * fHigh > 0) throw new Error('Unable to bracket density root');

  // Bisection (50 iters, more than enough for double precision)
  for (let i = 0; i < 50; i++) {
    const dMid = 0.5 * (dLow + dHigh);
    const fMid = pzOfDT(dMid, T, pars).Pcalc - P;
    if (Math.abs(fMid) < 1e-10) return dMid;
    (fMid * fLow < 0) ? (dHigh = dMid, fHigh = fMid) : (dLow = dMid, fLow = fMid);
  }
  throw new Error('Density did not converge');
}

// ─────────────────────────── public API entry point ─────────────────────────
function compressibilityFactor (xj, T, P) {
  const pars = buildMixtureCoefficients(xj);
  const D = densityFromPT(P, T, pars);
  const { Z } = pzOfDT(D, T, pars);
  return { Z, D };
}

// Expose globally for the browser (aga8.html)
window.compressibilityFactor = compressibilityFactor;
