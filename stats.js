// Statistical computations for the BiPlot application.
//
// The `Stats` module provides pure functions for computing
// descriptive statistics, correlation matrices and principal
// component analyses.  All functions accept the current `state` as
// an argument rather than capturing it from the global scope.  This
// makes the logic easy to test and decouples data from
// computation.

(function () {
  const Stats = {};

  /**
   * Extract a list of criterion name objects from the state.  Each
   * entry contains both the zero‑based index and a label string of
   * the form "left ↔ right".
   *
   * @param {object} state
   * @returns {Array<{index:number,label:string}>}
   */
  Stats.getCriterionNames = function getCriterionNames(state) {
    return state.criteria.map((criterion, index) => ({
      index,
      label: `${criterion.left} ↔ ${criterion.right}`
    }));
  };

  /**
   * Produce a raw data matrix from the state's objects.  Each row
   * represents an object and each column corresponds to one
   * criterion.  Missing values are defaulted to 3.
   *
   * @param {object} state
   * @returns {number[][]}
   */
  Stats.getDataMatrix = function getDataMatrix(state) {
    return state.objects.map((obj) =>
      state.criteria.map((_, index) => {
        const value = obj.values?.[index] ?? 3;
        return Number(value);
      })
    );
  };

  /**
   * Compute the arithmetic mean of an array.  Returns 0 for
   * empty arrays.
   *
   * @param {number[]} arr
   * @returns {number}
   */
  Stats.mean = function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((sum, value) => sum + value, 0) / arr.length;
  };

  /**
   * Minimum value of an array.  Returns 0 for empty arrays.
   *
   * @param {number[]} arr
   * @returns {number}
   */
  Stats.minValue = function minValue(arr) {
    if (!arr.length) return 0;
    return Math.min(...arr);
  };

  /**
   * Maximum value of an array.  Returns 0 for empty arrays.
   *
   * @param {number[]} arr
   * @returns {number}
   */
  Stats.maxValue = function maxValue(arr) {
    if (!arr.length) return 0;
    return Math.max(...arr);
  };

  /**
   * Sample standard deviation of an array.  Returns 0 for arrays
   * shorter than 2.  Uses the sample (n-1) denominator.
   *
   * @param {number[]} arr
   * @returns {number}
   */
  Stats.sampleSD = function sampleSD(arr) {
    if (arr.length < 2) return 0;
    const avg = Stats.mean(arr);
    const variance = arr.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(variance);
  };

  /**
   * Root mean square of an array.
   *
   * @param {number[]} arr
   * @returns {number}
   */
  Stats.rms = function rms(arr) {
    if (!arr.length) return 0;
    return Math.sqrt(arr.reduce((sum, value) => sum + value * value, 0) / arr.length);
  };

  /**
   * Round a numeric value to a given number of decimal places.
   * Uses native toFixed rounding and then coerces back to a number.
   *
   * @param {number} value
   * @param {number} digits
   * @returns {number}
   */
  Stats.roundStat = function roundStat(value, digits = 4) {
    return Number(value.toFixed(digits));
  };

  /**
   * Extract a single column from a 2D matrix.
   *
   * @param {number[][]} matrix
   * @param {number} colIndex
   * @returns {number[]}
   */
  Stats.getColumn = function getColumn(matrix, colIndex) {
    return matrix.map((row) => row[colIndex]);
  };

  /**
   * Compute descriptive statistics (mean, standard deviation, min,
   * max and RMS) for each criterion.  Returns an array of row
   * objects suitable for rendering in a table.
   *
   * @param {object} state
   * @returns {Array<{criterion:string,mean:number,sd:number,min:number,max:number,rms:number}>}
   */
  Stats.computeDescriptiveStats = function computeDescriptiveStats(state) {
    const matrix = Stats.getDataMatrix(state);
    const names = Stats.getCriterionNames(state);
    return names.map((criterion, index) => {
      const column = Stats.getColumn(matrix, index);
      return {
        criterion: criterion.label,
        mean: Stats.roundStat(Stats.mean(column)),
        sd: Stats.roundStat(Stats.sampleSD(column)),
        min: Stats.roundStat(Stats.minValue(column)),
        max: Stats.roundStat(Stats.maxValue(column)),
        rms: Stats.roundStat(Stats.rms(column))
      };
    });
  };

  /**
   * Compute a Pearson correlation coefficient for two arrays.  If the
   * arrays differ in length or have fewer than two values, 0 is
   * returned.  This function does not round the result.
   *
   * @param {number[]} x
   * @param {number[]} y
   * @returns {number}
   */
  Stats.pearsonCorrelation = function pearsonCorrelation(x, y) {
    if (x.length !== y.length || x.length < 2) return 0;
    const mx = Stats.mean(x);
    const my = Stats.mean(y);
    let numerator = 0;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < x.length; i += 1) {
      const dx = x[i] - mx;
      const dy = y[i] - my;
      numerator += dx * dy;
      sx += dx * dx;
      sy += dy * dy;
    }
    const denominator = Math.sqrt(sx * sy);
    if (denominator === 0) return 0;
    return numerator / denominator;
  };

  /**
   * Compute a full correlation matrix for the criteria.  Each entry
   * is rounded to four decimal places.  The result is an array of
   * objects with a criterion label and an inner object of
   * correlations keyed by criterion label.
   *
   * @param {object} state
   * @returns {Array<{criterion:string,correlations:object}>}
   */
  Stats.computeCorrelationMatrix = function computeCorrelationMatrix(state) {
    const matrix = Stats.getDataMatrix(state);
    const names = Stats.getCriterionNames(state);
    return names.map((rowCriterion, rowIndex) => {
      const row = {};
      names.forEach((colCriterion, colIndex) => {
        const xi = Stats.getColumn(matrix, rowIndex);
        const yj = Stats.getColumn(matrix, colIndex);
        row[colCriterion.label] = Stats.roundStat(Stats.pearsonCorrelation(xi, yj));
      });
      return {
        criterion: rowCriterion.label,
        correlations: row
      };
    });
  };

  /**
   * Standardize a data matrix by subtracting the column means and
   * dividing by the column sample standard deviations.  Returns the
   * standardized matrix along with the original column means and
   * standard deviations.
   *
   * @param {number[][]} matrix
   * @returns {{standardized:number[][],means:number[],sds:number[]}}
   */
  Stats.standardizeMatrix = function standardizeMatrix(matrix) {
    if (!matrix.length) return { standardized: [], means: [], sds: [] };
    const cols = matrix[0].length;
    const means = [];
    const sds = [];
    for (let columnIndex = 0; columnIndex < cols; columnIndex += 1) {
      const column = Stats.getColumn(matrix, columnIndex);
      means.push(Stats.mean(column));
      const sd = Stats.sampleSD(column);
      sds.push(sd);
    }
    const standardized = matrix.map((row) =>
      row.map((value, j) => {
        const sd = sds[j];
        if (!Number.isFinite(sd) || sd === 0) return 0;
        return (value - means[j]) / sd;
      })
    );
    return { standardized, means, sds };
  };

  /**
   * Transpose a matrix.
   *
   * @param {number[][]} matrix
   * @returns {number[][]}
   */
  Stats.transpose = function transpose(matrix) {
    if (!matrix.length) return [];
    return matrix[0].map((_, colIndex) => matrix.map((row) => row[colIndex]));
  };

  /**
   * Multiply two matrices using a triple nested loop.  Throws an
   * error if dimensions do not align.
   *
   * @param {number[][]} a
   * @param {number[][]} b
   * @returns {number[][]}
   */
  Stats.multiplyMatrices = function multiplyMatrices(a, b) {
    const rowsA = a.length;
    const colsA = a[0].length;
    const rowsB = b.length;
    const colsB = b[0].length;
    if (colsA !== rowsB) {
      throw new Error('Matrixdimensionen passen nicht zusammen.');
    }
    const result = Array.from({ length: rowsA }, () => Array(colsB).fill(0));
    for (let i = 0; i < rowsA; i += 1) {
      for (let k = 0; k < colsA; k += 1) {
        const aik = a[i][k];
        for (let j = 0; j < colsB; j += 1) {
          result[i][j] += aik * b[k][j];
        }
      }
    }
    return result;
  };

  /**
   * Create an identity matrix of size n.
   *
   * @param {number} n
   * @returns {number[][]}
   */
  Stats.identityMatrix = function identityMatrix(n) {
    const result = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i += 1) {
      result[i][i] = 1;
    }
    return result;
  };

  /**
   * Deep copy a matrix.
   *
   * @param {number[][]} matrix
   * @returns {number[][]}
   */
  Stats.copyMatrix = function copyMatrix(matrix) {
    return matrix.map((row) => row.slice());
  };

  /**
   * Compute a correlation matrix directly from standardized scores.
   * Useful for PCA on standardized data.
   *
   * @param {number[][]} standardized
   * @returns {number[][]}
   */
  Stats.correlationMatrixFromStandardized = function correlationMatrixFromStandardized(standardized) {
    const n = standardized.length;
    if (n < 2) return [];
    const zt = Stats.transpose(standardized);
    const product = Stats.multiplyMatrices(zt, standardized);
    return product.map((row) => row.map((value) => value / (n - 1)));
  };

  /**
   * Jacobi eigenvalue algorithm for symmetric matrices.  Returns
   * eigenvalues and orthonormal eigenvectors sorted in descending
   * order of the eigenvalues.  This implementation is adapted from
   * the original script.
   *
   * @param {number[][]} matrix
   * @param {number} maxIter
   * @param {number} eps
   * @returns {{values:number[],vectors:number[][]}}
   */
  Stats.jacobiEigenSymmetric = function jacobiEigenSymmetric(matrix, maxIter = 200, eps = 1e-12) {
    const n = matrix.length;
    const A = Stats.copyMatrix(matrix);
    const V = Stats.identityMatrix(n);
    function maxOffDiagonal(mat) {
      let p = 0;
      let q = 1;
      let maxVal = Math.abs(mat[p][q] ?? 0);
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
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
    if (n === 1) {
      return { values: [A[0][0]], vectors: [[1]] };
    }
    for (let iter = 0; iter < maxIter; iter += 1) {
      const { p, q, maxVal } = maxOffDiagonal(A);
      if (maxVal < eps) break;
      const app = A[p][p];
      const aqq = A[q][q];
      const apq = A[p][q];
      if (Math.abs(apq) < eps) continue;
      const tau = (aqq - app) / (2 * apq);
      const t =
        tau >= 0
          ? 1 / (tau + Math.sqrt(1 + tau * tau))
          : -1 / (-tau + Math.sqrt(1 + tau * tau));
      const c = 1 / Math.sqrt(1 + t * t);
      const s = t * c;
      for (let i = 0; i < n; i += 1) {
        if (i !== p && i !== q) {
          const aip = A[i][p];
          const aiq = A[i][q];
          A[i][p] = c * aip - s * aiq;
          A[p][i] = A[i][p];
          A[i][q] = c * aiq + s * aip;
          A[q][i] = A[i][q];
        }
      }
      A[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
      A[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
      A[p][q] = 0;
      A[q][p] = 0;
      for (let i = 0; i < n; i += 1) {
        const vip = V[i][p];
        const viq = V[i][q];
        V[i][p] = c * vip - s * viq;
        V[i][q] = s * vip + c * viq;
      }
    }
    const eigenvalues = [];
    for (let i = 0; i < n; i += 1) {
      eigenvalues.push(A[i][i]);
    }
    const order = eigenvalues
      .map((value, index) => ({ value, index }))
      .sort((a, b) => b.value - a.value);
    const values = order.map((item) => item.value);
    const vectors = Array.from({ length: n }, () => Array(n).fill(0));
    for (let col = 0; col < n; col += 1) {
      const srcCol = order[col].index;
      for (let row = 0; row < n; row += 1) {
        vectors[row][col] = V[row][srcCol];
      }
    }
    // Ensure a deterministic sign by flipping any eigenvector whose
    // largest component is negative.
    for (let col = 0; col < n; col += 1) {
      let maxAbs = -1;
      let maxRow = 0;
      for (let row = 0; row < n; row += 1) {
        const absVal = Math.abs(vectors[row][col]);
        if (absVal > maxAbs) {
          maxAbs = absVal;
          maxRow = row;
        }
      }
      if (vectors[maxRow][col] < 0) {
        for (let row = 0; row < n; row += 1) {
          vectors[row][col] *= -1;
        }
      }
    }
    return { values, vectors };
  };

  /**
   * Perform a principal component analysis on the current state.
   * Returns a comprehensive result object including standardized
   * scores, eigenvalues, eigenvectors, explained variance and raw
   * object/criterion coordinates.  This method mirrors the logic
   * found in the original monolithic script.
   *
   * @param {object} state
   * @returns {{standardized:number[][],means:number[],sds:number[],correlationMatrix:number[][],eigenvalues:number[],sdev:number[],rotation:number[][],objectScoresRaw:number[][],objectScores:Array<{name:string,pc1:number,pc2:number}>,variableLoadings:Array<{criterion:string,pc1:number,pc2:number}>,explainedVariance:number[],exactBiplot:{objectCoords:Array<{name:string,x:number,y:number}>,criterionCoords:Array<{criterion:string,left:string,right:string,x:number,y:number}>}}}
   */
  Stats.computeExactPCA = function computeExactPCA(state) {
    const raw = Stats.getDataMatrix(state);
    if (!raw.length || !(raw[0] && raw[0].length)) {
      return {
        standardized: [],
        means: [],
        sds: [],
        correlationMatrix: [],
        eigenvalues: [],
        sdev: [],
        rotation: [],
        objectScoresRaw: [],
        objectScores: [],
        variableLoadings: [],
        explainedVariance: [],
        exactBiplot: {
          objectCoords: [],
          criterionCoords: []
        }
      };
    }
    const { standardized, means, sds } = Stats.standardizeMatrix(raw);
    const correlationMatrix = Stats.correlationMatrixFromStandardized(standardized);
    if (!correlationMatrix.length) {
      return {
        standardized,
        means,
        sds,
        correlationMatrix: [],
        eigenvalues: [],
        sdev: [],
        rotation: [],
        objectScoresRaw: [],
        objectScores: [],
        variableLoadings: [],
        explainedVariance: [],
        exactBiplot: {
          objectCoords: [],
          criterionCoords: []
        }
      };
    }
    const { values, vectors } = Stats.jacobiEigenSymmetric(correlationMatrix);
    const eigenvalues = values.map((value) => Math.max(0, value));
    const sdev = eigenvalues.map((value) => Math.sqrt(value));
    const totalVariance = eigenvalues.reduce((sum, value) => sum + value, 0) || 1;
    const scoresMatrix = Stats.multiplyMatrices(standardized, vectors);
    const objectScores = state.objects.map((obj, index) => ({
      name: obj.name,
      pc1: Stats.roundStat(scoresMatrix[index]?.[0] ?? 0),
      pc2: Stats.roundStat(scoresMatrix[index]?.[1] ?? 0)
    }));
    const variableLoadings = state.criteria.map((criterion, index) => ({
      criterion: `${criterion.left} ↔ ${criterion.right}`,
      pc1: Stats.roundStat(vectors[index]?.[0] ?? 0),
      pc2: Stats.roundStat(vectors[index]?.[1] ?? 0)
    }));
    const scaleMode = 1;
    const lambda1 = sdev[0] || 1;
    const lambda2 = sdev[1] || 1;
    const exactObjectCoords = state.objects.map((obj, index) => ({
      name: obj.name,
      x: (scoresMatrix[index]?.[0] ?? 0) / Math.pow(lambda1, scaleMode),
      y: (scoresMatrix[index]?.[1] ?? 0) / Math.pow(lambda2, scaleMode)
    }));
    const exactCriterionCoords = state.criteria.map((criterion, index) => ({
      criterion: `${criterion.left} ↔ ${criterion.right}`,
      left: criterion.left,
      right: criterion.right,
      x: (vectors[index]?.[0] ?? 0) * Math.pow(lambda1, 1 - scaleMode),
      y: (vectors[index]?.[1] ?? 0) * Math.pow(lambda2, 1 - scaleMode)
    }));
    return {
      standardized,
      means,
      sds,
      correlationMatrix,
      eigenvalues: eigenvalues.map((value) => Stats.roundStat(value)),
      sdev: sdev.map((value) => Stats.roundStat(value)),
      rotation: vectors,
      objectScoresRaw: scoresMatrix,
      objectScores,
      variableLoadings,
      explainedVariance: eigenvalues.map((value) => Stats.roundStat((value / totalVariance) * 100)),
      exactBiplot: {
        objectCoords: exactObjectCoords,
        criterionCoords: exactCriterionCoords
      }
    };
  };

  /**
   * Compute all analysis results (descriptive stats, correlations
   * and PCA) for the current state.  This function is handy when
   * rendering the analysis section or computing the exact biplot.
   *
   * @param {object} state
   * @returns {{descriptiveStats:object[],correlations:object[],pca:object}}
   */
  Stats.computeAnalysisResults = function computeAnalysisResults(state) {
    return {
      descriptiveStats: Stats.computeDescriptiveStats(state),
      correlations: Stats.computeCorrelationMatrix(state),
      pca: Stats.computeExactPCA(state)
    };
  };

  // Expose the Stats object globally.
  window.Stats = Stats;
})();