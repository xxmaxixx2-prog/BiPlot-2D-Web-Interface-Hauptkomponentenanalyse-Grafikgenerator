// Plotting functions for the BiPlot application.
//
// The `Plot` module encapsulates all logic related to drawing the
// manual and exact 2D biplots.  These routines depend on the
// current application `state`, the `Utils` helpers and the
// statistical computations provided by `Stats`.  The exported
// methods operate on passed DOM nodes rather than implicitly
// capturing them, which makes it straightforward to reuse the
// plotting logic in other contexts.

(function () {
  const Plot = {};

  /**
   * Compute the cartesian coordinates for a given object in the
   * manual plot.  Each criterion contributes a unit vector
   * multiplied by its weight and the object's normalized score on
   * that criterion.  The result is normalised by the sum of
   * weights.
   *
   * @param {object} obj
   * @param {object} state
   * @returns {{x:number,y:number}}
   */
  Plot.getObjectCoordinates = function getObjectCoordinates(obj, state) {
    let x = 0;
    let y = 0;
    let totalWeight = 0;
    state.criteria.forEach((criterion, index) => {
      const rawValue = obj.values[index] ?? 3;
      const normalized = (rawValue - 3.5) / 2.5;
      const vector = Utils.polarToCartesian(criterion.angle, 1);
      x += normalized * vector.x * criterion.weight;
      y += normalized * vector.y * criterion.weight;
      totalWeight += criterion.weight;
    });
    if (totalWeight === 0) return { x: 0, y: 0 };
    return {
      x: x / totalWeight,
      y: y / totalWeight
    };
  };

  /**
   * Map a value from one numeric range into another.  Used to
   * convert data coordinates into SVG coordinates for the exact
   * biplot.
   *
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @param {number} targetMin
   * @param {number} targetMax
   * @returns {number}
   */
  Plot.mapPlotValue = function mapPlotValue(value, min, max, targetMin, targetMax) {
    if (max === min) return (targetMin + targetMax) / 2;
    return targetMin + ((value - min) / (max - min)) * (targetMax - targetMin);
  };

  /**
   * Determine the plotting bounds for an exact biplot given the
   * object and criterion coordinates.  A small padding is added
   * around the extrema to prevent points from being drawn flush
   * against the edges.
   *
   * @param {object} pcaResults
   * @returns {{minX:number,maxX:number,minY:number,maxY:number}}
   */
  Plot.getExactPlotBounds = function getExactPlotBounds(pcaResults) {
    const objectCoords = pcaResults?.pca?.exactBiplot?.objectCoords ?? [];
    const criterionCoords = pcaResults?.pca?.exactBiplot?.criterionCoords ?? [];
    const allPoints = [
      ...objectCoords.map((p) => [p.x, p.y]),
      ...criterionCoords.map((p) => [p.x, p.y]),
      [0, 0]
    ];
    const xs = allPoints.map((p) => p[0]);
    const ys = allPoints.map((p) => p[1]);
    let minX = Math.min(...xs);
    let maxX = Math.max(...xs);
    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);
    // In the unlikely case of a singular spread, broaden the range
    if (minX === maxX) {
      minX -= 1;
      maxX += 1;
    }
    if (minY === maxY) {
      minY -= 1;
      maxY += 1;
    }
    const padX = (maxX - minX) * 0.18;
    const padY = (maxY - minY) * 0.18;
    return {
      minX: minX - padX,
      maxX: maxX + padX,
      minY: minY - padY,
      maxY: maxY + padY
    };
  };

  /**
   * Convert an exact biplot coordinate into an SVG coordinate.
   * Takes into account the overall bounds, the plot size and a
   * padding margin.
   *
   * @param {number} x
   * @param {number} y
   * @param {{minX:number,maxX:number,minY:number,maxY:number}} bounds
   * @param {number} size
   * @param {number} padding
   * @returns {{x:number,y:number}}
   */
  Plot.exactCoordToSvg = function exactCoordToSvg(x, y, bounds, size, padding) {
    const px = Plot.mapPlotValue(x, bounds.minX, bounds.maxX, padding, size - padding);
    const py = Plot.mapPlotValue(y, bounds.minY, bounds.maxY, size - padding, padding);
    return { x: px, y: py };
  };

  /**
   * Draw the manual biplot into the given SVG element.  This
   * function completely clears the SVG before drawing.  It respects
   * the `markNegativeLoadingsRed` setting by colouring the
   * negative half of each criterion axis red when enabled.
   *
   * @param {object} state
   * @param {SVGElement} plot
   * @param {number} size
   */
  Plot.drawManualPlot = function drawManualPlot(state, plot, size) {
    const padding = Utils.getDynamicPlotPadding(size);
    const inner = Math.max(120, size - padding * 2);
    const center = size / 2;
    const radius = inner / 2;
    const criterionLabelRadius = radius + 18;
    const criterionLabelNodes = [];
    // Background box
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', center - radius);
    bg.setAttribute('y', center - radius);
    bg.setAttribute('width', inner);
    bg.setAttribute('height', inner);
    bg.setAttribute('fill', '#fff');
    bg.setAttribute('stroke', '#555');
    plot.appendChild(bg);
    // Axes
    const axisX = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    axisX.setAttribute('x1', center - radius);
    axisX.setAttribute('y1', center);
    axisX.setAttribute('x2', center + radius);
    axisX.setAttribute('y2', center);
    axisX.setAttribute('stroke', '#c9cdd4');
    plot.appendChild(axisX);
    const axisY = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    axisY.setAttribute('x1', center);
    axisY.setAttribute('y1', center - radius);
    axisY.setAttribute('x2', center);
    axisY.setAttribute('y2', center + radius);
    axisY.setAttribute('stroke', '#c9cdd4');
    plot.appendChild(axisY);
    // Draw each criterion axis and its labels
    state.criteria.forEach((criterion) => {
      const main = Utils.polarToCartesian(criterion.angle, radius);
      const opposite = Utils.polarToCartesian(criterion.angle + 180, radius);
      // Negative half line (from centre to opposite) – red if enabled
      const negLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      negLine.setAttribute('x1', center);
      negLine.setAttribute('y1', center);
      negLine.setAttribute('x2', center + opposite.x);
      negLine.setAttribute('y2', center + opposite.y);
      negLine.setAttribute('stroke', state.settings.markNegativeLoadingsRed ? '#d11a2a' : '#d9dde3');
      plot.appendChild(negLine);
      // Positive half line (from centre to main) – grey
      const posLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      posLine.setAttribute('x1', center);
      posLine.setAttribute('y1', center);
      posLine.setAttribute('x2', center + main.x);
      posLine.setAttribute('y2', center + main.y);
      posLine.setAttribute('stroke', '#d9dde3');
      plot.appendChild(posLine);
      // Left and right label positions (beyond the ends of the axis)
      const leftTextPos = Utils.polarToCartesian(criterion.angle + 180, criterionLabelRadius);
      const rightTextPos = Utils.polarToCartesian(criterion.angle, criterionLabelRadius);
      const leftText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      leftText.setAttribute('x', center + leftTextPos.x);
      leftText.setAttribute('y', center + leftTextPos.y);
      leftText.setAttribute('font-size', '12');
      leftText.setAttribute('font-family', 'Arial, sans-serif');
      leftText.setAttribute('text-anchor', Utils.getAnchor(leftTextPos.x));
      leftText.setAttribute(
        'dominant-baseline',
        Utils.getCriterionLabelBaseline(leftTextPos.y / Math.max(criterionLabelRadius, 1))
      );
      leftText.textContent = criterion.left;
      plot.appendChild(leftText);
      criterionLabelNodes.push(leftText);
      const rightText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      rightText.setAttribute('x', center + rightTextPos.x);
      rightText.setAttribute('y', center + rightTextPos.y);
      rightText.setAttribute('font-size', '12');
      rightText.setAttribute('font-family', 'Arial, sans-serif');
      rightText.setAttribute('text-anchor', Utils.getAnchor(rightTextPos.x));
      rightText.setAttribute(
        'dominant-baseline',
        Utils.getCriterionLabelBaseline(rightTextPos.y / Math.max(criterionLabelRadius, 1))
      );
      rightText.textContent = criterion.right;
      plot.appendChild(rightText);
      criterionLabelNodes.push(rightText);
    });
    // Resolve label collisions for criterion labels
    Utils.resolveCriterionLabelCollisions(criterionLabelNodes, size);
    // Object points and labels
    const points = state.objects.map((obj) => {
      const coords = Plot.getObjectCoordinates(obj, state);
      return {
        name: obj.name,
        x: center + coords.x * radius * 0.95,
        y: center + coords.y * radius * 0.95
      };
    });
    const labelPlacements = Utils.placeObjectLabels(points, size, center - radius);
    points.forEach((point, index) => {
      const pointNode = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      pointNode.setAttribute('x', point.x - 3);
      pointNode.setAttribute('y', point.y - 3);
      pointNode.setAttribute('width', 6);
      pointNode.setAttribute('height', 6);
      pointNode.setAttribute('fill', '#111');
      plot.appendChild(pointNode);
      const placement = labelPlacements[index];
      if (placement.connector) {
        const connector = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        connector.setAttribute('x1', point.x);
        connector.setAttribute('y1', point.y);
        connector.setAttribute('x2', placement.labelX);
        connector.setAttribute('y2', placement.labelY - 4);
        connector.setAttribute('stroke', '#b9bec7');
        connector.setAttribute('stroke-width', '1');
        plot.appendChild(connector);
      }
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', placement.labelX);
      label.setAttribute('y', placement.labelY);
      label.setAttribute('font-size', '12');
      label.setAttribute('font-family', 'Arial, sans-serif');
      label.setAttribute('text-anchor', placement.anchor);
      label.textContent = point.name;
      plot.appendChild(label);
    });
    // Dimension labels
    const dim1 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    dim1.setAttribute('x', size - 18);
    dim1.setAttribute('y', center + 12);
    dim1.setAttribute('font-size', '12');
    dim1.setAttribute('transform', `rotate(90 ${size - 18} ${center + 12})`);
    dim1.textContent = 'Dim 1';
    plot.appendChild(dim1);
    const dim2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    dim2.setAttribute('x', center - 22);
    dim2.setAttribute('y', size - 18);
    dim2.setAttribute('font-size', '12');
    dim2.textContent = 'Dim 2';
    plot.appendChild(dim2);
  };

  /**
   * Draw the exact (PCA) biplot.  This function computes the
   * analysis results if necessary, then projects all points into
   * SVG coordinates.  The negative half of each criterion axis is
   * coloured red when the `markNegativeLoadingsRed` setting is
   * enabled.
   *
   * @param {object} state
   * @param {SVGElement} plot
   * @param {number} size
   */
  Plot.drawExactPlot = function drawExactPlot(state, plot, size) {
    // Compute PCA results once per draw.  We avoid caching here so
    // that any changes to state are immediately reflected.
    const exactResults = Stats.computeAnalysisResults(state);
    const objectCoords = exactResults?.pca?.exactBiplot?.objectCoords ?? [];
    const criterionCoords = exactResults?.pca?.exactBiplot?.criterionCoords ?? [];
    const padding = Utils.getDynamicPlotPadding(size);
    const bounds = Plot.getExactPlotBounds(exactResults);
    // Background box
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', padding);
    bg.setAttribute('y', padding);
    bg.setAttribute('width', size - padding * 2);
    bg.setAttribute('height', size - padding * 2);
    bg.setAttribute('fill', '#fff');
    bg.setAttribute('stroke', '#555');
    plot.appendChild(bg);
    // Axes
    const origin = Plot.exactCoordToSvg(0, 0, bounds, size, padding);
    const axisX = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    axisX.setAttribute('x1', padding);
    axisX.setAttribute('y1', origin.y);
    axisX.setAttribute('x2', size - padding);
    axisX.setAttribute('y2', origin.y);
    axisX.setAttribute('stroke', '#c9cdd4');
    plot.appendChild(axisX);
    const axisY = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    axisY.setAttribute('x1', origin.x);
    axisY.setAttribute('y1', padding);
    axisY.setAttribute('x2', origin.x);
    axisY.setAttribute('y2', size - padding);
    axisY.setAttribute('stroke', '#c9cdd4');
    plot.appendChild(axisY);
    const criterionLabelNodes = [];
    criterionCoords.forEach((criterion) => {
      const end = Plot.exactCoordToSvg(criterion.x, criterion.y, bounds, size, padding);
      const start = Plot.exactCoordToSvg(-criterion.x, -criterion.y, bounds, size, padding);
      // Negative half: line from start to origin
      const neg = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      neg.setAttribute('x1', start.x);
      neg.setAttribute('y1', start.y);
      neg.setAttribute('x2', origin.x);
      neg.setAttribute('y2', origin.y);
      neg.setAttribute('stroke', state.settings.markNegativeLoadingsRed ? '#d11a2a' : '#d9dde3');
      plot.appendChild(neg);
      // Positive half: line from origin to end
      const pos = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      pos.setAttribute('x1', origin.x);
      pos.setAttribute('y1', origin.y);
      pos.setAttribute('x2', end.x);
      pos.setAttribute('y2', end.y);
      pos.setAttribute('stroke', '#d9dde3');
      plot.appendChild(pos);
      // Arrow for the positive direction (kept red/dark as in original)
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      arrow.setAttribute('x1', origin.x);
      arrow.setAttribute('y1', origin.y);
      arrow.setAttribute('x2', end.x);
      arrow.setAttribute('y2', end.y);
      arrow.setAttribute('stroke', '#b33a3a');
      arrow.setAttribute('stroke-width', '2');
      plot.appendChild(arrow);
      // Labels
      const leftLabelPos = Plot.exactCoordToSvg(-criterion.x * 1.08, -criterion.y * 1.08, bounds, size, padding);
      const rightLabelPos = Plot.exactCoordToSvg(criterion.x * 1.08, criterion.y * 1.08, bounds, size, padding);
      const leftText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      leftText.setAttribute('x', leftLabelPos.x);
      leftText.setAttribute('y', leftLabelPos.y);
      leftText.setAttribute('font-size', '12');
      leftText.setAttribute('font-family', 'Arial, sans-serif');
      leftText.setAttribute('text-anchor', Utils.getAnchor(leftLabelPos.x - origin.x));
      leftText.setAttribute('dominant-baseline', 'middle');
      leftText.textContent = criterion.left;
      plot.appendChild(leftText);
      criterionLabelNodes.push(leftText);
      const rightText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      rightText.setAttribute('x', rightLabelPos.x);
      rightText.setAttribute('y', rightLabelPos.y);
      rightText.setAttribute('font-size', '12');
      rightText.setAttribute('font-family', 'Arial, sans-serif');
      rightText.setAttribute('text-anchor', Utils.getAnchor(rightLabelPos.x - origin.x));
      rightText.setAttribute('dominant-baseline', 'middle');
      rightText.textContent = criterion.right;
      plot.appendChild(rightText);
      criterionLabelNodes.push(rightText);
    });
    // Resolve label collisions
    Utils.resolveCriterionLabelCollisions(criterionLabelNodes, size);
    // Object points and labels
    const points = objectCoords.map((obj) => {
      const p = Plot.exactCoordToSvg(obj.x, obj.y, bounds, size, padding);
      return {
        name: obj.name,
        x: p.x,
        y: p.y
      };
    });
    const labelPlacements = Utils.placeObjectLabels(points, size, padding);
    points.forEach((point, index) => {
      const pointNode = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      pointNode.setAttribute('x', point.x - 3);
      pointNode.setAttribute('y', point.y - 3);
      pointNode.setAttribute('width', 6);
      pointNode.setAttribute('height', 6);
      pointNode.setAttribute('fill', '#111');
      plot.appendChild(pointNode);
      const placement = labelPlacements[index];
      if (placement.connector) {
        const connector = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        connector.setAttribute('x1', point.x);
        connector.setAttribute('y1', point.y);
        connector.setAttribute('x2', placement.labelX);
        connector.setAttribute('y2', placement.labelY - 4);
        connector.setAttribute('stroke', '#b9bec7');
        connector.setAttribute('stroke-width', '1');
        plot.appendChild(connector);
      }
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', placement.labelX);
      label.setAttribute('y', placement.labelY);
      label.setAttribute('font-size', '12');
      label.setAttribute('font-family', 'Arial, sans-serif');
      label.setAttribute('text-anchor', placement.anchor);
      label.textContent = point.name;
      plot.appendChild(label);
    });
    // Axis labels with explained variance
    const pc1Explained = exactResults?.pca?.explainedVariance?.[0] ?? 0;
    const pc2Explained = exactResults?.pca?.explainedVariance?.[1] ?? 0;
    const dim1 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    dim1.setAttribute('x', size - 18);
    dim1.setAttribute('y', origin.y + 12);
    dim1.setAttribute('font-size', '12');
    dim1.setAttribute('transform', `rotate(90 ${size - 18} ${origin.y + 12})`);
    dim1.textContent = `PC2 (${pc2Explained}%)`;
    plot.appendChild(dim1);
    const dim2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    dim2.setAttribute('x', origin.x + 8);
    dim2.setAttribute('y', size - 18);
    dim2.setAttribute('font-size', '12');
    dim2.textContent = `PC1 (${pc1Explained}%)`;
    plot.appendChild(dim2);
  };

  /**
   * Top level draw function.  Clears the SVG, adjusts the viewBox
   * according to the selected plot size and delegates to the
   * appropriate drawing function based on the current `plotMode`.
   *
   * @param {object} state
   * @param {SVGElement} plot
   * @param {HTMLElement} plotWrapper
   * @param {HTMLInputElement} plotSizeInput
   */
  Plot.drawPlot = function drawPlot(state, plot, plotWrapper, plotSizeInput) {
    if (!plot || !plotWrapper || !plotSizeInput) return;
    const size = Number(plotSizeInput.value);
    plotWrapper.style.width = `${size}px`;
    plotWrapper.style.height = `${size}px`;
    plot.setAttribute('viewBox', `0 0 ${size} ${size}`);
    plot.innerHTML = '';
    if (state.plotMode === 'exact') {
      Plot.drawExactPlot(state, plot, size);
    } else {
      Plot.drawManualPlot(state, plot, size);
    }
  };

  // Expose the Plot object globally.
  window.Plot = Plot;
})();