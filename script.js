const state = {
  criteria: [],
  objects: [],
  settings: {
    avoidOverlap: true
  }
};

const demoState = {
  criteria: [
    { left: 'modern/digital', right: 'traditionell', angle: 140, weight: 1.2 },
    { left: 'gut bezahlt', right: 'schlecht bezahlt', angle: 190, weight: 1.0 },
    { left: 'kreativ', right: 'monoton', angle: 230, weight: 1.15 },
    { left: 'viel Menschenkontakt', right: 'wenig Menschenkontakt', angle: 300, weight: 1.0 },
    { left: 'praktisch / handwerklich', right: 'theoretisch', angle: 285, weight: 1.1 },
    { left: 'anspruchsvoll / qualifiziert', right: 'einfach / gering', angle: 210, weight: 0.85 }
  ],
  objects: [
    { name: 'Marketing', values: [5, 4, 5, 4, 2, 4] },
    { name: 'Bürojob', values: [4, 4, 2, 2, 1, 3] },
    { name: 'Kassierer', values: [2, 2, 1, 5, 3, 2] },
    { name: 'Konditorin', values: [2, 3, 4, 4, 6, 5] },
    { name: 'Berufsschullehramt', values: [3, 4, 5, 5, 2, 6] }
  ],
  settings: {
    avoidOverlap: true
  }
};

const criteriaList = document.getElementById('criteriaList');
const matrixTable = document.getElementById('matrixTable');
const objectsControls = document.getElementById('objectsControls');
const plot = document.getElementById('plot');
const plotWrapper = document.getElementById('plotWrapper');
const criterionTemplate = document.getElementById('criterionTemplate');
const messageBox = document.getElementById('messageBox');
const plotSizeInput = document.getElementById('plotSizeInput');
const avoidOverlapInput = document.getElementById('avoidOverlapInput');
const importFileInput = document.getElementById('importFileInput');
const autoArrangeBtn = document.getElementById('autoArrangeBtn');
const autoLayoutNotice = document.getElementById('autoLayoutNotice');

function cloneDemo() {
  return JSON.parse(JSON.stringify(demoState));
}

function normalizeAngle(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return ((Math.round(number) % 360) + 360) % 360;
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeState(raw) {
  const source = raw && typeof raw === 'object' && raw.state ? raw.state : raw;

  if (!source || typeof source !== 'object') {
    throw new Error('JSON hat keine gültige Struktur.');
  }

  const criteria = Array.isArray(source.criteria)
    ? source.criteria.map((criterion, index) => ({
        left: String(criterion?.left ?? `Pol A ${index + 1}`),
        right: String(criterion?.right ?? `Pol B ${index + 1}`),
        angle: normalizeAngle(criterion?.angle ?? 0),
        weight: clamp(criterion?.weight ?? 1, 0.2, 2.5, 1)
      }))
    : [];

  if (criteria.length === 0) {
    throw new Error('Es wurde kein Kriterium gefunden.');
  }

  const objects = Array.isArray(source.objects)
    ? source.objects.map((obj, index) => ({
        name: String(obj?.name ?? `Objekt ${index + 1}`),
        values: Array.isArray(obj?.values)
          ? obj.values.map((value) => Math.round(clamp(value, 1, 6, 3)))
          : []
      }))
    : [];

  const settings = {
    avoidOverlap: Boolean(source?.settings?.avoidOverlap ?? true)
  };

  return { criteria, objects, settings };
}

function loadState(newState) {
  const safeState = sanitizeState(newState);
  state.criteria = safeState.criteria;
  state.objects = safeState.objects;
  state.settings = { ...state.settings, ...safeState.settings };
  ensureMatrixConsistency();

  if (avoidOverlapInput) {
    avoidOverlapInput.checked = state.settings.avoidOverlap;
  }

  renderAll();
}

function ensureMatrixConsistency() {
  const criteriaCount = state.criteria.length;

  state.objects.forEach((obj) => {
    if (!Array.isArray(obj.values)) obj.values = [];

    while (obj.values.length < criteriaCount) {
      obj.values.push(3);
    }

    if (obj.values.length > criteriaCount) {
      obj.values = obj.values.slice(0, criteriaCount);
    }

    obj.values = obj.values.map((value) => Math.round(clamp(value, 1, 6, 3)));
  });
}

function showMessage(text, type = 'success') {
  if (!messageBox) return;

  messageBox.textContent = text;
  messageBox.className = `message is-visible ${type === 'error' ? 'is-error' : 'is-success'}`;

  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => {
    messageBox.className = 'message';
    messageBox.textContent = '';
  }, 3800);
}

function renderAutoLayoutNotice(result = null) {
  if (!autoLayoutNotice) return;

  if (!result) {
    autoLayoutNotice.className = 'auto-layout-notice';
    autoLayoutNotice.innerHTML = `
      <strong>Hinweis zur Auto-Anordnung</strong>
      <span>
        Berufe/Objekte dürfen ähnlich sein. Kriterien sollten sich jedoch möglichst unterscheiden.
        Zu viele ähnliche Kriterien verfälschen die Projektion und gewichten einzelne Richtungen zu stark.
      </span>
    `;
    return;
  }

  const pairs = Array.isArray(result.redundantPairs) ? result.redundantPairs.slice(0, 3) : [];
  const pairText = pairs.length
    ? pairs
        .map((pair) => {
          const a = escapeHtml(pair.labelA);
          const b = escapeHtml(pair.labelB);
          const corr = Number.isFinite(pair.corr) ? pair.corr.toFixed(2) : '0.00';
          return `${a} / ${b} (${pair.relation}, r=${corr})`;
        })
        .join('; ')
    : 'Keine stark redundanten Kriterienpaare erkannt.';

  const explained =
    Array.isArray(result.explainedVariance) && result.explainedVariance.length >= 2
      ? Math.round((result.explainedVariance[0] + result.explainedVariance[1]) * 100)
      : null;

  autoLayoutNotice.className = `auto-layout-notice ${
    result.redundantPairs && result.redundantPairs.length ? 'is-warning' : 'is-ok'
  }`;

  autoLayoutNotice.innerHTML = `
    <strong>Auto-Anordnung angewendet</strong>
    <span>
      Berufe/Objekte dürfen ähnlich sein. Kriterien sollten sich jedoch unterscheiden.
      ${pairText}
      ${explained !== null ? ` PC1/PC2 erklären hier ungefähr ${explained}% der Kriteriumsstruktur.` : ''}
    </span>
  `;
}

function renderAll() {
  ensureMatrixConsistency();
  renderCriteriaControls();
  renderObjectControls();
  renderMatrix();
  drawPlot();
  renderAnalysis();
  renderAutoLayoutNotice();
}

function handleAutoArrangeClick() {
  if (!window.BiPlotteRAutoLayout || typeof window.BiPlotteRAutoLayout.analyze !== 'function') {
    showMessage('auto-layout.js wurde nicht gefunden oder nicht korrekt geladen.', 'error');
    return;
  }

  try {
    ensureMatrixConsistency();

    const result = window.BiPlotteRAutoLayout.analyze(state);

    if (!result || !Array.isArray(result.angles)) {
      throw new Error('Auto-Layout hat keine gültigen Winkel zurückgegeben.');
    }

    result.angles.forEach((angle, index) => {
      if (!state.criteria[index]) return;
      state.criteria[index].angle = normalizeAngle(angle);
    });

    renderAll();
    renderAutoLayoutNotice(result);

    const pairCount = Array.isArray(result.redundantPairs) ? result.redundantPairs.length : 0;
    const message =
      pairCount > 0
        ? `Auto-Anordnung aktiv. ${pairCount} stark ähnliche oder gegensätzliche Kriterienpaare erkannt.`
        : 'Auto-Anordnung aktiv. Keine starke Kriterien-Redundanz erkannt.';

    showMessage(message, 'success');
  } catch (error) {
    showMessage(`Auto-Anordnung fehlgeschlagen: ${error.message}`, 'error');
  }
}

function renderCriteriaControls() {
  if (!criteriaList || !criterionTemplate) return;
  criteriaList.innerHTML = '';

  state.criteria.forEach((criterion, index) => {
    const node = criterionTemplate.content.cloneNode(true);

    node.querySelector('.criterion-title').textContent = `Kriterium ${index + 1}`;

    const leftInput = node.querySelector('.left-label-input');
    const rightInput = node.querySelector('.right-label-input');
    const angleInput = node.querySelector('.angle-input');
    const weightInput = node.querySelector('.weight-input');
    const angleValue = node.querySelector('.angle-value');
    const weightValue = node.querySelector('.weight-value');
    const removeBtn = node.querySelector('.remove-criterion-btn');

    leftInput.value = criterion.left;
    rightInput.value = criterion.right;
    angleInput.value = criterion.angle;
    weightInput.value = criterion.weight;
    angleValue.textContent = `${criterion.angle}°`;
    weightValue.textContent = `${criterion.weight}`;

    leftInput.addEventListener('input', (event) => {
      criterion.left = event.target.value;
      renderMatrix();
      drawPlot();
      renderAnalysis();
      renderAutoLayoutNotice();
    });

    rightInput.addEventListener('input', (event) => {
      criterion.right = event.target.value;
      renderMatrix();
      drawPlot();
      renderAnalysis();
      renderAutoLayoutNotice();
    });

    angleInput.addEventListener('input', (event) => {
      criterion.angle = normalizeAngle(event.target.value);
      angleValue.textContent = `${criterion.angle}°`;
      drawPlot();
      renderAutoLayoutNotice();
    });

    weightInput.addEventListener('input', (event) => {
      criterion.weight = clamp(event.target.value, 0.2, 2.5, 1);
      weightValue.textContent = `${criterion.weight}`;
      drawPlot();
      renderAutoLayoutNotice();
    });

    removeBtn.addEventListener('click', () => {
      state.criteria.splice(index, 1);
      state.objects.forEach((obj) => obj.values.splice(index, 1));

      if (state.criteria.length === 0) {
        state.criteria.push({ left: 'neuer Pol A', right: 'neuer Pol B', angle: 0, weight: 1 });
      }

      renderAll();
    });

    criteriaList.appendChild(node);
  });
}

function renderObjectControls() {
  if (!objectsControls) return;
  objectsControls.innerHTML = '';

  state.objects.forEach((obj, index) => {
    const row = document.createElement('div');
    row.className = 'object-row';

    const label = document.createElement('label');
    label.textContent = 'Objektname';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = obj.name;
    input.addEventListener('input', (event) => {
      obj.name = event.target.value;
      renderMatrix();
      drawPlot();
      renderAnalysis();
      renderAutoLayoutNotice();
    });

    label.appendChild(input);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'danger';
    removeBtn.textContent = 'Entfernen';
    removeBtn.addEventListener('click', () => {
      state.objects.splice(index, 1);
      renderAll();
    });

    row.appendChild(label);
    row.appendChild(removeBtn);
    objectsControls.appendChild(row);
  });
}

function renderMatrix() {
  if (!matrixTable) return;
  matrixTable.innerHTML = '';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const firstHead = document.createElement('th');
  firstHead.textContent = 'Objekt / Beruf';
  headerRow.appendChild(firstHead);

  state.criteria.forEach((criterion) => {
    const th = document.createElement('th');
    th.innerHTML = `${escapeHtml(criterion.left)}<br><small>↔ ${escapeHtml(criterion.right)}</small>`;
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  matrixTable.appendChild(thead);

  const tbody = document.createElement('tbody');

  state.objects.forEach((obj) => {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = obj.name;
    nameInput.className = 'matrix-name-input';
    nameInput.addEventListener('input', (event) => {
      obj.name = event.target.value;
      renderObjectControls();
      drawPlot();
      renderAnalysis();
      renderAutoLayoutNotice();
    });
    nameTd.appendChild(nameInput);
    tr.appendChild(nameTd);

    state.criteria.forEach((_, criterionIndex) => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '1';
      input.max = '6';
      input.step = '1';
      input.value = obj.values[criterionIndex] ?? 3;
      input.className = 'matrix-value-input';
      input.addEventListener('input', (event) => {
        obj.values[criterionIndex] = Math.round(clamp(event.target.value, 1, 6, 3));
        event.target.value = obj.values[criterionIndex];
        drawPlot();
        renderAnalysis();
        renderAutoLayoutNotice();
      });
      td.appendChild(input);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  matrixTable.appendChild(tbody);
}

function polarToCartesian(angleDeg, radius) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: Math.cos(rad) * radius,
    y: Math.sin(rad) * radius
  };
}

function getObjectCoordinates(obj) {
  let x = 0;
  let y = 0;
  let totalWeight = 0;

  state.criteria.forEach((criterion, index) => {
    const rawValue = obj.values[index] ?? 3;
    const normalized = (rawValue - 3.5) / 2.5;
    const vector = polarToCartesian(criterion.angle, 1);
    x += normalized * vector.x * criterion.weight;
    y += normalized * vector.y * criterion.weight;
    totalWeight += criterion.weight;
  });

  if (totalWeight === 0) return { x: 0, y: 0 };

  return {
    x: x / totalWeight,
    y: y / totalWeight
  };
}

function getAnchor(x) {
  if (x < -12) return 'end';
  if (x > 12) return 'start';
  return 'middle';
}

/* =========================
   GRAFIK-FIX: Text messen + Kriterien-Labels sicher platzieren
   - dynamischer Rand statt starrem Padding
   - Labels innerhalb des SVG halten
   - Kollisionen zwischen Kriterien-Labels entschärfen
========================= */

function measureTextWidth(text, font = '12px Arial') {
  const canvas = measureTextWidth.canvas || (measureTextWidth.canvas = document.createElement('canvas'));
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  return Math.ceil(ctx.measureText(String(text ?? '')).width);
}

function getMaxCriterionLabelWidth() {
  let maxWidth = 0;

  state.criteria.forEach((criterion) => {
    maxWidth = Math.max(
      maxWidth,
      measureTextWidth(criterion.left),
      measureTextWidth(criterion.right)
    );
  });

  return maxWidth;
}

function getDynamicPlotPadding(size) {
  const longestLabel = getMaxCriterionLabelWidth();
  const rawPadding = Math.max(78, Math.ceil(longestLabel / 2) + 30);
  const maxPadding = Math.max(58, Math.floor((size - 170) / 2));
  return Math.min(rawPadding, maxPadding);
}

function getCriterionLabelBaseline(vectorY) {
  if (Math.abs(vectorY) < 0.18) return 'middle';
  return vectorY > 0 ? 'hanging' : 'auto';
}

function clampSvgTextIntoView(textNode, size, margin = 8) {
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
}

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

  // Schiebt entlang der dominanten Kollisionsrichtung auseinander
  if (Math.abs(ax - bx) >= Math.abs(ay - by)) {
    const direction = ax <= bx ? 1 : -1;
    a.setAttribute('x', ax - horizontalPush * direction);
    b.setAttribute('x', bx + horizontalPush * direction);
  } else {
    const direction = ay <= by ? 1 : -1;
    a.setAttribute('y', ay - verticalPush * direction);
    b.setAttribute('y', by + verticalPush * direction);
  }

  clampSvgTextIntoView(a, size, 8);
  clampSvgTextIntoView(b, size, 8);
  return true;
}

function resolveCriterionLabelCollisions(labelNodes, size) {
  for (let pass = 0; pass < 32; pass += 1) {
    let moved = false;

    for (let i = 0; i < labelNodes.length; i += 1) {
      for (let j = i + 1; j < labelNodes.length; j += 1) {
        if (nudgeCriterionLabelPair(labelNodes[i], labelNodes[j], size)) {
          moved = true;
        }
      }
    }

    labelNodes.forEach((node) => clampSvgTextIntoView(node, size, 8));

    if (!moved) break;
  }
}


function estimateTextBox(x, y, text, anchor = 'start') {
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
}

function boxesOverlap(a, b, padding = 4) {
  return !(
    a.right + padding < b.left ||
    a.left - padding > b.right ||
    a.bottom + padding < b.top ||
    a.top - padding > b.bottom
  );
}

function isInsidePlot(box, padding, size) {
  return (
    box.left >= padding &&
    box.top >= padding &&
    box.right <= size - padding &&
    box.bottom <= size - padding
  );
}

function getLabelOffsets() {
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
}

function placeObjectLabels(points, size, padding) {
  const occupiedBoxes = [];
  const offsets = getLabelOffsets();

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

    if (!state.settings.avoidOverlap) {
      return fallback;
    }

    for (const candidate of candidates) {
      const labelX = point.x + candidate.dx;
      const labelY = point.y + candidate.dy;
      const box = estimateTextBox(labelX, labelY, point.name, anchor);
      const collides = occupiedBoxes.some((existing) => boxesOverlap(box, existing));

      if (!collides && isInsidePlot(box, padding, size)) {
        occupiedBoxes.push(box);
        return {
          labelX,
          labelY,
          anchor,
          connector: Math.abs(candidate.dx) > 12 || Math.abs(candidate.dy) > 12
        };
      }
    }

    const fallbackBox = estimateTextBox(fallback.labelX, fallback.labelY, point.name, fallback.anchor);
    occupiedBoxes.push(fallbackBox);
    return fallback;
  });
}

function drawPlot() {
  if (!plot || !plotWrapper || !plotSizeInput) return;

  const size = Number(plotSizeInput.value);
  plotWrapper.style.width = `${size}px`;
  plotWrapper.style.height = `${size}px`;
  plot.setAttribute('viewBox', `0 0 ${size} ${size}`);
  plot.innerHTML = '';

  // FIX 1: Padding nicht mehr hart auf 70, sondern an die längsten Kriterien anpassen.
  const padding = getDynamicPlotPadding(size);
  const inner = Math.max(120, size - padding * 2);
  const center = size / 2;
  const radius = inner / 2;
  const criterionLabelRadius = radius + 18;
  const criterionLabelNodes = [];

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', center - radius);
  bg.setAttribute('y', center - radius);
  bg.setAttribute('width', inner);
  bg.setAttribute('height', inner);
  bg.setAttribute('fill', '#fff');
  bg.setAttribute('stroke', '#555');
  plot.appendChild(bg);

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

  state.criteria.forEach((criterion) => {
    const main = polarToCartesian(criterion.angle, radius);
    const opposite = polarToCartesian(criterion.angle + 180, radius);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', center + opposite.x);
    line.setAttribute('y1', center + opposite.y);
    line.setAttribute('x2', center + main.x);
    line.setAttribute('y2', center + main.y);
    line.setAttribute('stroke', '#d9dde3');
    plot.appendChild(line);

    const leftTextPos = polarToCartesian(criterion.angle + 180, criterionLabelRadius);
    const rightTextPos = polarToCartesian(criterion.angle, criterionLabelRadius);

    const leftText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    leftText.setAttribute('x', center + leftTextPos.x);
    leftText.setAttribute('y', center + leftTextPos.y);
    leftText.setAttribute('font-size', '12');
    leftText.setAttribute('font-family', 'Arial, sans-serif');
    leftText.setAttribute('text-anchor', getAnchor(leftTextPos.x));
    leftText.setAttribute(
      'dominant-baseline',
      getCriterionLabelBaseline(leftTextPos.y / Math.max(criterionLabelRadius, 1))
    );
    leftText.textContent = criterion.left;
    plot.appendChild(leftText);
    criterionLabelNodes.push(leftText);

    const rightText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    rightText.setAttribute('x', center + rightTextPos.x);
    rightText.setAttribute('y', center + rightTextPos.y);
    rightText.setAttribute('font-size', '12');
    rightText.setAttribute('font-family', 'Arial, sans-serif');
    rightText.setAttribute('text-anchor', getAnchor(rightTextPos.x));
    rightText.setAttribute(
      'dominant-baseline',
      getCriterionLabelBaseline(rightTextPos.y / Math.max(criterionLabelRadius, 1))
    );
    rightText.textContent = criterion.right;
    plot.appendChild(rightText);
    criterionLabelNodes.push(rightText);
  });

  // FIX 2: Nach dem Rendern echte SVG-Bounding-Boxes nutzen und Kollisionen entschärfen.
  resolveCriterionLabelCollisions(criterionLabelNodes, size);

  const points = state.objects.map((obj) => {
    const coords = getObjectCoordinates(obj);
    return {
      name: obj.name,
      x: center + coords.x * radius * 0.95,
      y: center + coords.y * radius * 0.95
    };
  });

  const labelPlacements = placeObjectLabels(points, size, center - radius);

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
}

/*
function drawPlot() {
  if (!plot || !plotWrapper || !plotSizeInput) return;

  const size = Number(plotSizeInput.value);
  plotWrapper.style.width = `${size}px`;
  plotWrapper.style.height = `${size}px`;
  plot.setAttribute('viewBox', `0 0 ${size} ${size}`);
  plot.innerHTML = '';

  const padding = 70;
  const inner = size - padding * 2;
  const center = size / 2;
  const radius = inner / 2;

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', padding);
  bg.setAttribute('y', padding);
  bg.setAttribute('width', inner);
  bg.setAttribute('height', inner);
  bg.setAttribute('fill', '#fff');
  bg.setAttribute('stroke', '#555');
  plot.appendChild(bg);

  const axisX = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  axisX.setAttribute('x1', padding);
  axisX.setAttribute('y1', center);
  axisX.setAttribute('x2', size - padding);
  axisX.setAttribute('y2', center);
  axisX.setAttribute('stroke', '#c9cdd4');
  plot.appendChild(axisX);

  const axisY = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  axisY.setAttribute('x1', center);
  axisY.setAttribute('y1', padding);
  axisY.setAttribute('x2', center);
  axisY.setAttribute('y2', size - padding);
  axisY.setAttribute('stroke', '#c9cdd4');
  plot.appendChild(axisY);

  state.criteria.forEach((criterion) => {
    const main = polarToCartesian(criterion.angle, radius);
    const opposite = polarToCartesian(criterion.angle + 180, radius);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', center + opposite.x);
    line.setAttribute('y1', center + opposite.y);
    line.setAttribute('x2', center + main.x);
    line.setAttribute('y2', center + main.y);
    line.setAttribute('stroke', '#d9dde3');
    plot.appendChild(line);

    const leftTextPos = polarToCartesian(criterion.angle + 180, radius + 18);
    const rightTextPos = polarToCartesian(criterion.angle, radius + 18);

    const leftText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    leftText.setAttribute('x', center + leftTextPos.x);
    leftText.setAttribute('y', center + leftTextPos.y);
    leftText.setAttribute('font-size', '12');
    leftText.setAttribute('text-anchor', getAnchor(leftTextPos.x));
    leftText.textContent = criterion.left;
    plot.appendChild(leftText);

    const rightText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    rightText.setAttribute('x', center + rightTextPos.x);
    rightText.setAttribute('y', center + rightTextPos.y);
    rightText.setAttribute('font-size', '12');
    rightText.setAttribute('text-anchor', getAnchor(rightTextPos.x));
    rightText.textContent = criterion.right;
    plot.appendChild(rightText);
  });

  const points = state.objects.map((obj) => {
    const coords = getObjectCoordinates(obj);
    return {
      name: obj.name,
      x: center + coords.x * radius * 0.95,
      y: center + coords.y * radius * 0.95
    };
  });

  const labelPlacements = placeObjectLabels(points, size, padding);

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
    label.setAttribute('text-anchor', placement.anchor);
    label.textContent = point.name;
    plot.appendChild(label);
  });

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
}
*/

function exportState() {
  return {
    meta: {
      app: 'BiPlotteR – Prototyp 01',
      version: 2,
      exportedAt: new Date().toISOString()
    },
    state: {
      criteria: state.criteria,
      objects: state.objects,
      settings: state.settings
    }
  };
}

function handleImportFile(file) {
  const reader = new FileReader();

  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      loadState(parsed);
      showMessage(`JSON erfolgreich geladen: ${file.name}`);
    } catch (error) {
      showMessage(`Import fehlgeschlagen: ${error.message}`, 'error');
    }
  };

  reader.onerror = () => {
    showMessage('Datei konnte nicht gelesen werden.', 'error');
  };

  reader.readAsText(file, 'utf-8');
}

/* =========================
   ANALYSE / STATISTIK / PCA
========================= */

function getCriterionNames() {
  return state.criteria.map((criterion, index) => ({
    index,
    label: `${criterion.left} ↔ ${criterion.right}`
  }));
}

function getDataMatrix() {
  return state.objects.map((obj) =>
    state.criteria.map((_, index) => {
      const value = obj.values?.[index] ?? 3;
      return Number(value);
    })
  );
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((sum, value) => sum + value, 0) / arr.length;
}

function minValue(arr) {
  if (!arr.length) return 0;
  return Math.min(...arr);
}

function maxValue(arr) {
  if (!arr.length) return 0;
  return Math.max(...arr);
}

function sampleSD(arr) {
  if (arr.length < 2) return 0;
  const avg = mean(arr);
  const variance = arr.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function rms(arr) {
  if (!arr.length) return 0;
  return Math.sqrt(arr.reduce((sum, value) => sum + value * value, 0) / arr.length);
}

function roundStat(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function getColumn(matrix, colIndex) {
  return matrix.map((row) => row[colIndex]);
}

function computeDescriptiveStats() {
  const matrix = getDataMatrix();
  const criterionNames = getCriterionNames();

  return criterionNames.map((criterion, index) => {
    const column = getColumn(matrix, index);
    return {
      criterion: criterion.label,
      mean: roundStat(mean(column)),
      sd: roundStat(sampleSD(column)),
      min: roundStat(minValue(column)),
      max: roundStat(maxValue(column)),
      rms: roundStat(rms(column))
    };
  });
}

function pearsonCorrelation(x, y) {
  if (x.length !== y.length || x.length < 2) return 0;

  const mx = mean(x);
  const my = mean(y);
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
}

function computeCorrelationMatrix() {
  const matrix = getDataMatrix();
  const names = getCriterionNames();

  return names.map((rowCriterion, rowIndex) => {
    const row = {};
    names.forEach((colCriterion, colIndex) => {
      const xi = getColumn(matrix, rowIndex);
      const yj = getColumn(matrix, colIndex);
      row[colCriterion.label] = roundStat(pearsonCorrelation(xi, yj));
    });

    return {
      criterion: rowCriterion.label,
      correlations: row
    };
  });
}

function standardizeMatrix(matrix) {
  if (!matrix.length) return { standardized: [], means: [], sds: [] };

  const cols = matrix[0].length;
  const means = [];
  const sds = [];

  for (let columnIndex = 0; columnIndex < cols; columnIndex += 1) {
    const column = getColumn(matrix, columnIndex);
    means.push(mean(column));
    const sd = sampleSD(column);
    sds.push(sd === 0 ? 1 : sd);
  }

  const standardized = matrix.map((row) => row.map((value, j) => (value - means[j]) / sds[j]));
  return { standardized, means, sds };
}

function transpose(matrix) {
  if (!matrix.length) return [];
  return matrix[0].map((_, colIndex) => matrix.map((row) => row[colIndex]));
}

function multiplyMatrices(a, b) {
  const rowsA = a.length;
  const colsA = a[0].length;
  const colsB = b[0].length;
  const result = Array.from({ length: rowsA }, () => Array(colsB).fill(0));

  for (let i = 0; i < rowsA; i += 1) {
    for (let j = 0; j < colsB; j += 1) {
      for (let k = 0; k < colsA; k += 1) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }

  return result;
}

function covarianceMatrixFromStandardized(standardized) {
  const n = standardized.length;
  if (n < 2) return [];

  const zt = transpose(standardized);
  const product = multiplyMatrices(zt, standardized);
  return product.map((row) => row.map((value) => value / (n - 1)));
}

function vectorNorm(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, i) => sum + value * vector[i], 0));
}

function dot(a, b) {
  return a.reduce((sum, value, i) => sum + value * b[i], 0);
}

function normalizeVector(vector) {
  const norm = vectorNorm(vector);
  if (norm === 0) return vector.map(() => 0);
  return vector.map((value) => value / norm);
}

function outerProduct(a, b) {
  return a.map((av) => b.map((bv) => av * bv));
}

function subtractMatrices(a, b) {
  return a.map((row, i) => row.map((value, j) => value - b[i][j]));
}

function powerIteration(matrix, iterations = 100) {
  const size = matrix.length;
  let vector = Array(size).fill(1 / Math.sqrt(size));

  for (let i = 0; i < iterations; i += 1) {
    const next = multiplyMatrixVector(matrix, vector);
    vector = normalizeVector(next);
  }

  const mv = multiplyMatrixVector(matrix, vector);
  const eigenvalue = dot(vector, mv);

  return {
    eigenvalue,
    eigenvector: vector
  };
}

function deflateMatrix(matrix, eigenvalue, eigenvector) {
  const outer = outerProduct(eigenvector, eigenvector).map((row) => row.map((value) => value * eigenvalue));
  return subtractMatrices(matrix, outer);
}

function projectRows(matrix, components) {
  return matrix.map((row) => components.map((component) => dot(row, component)));
}

function computePCA2D() {
  const raw = getDataMatrix();

  if (!raw.length || !raw[0]?.length) {
    return {
      explainedVariance: [0, 0],
      eigenvalues: [0, 0],
      objectScores: [],
      variableLoadings: []
    };
  }

  const { standardized } = standardizeMatrix(raw);
  const cov = covarianceMatrixFromStandardized(standardized);

  if (!cov.length) {
    return {
      explainedVariance: [0, 0],
      eigenvalues: [0, 0],
      objectScores: [],
      variableLoadings: []
    };
  }

  const pc1 = powerIteration(cov, 120);
  const deflated = deflateMatrix(cov, pc1.eigenvalue, pc1.eigenvector);
  const pc2 = powerIteration(deflated, 120);
  const totalVariance = cov.reduce((sum, row, index) => sum + row[index], 0) || 1;
  const components = [pc1.eigenvector, pc2.eigenvector];
  const scores = projectRows(standardized, components);

  const objectScores = state.objects.map((obj, index) => ({
    name: obj.name,
    pc1: roundStat(scores[index]?.[0] ?? 0),
    pc2: roundStat(scores[index]?.[1] ?? 0)
  }));

  const variableLoadings = state.criteria.map((criterion, index) => ({
    criterion: `${criterion.left} ↔ ${criterion.right}`,
    pc1: roundStat((pc1.eigenvector[index] ?? 0) * Math.sqrt(Math.max(pc1.eigenvalue, 0))),
    pc2: roundStat((pc2.eigenvector[index] ?? 0) * Math.sqrt(Math.max(pc2.eigenvalue, 0)))
  }));

  return {
    explainedVariance: [
      roundStat((pc1.eigenvalue / totalVariance) * 100),
      roundStat((pc2.eigenvalue / totalVariance) * 100)
    ],
    eigenvalues: [roundStat(pc1.eigenvalue), roundStat(pc2.eigenvalue)],
    objectScores,
    variableLoadings
  };
}

function computeAnalysisResults() {
  return {
    descriptiveStats: computeDescriptiveStats(),
    correlations: computeCorrelationMatrix(),
    pca: computePCA2D()
  };
}

function renderDescriptiveStatsTable(stats) {
  const target = document.getElementById('statsTableWrap');
  if (!target) return;

  let html = `
    <table class="analysis-table">
      <thead>
        <tr>
          <th>Kriterium</th>
          <th>Mittelwert</th>
          <th>SD</th>
          <th>Min</th>
          <th>Max</th>
          <th>RMS</th>
        </tr>
      </thead>
      <tbody>
  `;

  stats.forEach((row) => {
    html += `
      <tr>
        <td>${escapeHtml(row.criterion)}</td>
        <td>${row.mean}</td>
        <td>${row.sd}</td>
        <td>${row.min}</td>
        <td>${row.max}</td>
        <td>${row.rms}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  target.innerHTML = html;
}

function renderCorrelationTable(correlations) {
  const target = document.getElementById('correlationTableWrap');
  if (!target) return;

  if (!correlations.length) {
    target.innerHTML = '';
    return;
  }

  const headers = Object.keys(correlations[0].correlations);

  let html = `
    <table class="analysis-table">
      <thead>
        <tr>
          <th>Kriterium</th>
          ${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
  `;

  correlations.forEach((row) => {
    html += `
      <tr>
        <td>${escapeHtml(row.criterion)}</td>
        ${headers.map((header) => `<td>${row.correlations[header]}</td>`).join('')}
      </tr>
    `;
  });

  html += '</tbody></table>';
  target.innerHTML = html;
}

function renderPCATables(pca) {
  const summaryTarget = document.getElementById('pcaSummary');
  const objectTarget = document.getElementById('pcaObjectsWrap');
  const variableTarget = document.getElementById('pcaVariablesWrap');

  if (summaryTarget) {
    summaryTarget.innerHTML = `
      <div class="analysis-cards">
        <div class="analysis-card">
          <strong>Varianz PC1</strong>
          <span>${pca.explainedVariance?.[0] ?? 0}%</span>
        </div>
        <div class="analysis-card">
          <strong>Varianz PC2</strong>
          <span>${pca.explainedVariance?.[1] ?? 0}%</span>
        </div>
        <div class="analysis-card">
          <strong>Eigenwert PC1</strong>
          <span>${pca.eigenvalues?.[0] ?? 0}</span>
        </div>
        <div class="analysis-card">
          <strong>Eigenwert PC2</strong>
          <span>${pca.eigenvalues?.[1] ?? 0}</span>
        </div>
      </div>
    `;
  }

  if (objectTarget) {
    let html = `
      <table class="analysis-table">
        <thead>
          <tr>
            <th>Objekt</th>
            <th>PC1</th>
            <th>PC2</th>
          </tr>
        </thead>
        <tbody>
    `;

    pca.objectScores.forEach((row) => {
      html += `
        <tr>
          <td>${escapeHtml(row.name)}</td>
          <td>${row.pc1}</td>
          <td>${row.pc2}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    objectTarget.innerHTML = html;
  }

  if (variableTarget) {
    let html = `
      <table class="analysis-table">
        <thead>
          <tr>
            <th>Kriterium</th>
            <th>PC1</th>
            <th>PC2</th>
          </tr>
        </thead>
        <tbody>
    `;

    pca.variableLoadings.forEach((row) => {
      html += `
        <tr>
          <td>${escapeHtml(row.criterion)}</td>
          <td>${row.pc1}</td>
          <td>${row.pc2}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    variableTarget.innerHTML = html;
  }
}

function renderAnalysis() {
  const results = computeAnalysisResults();
  renderDescriptiveStatsTable(results.descriptiveStats);
  renderCorrelationTable(results.correlations);
  renderPCATables(results.pca);
}

function exportAnalysisResults() {
  return {
    meta: {
      app: 'BiPlotteR – Prototyp 01',
      exportType: 'analysis',
      version: 1,
      exportedAt: new Date().toISOString()
    },
    state: {
      criteria: state.criteria,
      objects: state.objects
    },
    results: computeAnalysisResults()
  };
}

if (autoArrangeBtn) {
  autoArrangeBtn.addEventListener('click', handleAutoArrangeClick);
}

window.setTimeout(() => {
  renderAutoLayoutNotice();
}, 0);

/* =========================
   EVENTS
========================= */

document.getElementById('addCriterionBtn')?.addEventListener('click', () => {
  state.criteria.push({
    left: 'neuer Pol A',
    right: 'neuer Pol B',
    angle: 0,
    weight: 1
  });

  state.objects.forEach((obj) => obj.values.push(3));
  renderAll();
});

document.getElementById('addObjectBtn')?.addEventListener('click', () => {
  state.objects.push({
    name: `Objekt ${state.objects.length + 1}`,
    values: Array(state.criteria.length).fill(3)
  });
  renderAll();
});

plotSizeInput?.addEventListener('input', drawPlot);

avoidOverlapInput?.addEventListener('change', (event) => {
  state.settings.avoidOverlap = event.target.checked;
  drawPlot();
});

document.getElementById('resetBtn')?.addEventListener('click', () => {
  loadState(cloneDemo());
  showMessage('Demo-Daten geladen.');
});

document.getElementById('importBtn')?.addEventListener('click', () => {
  importFileInput?.click();
});

importFileInput?.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file) handleImportFile(file);
  event.target.value = '';
});

document.getElementById('exportBtn')?.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(exportState(), null, 2)], {
    type: 'application/json'
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'biplotter-prototyp-01.json';
  link.click();
  URL.revokeObjectURL(link.href);
  showMessage('JSON exportiert.');
});

document.getElementById('exportAnalysisBtn')?.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(exportAnalysisResults(), null, 2)], {
    type: 'application/json'
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'biplotter-analyse.json';
  link.click();
  URL.revokeObjectURL(link.href);
  showMessage('Analyse exportiert.');
});

loadState(cloneDemo());