// Application logic for the modular BiPlot interface.
//
// This module wires together the Utils, Stats and Plot helpers with
// the DOM and manages the interactive state of the application.  It
// replicates the behaviour of the original monolithic script while
// keeping most computational logic in separate modules.  A new
// setting `markNegativeLoadingsRed` is introduced to control
// whether the negative halves of criterion axes are coloured red in
// both manual and exact plots.

(function () {
  /**
   * Global application state.  Criteria and objects are stored as
   * arrays and may be modified by the user via the UI.  The
   * settings object contains UI toggles that affect rendering.  The
   * plotMode toggles between 'manual' and 'exact'.  When in exact
   * mode the computed PCA results are cached in `exactBiplot` to
   * avoid unnecessary recomputation.
   */
  window.state = {
    criteria: [],
    objects: [],
    settings: {
      avoidOverlap: true,
      // new: whether to draw the negative half of each criterion
      // axis in red.  Disabled by default so that all axes start
      // with a uniform appearance until the user opts in.
      markNegativeLoadingsRed: false
    },
    plotMode: 'manual', // 'manual' | 'exact'
    exactBiplot: null
  };

  /**
   * Default demonstration state.  This mirrors the content from the
   * original script and is used when resetting the UI or on first
   * load.  It is defined separately so that it can be cloned
   * without carrying over any reactive references.
   */
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
      avoidOverlap: true,
      markNegativeLoadingsRed: false
    }
  };

  // Cache DOM references once for efficiency.  These are looked up
  // immediately when the script runs and reused thereafter.
  const criteriaList = document.getElementById('criteriaList');
  const matrixTable = document.getElementById('matrixTable');
  const objectsControls = document.getElementById('objectsControls');
  const plot = document.getElementById('plot');
  const plotWrapper = document.getElementById('plotWrapper');
  const criterionTemplate = document.getElementById('criterionTemplate');
  const messageBox = document.getElementById('messageBox');
  const plotSizeInput = document.getElementById('plotSizeInput');
  const avoidOverlapInput = document.getElementById('avoidOverlapInput');
  const toggleNegativeRedInput = document.getElementById('toggleNegativeRed');
  const importFileInput = document.getElementById('importFileInput');
  const autoArrangeBtn = document.getElementById('autoArrangeBtn');
  const autoLayoutNotice = document.getElementById('autoLayoutNotice');
  const exactBiplotBtn = document.getElementById('exactBiplotBtn');
  const freeModeBtn = document.getElementById('freeModeBtn');

  /**
   * Create a deep copy of the demo state.  JSON methods suffice
   * since the state is composed of simple data types.
   *
   * @returns {object}
   */
  function cloneDemo() {
    return JSON.parse(JSON.stringify(demoState));
  }

  /**
   * Sanitize and normalise an external state object (for example
   * loaded via JSON import) to protect against missing values or
   * invalid types.  This function returns a new object containing
   * validated criteria, objects and settings.  Invalid input
   * results in thrown errors which are caught by the caller.
   *
   * @param {object} raw
   * @returns {{criteria:array,objects:array,settings:object}}
   */
  function sanitizeState(raw) {
    const source = raw && typeof raw === 'object' && raw.state ? raw.state : raw;
    if (!source || typeof source !== 'object') {
      throw new Error('JSON hat keine gültige Struktur.');
    }
    const criteria = Array.isArray(source.criteria)
      ? source.criteria.map((criterion, index) => ({
          left: String(criterion?.left ?? `Pol A ${index + 1}`),
          right: String(criterion?.right ?? `Pol B ${index + 1}`),
          angle: Utils.normalizeAngle(criterion?.angle ?? 0),
          weight: Utils.clamp(criterion?.weight ?? 1, 0.2, 2.5, 1)
        }))
      : [];
    if (criteria.length === 0) {
      throw new Error('Es wurde kein Kriterium gefunden.');
    }
    const objects = Array.isArray(source.objects)
      ? source.objects.map((obj, index) => ({
          name: String(obj?.name ?? `Objekt ${index + 1}`),
          values: Array.isArray(obj?.values)
            ? obj.values.map((value) => Math.round(Utils.clamp(value, 1, 6, 3)))
            : []
        }))
      : [];
    const settings = {
      avoidOverlap: Boolean(source?.settings?.avoidOverlap ?? true),
      // default to false when missing to prevent unsolicited red
      // highlighting of negative axes
      markNegativeLoadingsRed: Boolean(source?.settings?.markNegativeLoadingsRed ?? false)
    };
    return { criteria, objects, settings };
  }

  /**
   * Load a new state into the global state object.  This helper
   * merges the sanitised values with existing defaults and resets
   * derived properties such as plot mode and cached PCA results.
   *
   * @param {object} newState
   */
  function loadState(newState) {
    const safeState = sanitizeState(newState);
    state.criteria = safeState.criteria;
    state.objects = safeState.objects;
    // Merge settings to preserve any future flags while updating
    // avoidOverlap and markNegativeLoadingsRed from the import
    state.settings = { ...state.settings, ...safeState.settings };
    state.plotMode = 'manual';
    state.exactBiplot = null;
    ensureMatrixConsistency();
    // Reflect toggles in the UI
    if (avoidOverlapInput) {
      avoidOverlapInput.checked = state.settings.avoidOverlap;
    }
    if (toggleNegativeRedInput) {
      toggleNegativeRedInput.checked = state.settings.markNegativeLoadingsRed;
    }
    renderAll();
  }

  /**
   * Ensure that each object's values array matches the number of
   * criteria.  Missing entries are filled with a neutral value of
   * 3 and extra entries are truncated.  All values are clamped to
   * the range 1–6 and rounded to the nearest integer.  This
   * function modifies objects in place.
   */
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
      obj.values = obj.values.map((value) => Math.round(Utils.clamp(value, 1, 6, 3)));
    });
  }

  /**
   * Reset the cached PCA results and switch back to manual mode if
   * currently in exact mode.  This should be called whenever the
   * underlying data changes so that the next render uses a fresh
   * analysis.
   */
  function invalidateExactMode() {
    state.exactBiplot = null;
    if (state.plotMode === 'exact') {
      state.plotMode = 'manual';
    }
  }

  /**
   * Display a temporary message to the user.  Messages can be
   * classified as 'success' or 'error'.  The message fades after
   * roughly four seconds.  When the message box is not present the
   * function silently returns.
   *
   * @param {string} text
   * @param {'success'|'error'} [type='success']
   */
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

  /**
   * Render the informational banner that explains the status of
   * automatic criterion arrangement and PCA.  When in exact mode it
   * shows the explained variance of PC1 and PC2; when auto layout
   * is applied it summarises redundancy; otherwise it displays a
   * general hint.  If no result is passed the default hint is
   * shown.
   *
   * @param {object|null} result
   */
  function renderAutoLayoutNotice(result = null) {
    if (!autoLayoutNotice) return;
    if (state.plotMode === 'exact') {
      const exact = state.exactBiplot;
      const explained = exact?.pca?.explainedVariance?.length >= 2
        ? Math.round((exact.pca.explainedVariance[0] + exact.pca.explainedVariance[1]) * 100)
        : null;
      autoLayoutNotice.className = 'auto-layout-notice is-ok';
      autoLayoutNotice.innerHTML = `
        <strong>Exakter Biplot aktiv</strong>
        <span>
          Die Grafik wird jetzt direkt aus der Matrix per PCA berechnet.
          Winkel und freie Anordnung steuern den Plot in diesem Modus nicht.
          ${explained !== null ? ` PC1/PC2 erklären hier ungefähr ${explained}% der Gesamtstruktur.` : ''}
        </span>
      `;
      return;
    }
    if (!result) {
      autoLayoutNotice.className = 'auto-layout-notice';
      autoLayoutNotice.innerHTML = `
        <strong>Hinweis zur Auto‑Anordnung</strong>
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
            const a = Utils.escapeHtml(pair.labelA);
            const b = Utils.escapeHtml(pair.labelB);
            const corr = Number.isFinite(pair.corr) ? pair.corr.toFixed(2) : '0.00';
            return `${a} / ${b} (${pair.relation}, r=${corr})`;
          })
          .join('; ')
      : 'Keine stark redundanten Kriterienpaare erkannt.';
    const explained = Array.isArray(result.explainedVariance) && result.explainedVariance.length >= 2
      ? Math.round((result.explainedVariance[0] + result.explainedVariance[1]) * 100)
      : null;
    autoLayoutNotice.className = `auto-layout-notice ${result.redundantPairs && result.redundantPairs.length ? 'is-warning' : 'is-ok'}`;
    autoLayoutNotice.innerHTML = `
      <strong>Auto‑Anordnung angewendet</strong>
      <span>
        Berufe/Objekte dürfen ähnlich sein. Kriterien sollten sich jedoch unterscheiden.
        ${pairText}
        ${explained !== null ? ` PC1/PC2 erklären hier ungefähr ${explained}% der Kriteriumsstruktur.` : ''}
      </span>
    `;
  }

  /**
   * Render every part of the UI.  This helper calls separate
   * functions for criteria controls, object controls, the matrix,
   * the plot and the analysis.  It also resets the auto layout
   * notice.
   */
  function renderAll() {
    ensureMatrixConsistency();
    renderCriteriaControls();
    renderObjectControls();
    renderMatrix();
    Plot.drawPlot(state, plot, plotWrapper, plotSizeInput);
    renderAnalysis();
    renderAutoLayoutNotice();
  }

  /**
   * Handler for the auto arrange button.  Delegates to
   * BiPlotteRAutoLayout (provided by auto-layout.js) to compute new
   * angles and redundant pairs.  If run successfully the state is
   * updated and the UI re‑rendered.  Auto arrange is disabled
   * during exact mode.
   */
  function handleAutoArrangeClick() {
    if (state.plotMode === 'exact') {
      showMessage('Auto‑Anordnung ist im exakten Biplot‑Modus nicht relevant. Bitte erst freien Modus aktivieren.', 'error');
      return;
    }
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
        state.criteria[index].angle = Utils.normalizeAngle(angle);
      });
      renderAll();
      renderAutoLayoutNotice(result);
      const pairCount = Array.isArray(result.redundantPairs) ? result.redundantPairs.length : 0;
      const message = pairCount > 0
        ? `Auto‑Anordnung aktiv. ${pairCount} stark ähnliche oder gegensätzliche Kriterienpaare erkannt.`
        : 'Auto‑Anordnung aktiv. Keine starke Kriterien‑Redundanz erkannt.';
      showMessage(message, 'success');
    } catch (error) {
      showMessage(`Auto‑Anordnung fehlgeschlagen: ${error.message}`, 'error');
    }
  }

  /**
   * Render the list of criteria controls.  Each criterion is
   * represented by a card with inputs for left/right labels, angle
   * and weight.  Event listeners are attached inline to update the
   * state and re-render relevant parts of the UI when changes
   * occur.
   */
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
        invalidateExactMode();
        renderMatrix();
        Plot.drawPlot(state, plot, plotWrapper, plotSizeInput);
        renderAnalysis();
        renderAutoLayoutNotice();
      });
      rightInput.addEventListener('input', (event) => {
        criterion.right = event.target.value;
        invalidateExactMode();
        renderMatrix();
        Plot.drawPlot(state, plot, plotWrapper, plotSizeInput);
        renderAnalysis();
        renderAutoLayoutNotice();
      });
      angleInput.addEventListener('input', (event) => {
        criterion.angle = Utils.normalizeAngle(event.target.value);
        angleValue.textContent = `${criterion.angle}°`;
        Plot.drawPlot(state, plot, plotWrapper, plotSizeInput);
        renderAutoLayoutNotice();
      });
      weightInput.addEventListener('input', (event) => {
        criterion.weight = Utils.clamp(event.target.value, 0.2, 2.5, 1);
        weightValue.textContent = `${criterion.weight}`;
        Plot.drawPlot(state, plot, plotWrapper, plotSizeInput);
        renderAutoLayoutNotice();
      });
      removeBtn.addEventListener('click', () => {
        state.criteria.splice(index, 1);
        state.objects.forEach((obj) => obj.values.splice(index, 1));
        if (state.criteria.length === 0) {
          state.criteria.push({ left: 'neuer Pol A', right: 'neuer Pol B', angle: 0, weight: 1 });
        }
        invalidateExactMode();
        renderAll();
      });
      criteriaList.appendChild(node);
    });
  }

  /**
   * Render the list of object controls.  Each object row contains
   * an input for the name and a remove button.  Changes to names
   * immediately update the state and re-render the matrix, plot and
   * analysis tables.
   */
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
        invalidateExactMode();
        renderMatrix();
        Plot.drawPlot(state, plot, plotWrapper, plotSizeInput);
        renderAnalysis();
        renderAutoLayoutNotice();
      });
      label.appendChild(input);
      const removeBtn = document.createElement('button');
      removeBtn.className = 'danger';
      removeBtn.textContent = 'Entfernen';
      removeBtn.addEventListener('click', () => {
        state.objects.splice(index, 1);
        invalidateExactMode();
        renderAll();
      });
      row.appendChild(label);
      row.appendChild(removeBtn);
      objectsControls.appendChild(row);
    });
  }

  /**
   * Render the data matrix table.  Each cell of the matrix
   * contains an input for the numeric value.  Changing a value
   * updates the corresponding object's values array and triggers
   * re-rendering of the plot and analysis.  Object names are
   * editable directly in the table and update the object controls.
   */
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
      th.innerHTML = `${Utils.escapeHtml(criterion.left)}<br><small>↔ ${Utils.escapeHtml(criterion.right)}</small>`;
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
        invalidateExactMode();
        renderObjectControls();
        Plot.drawPlot(state, plot, plotWrapper, plotSizeInput);
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
          obj.values[criterionIndex] = Math.round(Utils.clamp(event.target.value, 1, 6, 3));
          event.target.value = obj.values[criterionIndex];
          invalidateExactMode();
          Plot.drawPlot(state, plot, plotWrapper, plotSizeInput);
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

  /**
   * Compute analysis results (descriptive statistics, correlations
   * and PCA) by delegating to Stats.  Always passes the current
   * state explicitly.
   *
   * @returns {{descriptiveStats:object[],correlations:object[],pca:object}}
   */
  function computeAnalysisResults() {
    return Stats.computeAnalysisResults(state);
  }

  /**
   * Render the descriptive statistics, correlation matrix and PCA
   * tables.  Uses helper functions defined below to build HTML
   * tables and inserts them into their respective containers.
   */
  function renderAnalysis() {
    const results = state.exactBiplot ?? computeAnalysisResults();
    renderDescriptiveStatsTable(results.descriptiveStats);
    renderCorrelationTable(results.correlations);
    renderPCATables(results.pca);
  }

  /**
   * Render a table of descriptive statistics.  The table has
   * columns for mean, standard deviation, min, max and RMS.
   *
   * @param {object[]} stats
   */
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
          <td>${Utils.escapeHtml(row.criterion)}</td>
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

  /**
   * Render a correlation matrix table.  The first column lists
   * criterion names and subsequent columns list correlation
   * coefficients.  When there is no data the target is cleared.
   *
   * @param {object[]} correlations
   */
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
            ${headers.map((header) => `<th>${Utils.escapeHtml(header)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
    `;
    correlations.forEach((row) => {
      html += `
        <tr>
          <td>${Utils.escapeHtml(row.criterion)}</td>
          ${headers.map((header) => `<td>${row.correlations[header]}</td>`).join('')}
        </tr>
      `;
    });
    html += '</tbody></table>';
    target.innerHTML = html;
  }

  /**
   * Render the PCA summary and component tables.  The summary
   * displays explained variance and eigenvalues for PC1 and PC2.
   * Separate tables list the object scores and variable loadings.
   *
   * @param {object} pca
   */
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
            <td>${Utils.escapeHtml(row.name)}</td>
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
            <td>${Utils.escapeHtml(row.criterion)}</td>
            <td>${row.pc1}</td>
            <td>${row.pc2}</td>
          </tr>
        `;
      });
      html += '</tbody></table>';
      variableTarget.innerHTML = html;
    }
  }

  /**
   * Export the current state to a JSON object suitable for saving
   * to disk.  Includes meta information for versioning.  The
   * analysis results are not included as they can be recomputed.
   *
   * @returns {object}
   */
  function exportState() {
    return {
      meta: {
        app: 'BiPlotteR – Prototyp 01 (Modular)',
        version: 4,
        exportedAt: new Date().toISOString()
      },
      state: {
        criteria: state.criteria,
        objects: state.objects,
        settings: state.settings
      }
    };
  }

  /**
   * Export the current analysis results along with the state.  This
   * is used for saving a complete snapshot of the analysis.
   *
   * @returns {object}
   */
  function exportAnalysisResults() {
    const results = state.exactBiplot ?? computeAnalysisResults();
    return {
      meta: {
        app: 'BiPlotteR – Prototyp 01 (Modular)',
        exportType: 'analysis',
        version: 2,
        exportedAt: new Date().toISOString()
      },
      state: {
        criteria: state.criteria,
        objects: state.objects
      },
      plotMode: state.plotMode,
      results
    };
  }

  /**
   * Handle reading a JSON file selected by the user.  The file is
   * parsed and passed to loadState.  Errors during parsing are
   * communicated to the user.
   *
   * @param {File} file
   */
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

  /**
   * Activate exact PCA mode.  Computes fresh analysis results via
   * Stats and caches them on the state.  Then re-renders the plot
   * and analysis panels accordingly.
   */
  function activateExactBiplot() {
    const results = computeAnalysisResults();
    state.exactBiplot = results;
    state.plotMode = 'exact';
    Plot.drawPlot(state, plot, plotWrapper, plotSizeInput);
    renderAnalysis();
    renderAutoLayoutNotice();
    showMessage('Exakter Biplot aus der Matrix berechnet.');
  }

  /**
   * Activate manual (free) mode.  Resets the plot mode and redraws
   * the plot and analysis.
   */
  function activateManualMode() {
    state.plotMode = 'manual';
    Plot.drawPlot(state, plot, plotWrapper, plotSizeInput);
    renderAnalysis();
    renderAutoLayoutNotice();
    showMessage('Freier Modus aktiviert.');
  }

  // Bind top-level event listeners.  These attach handlers to
  // various buttons and inputs on page load.  The optional chaining
  // guards prevent errors if an element is not present in the DOM.
  if (autoArrangeBtn) {
    autoArrangeBtn.addEventListener('click', handleAutoArrangeClick);
  }
  if (exactBiplotBtn) {
    exactBiplotBtn.addEventListener('click', activateExactBiplot);
  }
  if (freeModeBtn) {
    freeModeBtn.addEventListener('click', activateManualMode);
  }
  // Plot size slider
  plotSizeInput?.addEventListener('input', () => {
    Plot.drawPlot(state, plot, plotWrapper, plotSizeInput);
  });
  // Avoid overlap toggle
  avoidOverlapInput?.addEventListener('change', (event) => {
    state.settings.avoidOverlap = event.target.checked;
    Plot.drawPlot(state, plot, plotWrapper, plotSizeInput);
  });
  // Negative red toggle
  toggleNegativeRedInput?.addEventListener('change', (event) => {
    state.settings.markNegativeLoadingsRed = event.target.checked;
    Plot.drawPlot(state, plot, plotWrapper, plotSizeInput);
  });
  // Reset button
  document.getElementById('resetBtn')?.addEventListener('click', () => {
    loadState(cloneDemo());
    showMessage('Demo-Daten geladen.');
  });
  // Import button
  document.getElementById('importBtn')?.addEventListener('click', () => {
    importFileInput?.click();
  });
  importFileInput?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) handleImportFile(file);
    // Reset the input so that selecting the same file again triggers change
    event.target.value = '';
  });
  // Export state button
  document.getElementById('exportBtn')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(exportState(), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'biplotter-prototyp-01.json';
    link.click();
    URL.revokeObjectURL(link.href);
    showMessage('JSON exportiert.');
  });
  // Export analysis button
  document.getElementById('exportAnalysisBtn')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(exportAnalysisResults(), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'biplotter-analyse.json';
    link.click();
    URL.revokeObjectURL(link.href);
    showMessage('Analyse exportiert.');
  });
  // Add criterion button
  document.getElementById('addCriterionBtn')?.addEventListener('click', () => {
    state.criteria.push({
      left: 'neuer Pol A',
      right: 'neuer Pol B',
      angle: 0,
      weight: 1
    });
    state.objects.forEach((obj) => obj.values.push(3));
    invalidateExactMode();
    renderAll();
  });
  // Add object button
  document.getElementById('addObjectBtn')?.addEventListener('click', () => {
    state.objects.push({
      name: `Objekt ${state.objects.length + 1}`,
      values: Array(state.criteria.length).fill(3)
    });
    invalidateExactMode();
    renderAll();
  });
  // Initial render: set up initial state and display the demo
  window.setTimeout(() => {
    // Load the demo state into the app
    loadState(cloneDemo());
    // Render the default auto layout notice
    renderAutoLayoutNotice();
  }, 0);
})();