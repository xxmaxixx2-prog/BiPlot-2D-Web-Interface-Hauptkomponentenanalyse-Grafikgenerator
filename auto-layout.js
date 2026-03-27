(function () {
  const EPS = 1e-10;

  function normalizeAngle(angle) {
    const value = Number(angle);
    if (!Number.isFinite(value)) return 0;
    return ((Math.round(value) % 360) + 360) % 360;
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function sampleStd(values) {
    if (values.length < 2) return 0;
    const avg = mean(values);
    const variance =
      values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
      (values.length - 1);
    return Math.sqrt(variance);
  }

  function identityMatrix(size) {
    return Array.from({ length: size }, (_, rowIndex) =>
      Array.from({ length: size }, (_, colIndex) => (rowIndex === colIndex ? 1 : 0))
    );
  }

  function buildCriterionVectors(state) {
    const criteriaCount = Array.isArray(state.criteria) ? state.criteria.length : 0;
    const objects = Array.isArray(state.objects) ? state.objects : [];

    if (criteriaCount < 2) {
      throw new Error("Für die Auto-Anordnung werden mindestens 2 Kriterien benötigt.");
    }

    if (objects.length < 2) {
      throw new Error("Für die Auto-Anordnung werden mindestens 2 Objekte benötigt.");
    }

    const vectors = Array.from({ length: criteriaCount }, () => []);

    objects.forEach((obj) => {
      for (let i = 0; i < criteriaCount; i += 1) {
        const rawValue = Array.isArray(obj.values) ? obj.values[i] : 3;
        const numericValue = Number.isFinite(Number(rawValue)) ? Number(rawValue) : 3;
        vectors[i].push(numericValue);
      }
    });

    return vectors;
  }

  function standardizeVectors(vectors) {
    return vectors.map((vector) => {
      const std = sampleStd(vector);
      const avg = mean(vector);

      if (std < EPS) {
        return {
          values: vector.map(() => 0),
          informative: false
        };
      }

      return {
        values: vector.map((value) => (value - avg) / std),
        informative: true
      };
    });
  }

  function dot(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i += 1) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  function buildCorrelationMatrix(standardizedVectors) {
    const count = standardizedVectors.length;
    const observations = standardizedVectors[0]?.values?.length ?? 0;

    return Array.from({ length: count }, (_, rowIndex) =>
      Array.from({ length: count }, (_, colIndex) => {
        const left = standardizedVectors[rowIndex];
        const right = standardizedVectors[colIndex];

        if (!left.informative || !right.informative || observations < 2) {
          return rowIndex === colIndex && left.informative ? 1 : 0;
        }

        if (rowIndex === colIndex) return 1;

        const correlation = dot(left.values, right.values) / (observations - 1);
        return Math.max(-1, Math.min(1, correlation));
      })
    );
  }

  function jacobiEigenDecomposition(inputMatrix, maxIterations = 120) {
    const size = inputMatrix.length;
    const matrix = inputMatrix.map((row) => row.slice());
    const eigenvectors = identityMatrix(size);

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      let p = 0;
      let q = 1;
      let maxOffDiagonal = 0;

      for (let row = 0; row < size; row += 1) {
        for (let col = row + 1; col < size; col += 1) {
          const value = Math.abs(matrix[row][col]);
          if (value > maxOffDiagonal) {
            maxOffDiagonal = value;
            p = row;
            q = col;
          }
        }
      }

      if (maxOffDiagonal < EPS) break;

      const app = matrix[p][p];
      const aqq = matrix[q][q];
      const apq = matrix[p][q];

      if (Math.abs(apq) < EPS) continue;

      const tau = (aqq - app) / (2 * apq);
      const t =
        Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      const c = 1 / Math.sqrt(1 + t * t);
      const s = t * c;

      matrix[p][p] = app - t * apq;
      matrix[q][q] = aqq + t * apq;
      matrix[p][q] = 0;
      matrix[q][p] = 0;

      for (let k = 0; k < size; k += 1) {
        if (k !== p && k !== q) {
          const mkp = matrix[k][p];
          const mkq = matrix[k][q];

          matrix[k][p] = mkp * c - mkq * s;
          matrix[p][k] = matrix[k][p];

          matrix[k][q] = mkp * s + mkq * c;
          matrix[q][k] = matrix[k][q];
        }
      }

      for (let k = 0; k < size; k += 1) {
        const vkp = eigenvectors[k][p];
        const vkq = eigenvectors[k][q];

        eigenvectors[k][p] = vkp * c - vkq * s;
        eigenvectors[k][q] = vkp * s + vkq * c;
      }
    }

    return {
      eigenvalues: matrix.map((row, index) => row[index]),
      eigenvectors
    };
  }

  function fallbackAngles(count, currentAngles) {
    const step = 360 / count;
    const start = Number.isFinite(Number(currentAngles?.[0])) ? Number(currentAngles[0]) : 0;

    return Array.from({ length: count }, (_, index) =>
      normalizeAngle(start + index * step)
    );
  }

  function buildCoordinatesFromCorrelation(correlationMatrix) {
    const decomposition = jacobiEigenDecomposition(correlationMatrix);
    const pairs = decomposition.eigenvalues
      .map((value, index) => ({
        value,
        vector: decomposition.eigenvectors.map((row) => row[index])
      }))
      .sort((a, b) => b.value - a.value);

    const positiveEigenvalues = pairs
      .map((pair) => Math.max(0, pair.value));

    const totalPositive = positiveEigenvalues.reduce((sum, value) => sum + value, 0) || 1;

    const explainedVariance = positiveEigenvalues.map((value) => value / totalPositive);

    const first = pairs[0];
    const second = pairs[1];

    if (!first || !second || first.value < EPS) {
      return {
        coordinates: null,
        explainedVariance
      };
    }

    const lambda1 = Math.max(0, first.value);
    const lambda2 = Math.max(0, second?.value ?? 0);

    const coordinates = first.vector.map((_, index) => ({
      x: first.vector[index] * Math.sqrt(lambda1),
      y: second ? second.vector[index] * Math.sqrt(lambda2) : 0
    }));

    const hasSignal = coordinates.some((point) => Math.hypot(point.x, point.y) > EPS);

    return {
      coordinates: hasSignal ? coordinates : null,
      explainedVariance
    };
  }

  function rotateAnglesToReference(rawAngles, coordinates, currentAngles) {
    if (!Array.isArray(rawAngles) || !rawAngles.length) return rawAngles;

    let anchorIndex = 0;
    let strongestLength = -1;

    coordinates.forEach((point, index) => {
      const length = Math.hypot(point.x, point.y);
      if (length > strongestLength) {
        strongestLength = length;
        anchorIndex = index;
      }
    });

    const referenceAngle = Number(currentAngles?.[anchorIndex]);
    if (!Number.isFinite(referenceAngle)) return rawAngles;

    const offset = referenceAngle - rawAngles[anchorIndex];
    return rawAngles.map((angle) => normalizeAngle(angle + offset));
  }

  function collectRedundantPairs(correlationMatrix, criteria, threshold = 0.85) {
    const pairs = [];

    for (let i = 0; i < correlationMatrix.length; i += 1) {
      for (let j = i + 1; j < correlationMatrix.length; j += 1) {
        const corr = correlationMatrix[i][j];

        if (Math.abs(corr) >= threshold) {
          pairs.push({
            leftIndex: i,
            rightIndex: j,
            labelA: criteria[i]?.left || `Kriterium ${i + 1}`,
            labelB: criteria[j]?.left || `Kriterium ${j + 1}`,
            corr,
            relation: corr >= 0 ? "ähnlich" : "gegensätzlich"
          });
        }
      }
    }

    return pairs.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
  }

  function analyze(state) {
    const vectors = buildCriterionVectors(state);
    const standardized = standardizeVectors(vectors);
    const correlationMatrix = buildCorrelationMatrix(standardized);
    const currentAngles = Array.isArray(state.criteria)
      ? state.criteria.map((criterion) => Number(criterion.angle))
      : [];

    const redundancy = collectRedundantPairs(correlationMatrix, state.criteria);
    const layout = buildCoordinatesFromCorrelation(correlationMatrix);

    let angles;

    if (!layout.coordinates) {
      angles = fallbackAngles(vectors.length, currentAngles);
    } else {
      const rawAngles = layout.coordinates.map((point) =>
        normalizeAngle((Math.atan2(point.y, point.x) * 180) / Math.PI)
      );
      angles = rotateAnglesToReference(rawAngles, layout.coordinates, currentAngles);
    }

    return {
      angles,
      correlationMatrix,
      redundantPairs: redundancy,
      explainedVariance: layout.explainedVariance.slice(0, 2),
      usedFallback: !layout.coordinates
    };
  }

  window.BiPlotteRAutoLayout = {
    analyze
  };
})();