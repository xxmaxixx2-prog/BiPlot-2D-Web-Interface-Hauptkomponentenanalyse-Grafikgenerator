/* exact-biplot.js
   Exakter PCA-Biplot aus der Rohmatrix
   Ziel: R-prcomp-ähnliche Berechnung mit center=TRUE, scale.=TRUE
*/

(function () {
  "use strict";

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function sampleSd(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    const s = arr.reduce((acc, v) => acc + Math.pow(v - m, 2), 0);
    return Math.sqrt(s / (arr.length - 1));
  }

  function transpose(mat) {
    return mat[0].map((_, col) => mat.map(row => row[col]));
  }

  function multiplyMatrix(A, B) {
    const rowsA = A.length;
    const colsA = A[0].length;
    const rowsB = B.length;
    const colsB = B[0].length;

    if (colsA !== rowsB) {
      throw new Error("Matrixdimensionen passen nicht für Multiplikation.");
    }

    const out = Array.from({ length: rowsA }, () => Array(colsB).fill(0));

    for (let i = 0; i < rowsA; i++) {
      for (let k = 0; k < colsA; k++) {
        const aik = A[i][k];
        for (let j = 0; j < colsB; j++) {
          out[i][j] += aik * B[k][j];
        }
      }
    }

    return out;
  }

  function multiplyMatrixVector(A, v) {
    return A.map(row => row.reduce((sum, val, i) => sum + val * v[i], 0));
  }

  function identityMatrix(n) {
    const I = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) I[i][i] = 1;
    return I;
  }

  function copyMatrix(A) {
    return A.map(row => row.slice());
  }

  // Symmetrische Jacobi-Eigenzerlegung
  function jacobiEigenSymmetric(A, maxIter = 100, eps = 1e-12) {
    const n = A.length;
    let D = copyMatrix(A);
    let V = identityMatrix(n);

    function maxOffDiag(mat) {
      let p = 0, q = 1;
      let maxVal = Math.abs(mat[p][q]);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const val = Math.abs(mat[i][j]);
          if (val > maxVal) {
            maxVal = val;
            p = i;
            q = j;
          }
        }
      }
      return { p, q, maxVal };
    }

    for (let iter = 0; iter < maxIter; iter++) {
      const { p, q, maxVal } = maxOffDiag(D);
      if (maxVal < eps) break;

      const app = D[p][p];
      const aqq = D[q][q];
      const apq = D[p][q];

      const tau = (aqq - app) / (2 * apq);
      const t = tau >= 0
        ? 1 / (tau + Math.sqrt(1 + tau * tau))
        : -1 / (-tau + Math.sqrt(1 + tau * tau));
      const c = 1 / Math.sqrt(1 + t * t);
      const s = t * c;

      for (let i = 0; i < n; i++) {
        if (i !== p && i !== q) {
          const dip = D[i][p];
          const diq = D[i][q];
          D[i][p] = c * dip - s * diq;
          D[p][i] = D[i][p];
          D[i][q] = c * diq + s * dip;
          D[q][i] = D[i][q];
        }
      }

      const newApp = c * c * app - 2 * s * c * apq + s * s * aqq;
      const newAqq = s * s * app + 2 * s * c * apq + c * c * aqq;
      D[p][p] = newApp;
      D[q][q] = newAqq;
      D[p][q] = 0;
      D[q][p] = 0;

      for (let i = 0; i < n; i++) {
        const vip = V[i][p];
        const viq = V[i][q];
        V[i][p] = c * vip - s * viq;
        V[i][q] = s * vip + c * viq;
      }
    }

    const eigenvalues = [];
    for (let i = 0; i < n; i++) eigenvalues.push(D[i][i]);

    // sort desc
    const order = eigenvalues
      .map((val, idx) => ({ val, idx }))
      .sort((a, b) => b.val - a.val);

    const values = order.map(o => o.val);
    const vectors = Array.from({ length: n }, () => Array(n).fill(0));

    for (let col = 0; col < n; col++) {
      const srcCol = order[col].idx;
      for (let row = 0; row < n; row++) {
        vectors[row][col] = V[row][srcCol];
      }
    }

    // deterministische Vorzeichenregel:
    // größter absoluter Wert pro Komponente soll positiv sein
    for (let col = 0; col < n; col++) {
      let maxAbs = -1;
      let maxRow = 0;
      for (let row = 0; row < n; row++) {
        const av = Math.abs(vectors[row][col]);
        if (av > maxAbs) {
          maxAbs = av;
          maxRow = row;
        }
      }
      if (vectors[maxRow][col] < 0) {
        for (let row = 0; row < n; row++) {
          vectors[row][col] *= -1;
        }
      }
    }

    return { values, vectors };
  }

  function getCentralMatrix(state) {
    // Unterstützt 2 typische Formen:
    // A) state.objects = [{ name, values: [...] }]
    // B) state.matrix = { objects:[...], criteria:[...], values:[[...]] }

    if (state.matrix && Array.isArray(state.matrix.values)) {
      return {
        objectNames: state.matrix.objects ? state.matrix.objects.slice() : [],
        criterionNames: state.matrix.criteria ? state.matrix.criteria.slice() : [],
        raw: deepClone(state.matrix.values)
      };
    }

    if (Array.isArray(state.objects) && state.objects.length > 0) {
      const first = state.objects[0];
      if (Array.isArray(first.values)) {
        return {
          objectNames: state.objects.map(o => o.name || o.label || "Objekt"),
          criterionNames: (state.criteria || []).map(c => {
            const left = c.left || "";
            const right = c.right || "";
            return `${left} ↔ ${right}`;
          }),
          raw: state.objects.map(o => o.values.map(v => Number(v)))
        };
      }
    }

    throw new Error("Keine zentrale Matrix gefunden.");
  }

  function standardizeColumns(raw) {
    const n = raw.length;
    const p = raw[0].length;
    const cols = transpose(raw);

    const centers = cols.map(col => mean(col));
    const scales = cols.map(col => sampleSd(col));

    if (scales.some(s => !isFinite(s) || s === 0)) {
      throw new Error("Mindestens ein Kriterium hat SD=0. Exakte PCA ist damit nicht möglich.");
    }

    const Z = Array.from({ length: n }, () => Array(p).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < p; j++) {
        Z[i][j] = (raw[i][j] - centers[j]) / scales[j];
      }
    }

    return { Z, centers, scales };
  }

  function correlationMatrixFromZ(Z) {
    const n = Z.length;
    const ZT = transpose(Z);
    const R = multiplyMatrix(ZT, Z);
    for (let i = 0; i < R.length; i++) {
      for (let j = 0; j < R[0].length; j++) {
        R[i][j] /= (n - 1);
      }
    }
    return R;
  }

  function computePca(raw) {
    const { Z, centers, scales } = standardizeColumns(raw);
    const R = correlationMatrixFromZ(Z);
    const { values: eigenvalues, vectors: rotation } = jacobiEigenSymmetric(R);

    const clippedEigenvalues = eigenvalues.map(v => Math.max(0, v));
    const sdev = clippedEigenvalues.map(v => Math.sqrt(v));

    // Scores = Z %*% rotation  -> wie prcomp$x
    const scores = multiplyMatrix(Z, rotation);

    const totalVar = clippedEigenvalues.reduce((a, b) => a + b, 0);
    const explained = clippedEigenvalues.map(v => totalVar > 0 ? v / totalVar : 0);

    return {
      raw,
      Z,
      R,
      centers,
      scales,
      eigenvalues: clippedEigenvalues,
      sdev,
      rotation,   // loadings
      scores,     // object coordinates
      explained
    };
  }

  function makeBiplotCoordinates(pca, choices = [0, 1], scale = 1) {
    // analog zur R-Biplot-Logik:
    // Variablen ~ lambda^scale
    // Beobachtungen ~ lambda^(1-scale)
    // default strict biplot: scale=1
    const c1 = choices[0];
    const c2 = choices[1];
    const lambda = [pca.sdev[c1], pca.sdev[c2]];

    const obs = pca.scores.map(row => [
      row[c1] / Math.pow(lambda[0] || 1, scale),
      row[c2] / Math.pow(lambda[1] || 1, scale)
    ]);

    const vars = pca.rotation.map(row => [
      row[c1] * Math.pow(lambda[0] || 1, 1 - scale),
      row[c2] * Math.pow(lambda[1] || 1, 1 - scale)
    ]);

    return {
      objectCoords: obs,
      criterionCoords: vars
    };
  }

  function computeDescriptiveStats(raw, criterionNames) {
    const cols = transpose(raw);
    return cols.map((col, idx) => {
      const m = mean(col);
      const sd = sampleSd(col);
      const min = Math.min(...col);
      const max = Math.max(...col);
      const rms = Math.sqrt(col.reduce((a, b) => a + b * b, 0) / col.length);

      return {
        criterion: criterionNames[idx] || `Kriterium ${idx + 1}`,
        mean: m,
        sd,
        min,
        max,
        rms
      };
    });
  }

  function computeExactBiplotFromState(state, options = {}) {
    const central = getCentralMatrix(state);
    const pca = computePca(central.raw);
    const biplot = makeBiplotCoordinates(
      pca,
      options.choices || [0, 1],
      options.scale ?? 1
    );

    const descriptiveStats = computeDescriptiveStats(
      central.raw,
      central.criterionNames
    );

    return {
      matrix: central,
      pca,
      biplot,
      descriptiveStats
    };
  }

  function applyExactBiplotToState(state, result) {
    state.exactBiplot = result;
    state.plotMode = "exact";
    return state;
  }

  function clearExactBiplotMode(state) {
    state.plotMode = "manual";
  }

  window.ExactBiplot = {
    computeExactBiplotFromState,
    applyExactBiplotToState,
    clearExactBiplotMode
  };
})();