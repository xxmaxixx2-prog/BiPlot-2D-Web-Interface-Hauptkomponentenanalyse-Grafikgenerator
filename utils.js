// Utility functions for the BiPlot application.
//
// This module exposes a single global object, `Utils`, which bundles
// together a handful of helpers used throughout the app.  Many of
// these functions are direct translations from the original
// monolithic script.  They intentionally avoid any side effects
// except for reading the global `state` where necessary (for
// example, to respect the `avoidOverlap` setting when placing
// labels).  If you need to extend the helper set, add new
// properties to `Utils` below.

(function () {
  const Utils = {};

  /**
   * Normalize an angle in degrees to the range 0 – 359.
   * NaN or non‑finite values return 0.
   *
   * @param {number|string} value
   * @returns {number}
   */
  Utils.normalizeAngle = function normalizeAngle(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return ((Math.round(number) % 360) + 360) % 360;
  };

  /**
   * Clamp a numeric value to a given min/max range.  If the value
   * cannot be parsed, the provided fallback is returned instead.
   *
   * @param {number|string} value
   * @param {number} min
   * @param {number} max
   * @param {number} fallback
   * @returns {number}
   */
  Utils.clamp = function clamp(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  };

  /**
   * Escape potentially unsafe HTML characters in a string.  This
   * helper prevents HTML injection when inserting user supplied
   * content into the DOM.
   *
   * @param {string} value
   * @returns {string}
   */
  Utils.escapeHtml = function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /**
   * Convert a polar coordinate (angle in degrees, unit radius) into
   * cartesian coordinates.  The angle is adjusted so that 0° points
   * upwards (12 o'clock) rather than to the right.
   *
   * @param {number} angleDeg
   * @param {number} radius
   * @returns {{x: number, y: number}}
   */
  Utils.polarToCartesian = function polarToCartesian(angleDeg, radius) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: Math.cos(rad) * radius,
      y: Math.sin(rad) * radius
    };
  };

  /**
   * Determine the appropriate SVG text anchor based on an x offset.
   * Small offsets around zero return 'middle' while large positive
   * values return 'start' and large negative values return 'end'.
   *
   * @param {number} x
   * @returns {string}
   */
  Utils.getAnchor = function getAnchor(x) {
    if (x < -12) return 'end';
    if (x > 12) return 'start';
    return 'middle';
  };

  /**
   * Measure the pixel width of a given string using a hidden
   * offscreen canvas.  This is used to compute dynamic plot padding
   * based on the longest criterion label.
   *
   * @param {string} text
   * @param {string} font
   * @returns {number}
   */
  Utils.measureTextWidth = function measureTextWidth(text, font = '12px Arial') {
    const canvas = Utils.measureTextWidth.canvas || (Utils.measureTextWidth.canvas = document.createElement('canvas'));
    const ctx = canvas.getContext('2d');
    ctx.font = font;
    return Math.ceil(ctx.measureText(String(text ?? '')).width);
  };

  /**
   * Return the maximum width of any criterion label (left or right).
   * Reads from the global `state` object.
   *
   * @returns {number}
   */
  Utils.getMaxCriterionLabelWidth = function getMaxCriterionLabelWidth() {
    let maxWidth = 0;
    if (!window.state || !Array.isArray(window.state.criteria)) return 0;
    window.state.criteria.forEach((criterion) => {
      maxWidth = Math.max(
        maxWidth,
        Utils.measureTextWidth(criterion.left),
        Utils.measureTextWidth(criterion.right)
      );
    });
    return maxWidth;
  };

  /**
   * Compute dynamic plot padding based on the longest label.  This
   * function reproduces the logic from the original script: a raw
   * padding value scaled from the longest label is limited by a
   * maximum allowable padding.  The returned value is used to
   * compute the inner drawing area for the plots.
   *
   * @param {number} size
   * @returns {number}
   */
  Utils.getDynamicPlotPadding = function getDynamicPlotPadding(size) {
    const longestLabel = Utils.getMaxCriterionLabelWidth();
    const rawPadding = Math.max(78, Math.ceil(longestLabel / 2) + 30);
    const maxPadding = Math.max(58, Math.floor((size - 170) / 2));
    return Math.min(rawPadding, maxPadding);
  };

  /**
   * Determine the dominant baseline for criterion labels based on
   * their radial y‐component.  Labels that are almost horizontal
   * (|y| < 0.18) are vertically centred; otherwise labels above the
   * centre use 'hanging' and those below use the default baseline.
   *
   * @param {number} vectorY
   * @returns {string}
   */
  Utils.getCriterionLabelBaseline = function getCriterionLabelBaseline(vectorY) {
    if (Math.abs(vectorY) < 0.18) return 'middle';
    return vectorY > 0 ? 'hanging' : 'auto';
  };

  /**
   * Ensure an SVG text node is contained within the plot by nudging
   * its x/y position.  If the bounding box spills out of the
   * available area (size minus margin), this helper adjusts its
   * coordinates.
   *
   * @param {SVGTextElement} textNode
   * @param {number} size
   * @param {number} margin
   */
  Utils.clampSvgTextIntoView = function clampSvgTextIntoView(textNode, size, margin = 8) {
    const box = textNode.getBBox();
    let x = Number(textNode.getAttribute('x'));
    let y = Number(textNode.getAttribute('y'));
    if (box.x < margin) {
      x += margin - box.x;
    }
    if (box.x + box.width > size - margin) {
      x -= box.x + box.width - (size - margin);
    }
    if (box.y < margin) {
      y += margin - box.y;
    }
    if (box.y + box.height > size - margin) {
      y -= box.y + box.height - (size - margin);
    }
    textNode.setAttribute('x', x);
    textNode.setAttribute('y', y);
  };

  /**
   * Compute a rough bounding box for a potential label placement.  The
   * width is based on an average character width and a small
   * minimum, and the height is fixed.  The anchor determines how
   * left coordinates are derived.
   *
   * @param {number} x
   * @param {number} y
   * @param {string} text
   * @param {string} anchor
   * @returns {{left: number, top: number, right: number, bottom: number, width: number, height: number}}
   */
  Utils.estimateTextBox = function estimateTextBox(x, y, text, anchor = 'start') {
    const width = Math.max(22, text.length * 6.7);
    const height = 14;
    let left = x;
    if (anchor === 'middle') left = x - width / 2;
    if (anchor === 'end') left = x - width;
    return {
      left,
      top: y - 11,
      right: left + width,
      bottom: y - 11 + height,
      width,
      height
    };
  };

  /**
   * Determine whether two label bounding boxes overlap, allowing a
   * padding margin.  Used by the collision resolution algorithm.
   *
   * @param {{left:number, right:number, top:number, bottom:number}} a
   * @param {{left:number, right:number, top:number, bottom:number}} b
   * @param {number} padding
   * @returns {boolean}
   */
  Utils.boxesOverlap = function boxesOverlap(a, b, padding = 4) {
    return !(
      a.right + padding < b.left ||
      a.left - padding > b.right ||
      a.bottom + padding < b.top ||
      a.top - padding > b.bottom
    );
  };

  /**
   * Check whether a bounding box is fully inside the plot area.  This
   * prevents labels from being nudged outside the viewBox.
   *
   * @param {{left:number, right:number, top:number, bottom:number}} box
   * @param {number} padding
   * @param {number} size
   * @returns {boolean}
   */
  Utils.isInsidePlot = function isInsidePlot(box, padding, size) {
    return (
      box.left >= padding &&
      box.top >= padding &&
      box.right <= size - padding &&
      box.bottom <= size - padding
    );
  };

  /**
   * Provide a list of candidate label offsets relative to a point.
   * These offsets are used when searching for a non‑overlapping label
   * position.  They were empirically chosen in the original script.
   *
   * @returns {Array<{dx:number, dy:number}>}
   */
  Utils.getLabelOffsets = function getLabelOffsets() {
    return [
      { dx: 8, dy: 4 },
      { dx: 8, dy: -8 },
      { dx: 8, dy: 16 },
      { dx: -8, dy: -8 },
      { dx: -8, dy: 16 },
      { dx: 16, dy: -16 },
      { dx: 16, dy: 24 },
      { dx: -16, dy: -16 },
      { dx: -16, dy: 24 },
      { dx: 24, dy: 4 },
      { dx: -24, dy: 4 },
      { dx: 30, dy: -24 },
      { dx: 30, dy: 30 },
      { dx: -30, dy: -24 },
      { dx: -30, dy: 30 }
    ];
  };

  /**
   * Attempt to place object labels around their points while
   * avoiding overlaps.  Uses a greedy search over predefined
   * offsets, falls back to a simple placement when overlaps cannot
   * be avoided, and respects the `avoidOverlap` setting from the
   * global `state`.  Returns a list of placement metadata for each
   * point: x/y coordinates, anchor and whether to draw a connector
   * line.
   *
   * @param {Array<{name:string,x:number,y:number}>} points
   * @param {number} size
   * @param {number} padding
   * @returns {Array<{labelX:number,labelY:number,anchor:string,connector:boolean}>}
   */
  Utils.placeObjectLabels = function placeObjectLabels(points, size, padding) {
    const occupiedBoxes = [];
    const offsets = Utils.getLabelOffsets();
    return points.map((point) => {
      const anchor = point.x >= size / 2 ? 'start' : 'end';
      const candidates = offsets.map((offset) => ({
        dx: anchor === 'start' ? offset.dx : -offset.dx,
        dy: offset.dy
      }));
      const fallback = {
        labelX: point.x + (anchor === 'start' ? 8 : -8),
        labelY: point.y + 4,
        anchor,
        connector: false
      };
      // if overlap avoidance is disabled, use fallback immediately
      if (!window.state || !window.state.settings.avoidOverlap) {
        return fallback;
      }
      for (const candidate of candidates) {
        const labelX = point.x + candidate.dx;
        const labelY = point.y + candidate.dy;
        const box = Utils.estimateTextBox(labelX, labelY, point.name, anchor);
        const collides = occupiedBoxes.some((existing) => Utils.boxesOverlap(box, existing));
        if (!collides && Utils.isInsidePlot(box, padding, size)) {
          occupiedBoxes.push(box);
          return {
            labelX,
            labelY,
            anchor,
            connector: Math.abs(candidate.dx) > 12 || Math.abs(candidate.dy) > 12
          };
        }
      }
      const fallbackBox = Utils.estimateTextBox(fallback.labelX, fallback.labelY, point.name, fallback.anchor);
      occupiedBoxes.push(fallbackBox);
      return fallback;
    });
  };

  /**
   * Nudge two overlapping text elements apart.  This helper is part
   * of the label collision resolution logic used for criterion
   * labels.  It nudges the elements horizontally or vertically
   * depending on which axis has greater overlap, then clamps them
   * into view.
   *
   * @param {SVGTextElement} a
   * @param {SVGTextElement} b
   * @param {number} size
   * @returns {boolean}
   */
  function nudgeCriterionLabelPair(a, b, size) {
    const boxA = a.getBBox();
    const boxB = b.getBBox();
    const overlapX = Math.min(boxA.x + boxA.width, boxB.x + boxB.width) - Math.max(boxA.x, boxB.x);
    const overlapY = Math.min(boxA.y + boxA.height, boxB.y + boxB.height) - Math.max(boxA.y, boxB.y);
    if (overlapX <= 0 || overlapY <= 0) return false;
    const ax = Number(a.getAttribute('x'));
    const ay = Number(a.getAttribute('y'));
    const bx = Number(b.getAttribute('x'));
    const by = Number(b.getAttribute('y'));
    const horizontalPush = overlapX / 2 + 4;
    const verticalPush = overlapY / 2 + 3;
    if (Math.abs(ax - bx) >= Math.abs(ay - by)) {
      const direction = ax <= bx ? 1 : -1;
      a.setAttribute('x', ax - horizontalPush * direction);
      b.setAttribute('x', bx + horizontalPush * direction);
    } else {
      const direction = ay <= by ? 1 : -1;
      a.setAttribute('y', ay - verticalPush * direction);
      b.setAttribute('y', by + verticalPush * direction);
    }
    Utils.clampSvgTextIntoView(a, size, 8);
    Utils.clampSvgTextIntoView(b, size, 8);
    return true;
  }

  /**
   * Resolve collisions between criterion labels by repeatedly
   * nudging overlapping pairs apart.  This function mutates the
   * provided SVGTextElement nodes.  It performs a bounded number of
   * passes to avoid infinite loops.
   *
   * @param {SVGTextElement[]} labelNodes
   * @param {number} size
   */
  Utils.resolveCriterionLabelCollisions = function resolveCriterionLabelCollisions(labelNodes, size) {
    for (let pass = 0; pass < 32; pass += 1) {
      let moved = false;
      for (let i = 0; i < labelNodes.length; i += 1) {
        for (let j = i + 1; j < labelNodes.length; j += 1) {
          if (nudgeCriterionLabelPair(labelNodes[i], labelNodes[j], size)) {
            moved = true;
          }
        }
      }
      labelNodes.forEach((node) => Utils.clampSvgTextIntoView(node, size, 8));
      if (!moved) break;
    }
  };

  // Expose the Utils object globally.
  window.Utils = Utils;
})();