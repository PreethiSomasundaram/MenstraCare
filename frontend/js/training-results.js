// Training Results page logic — everything rendered here comes from
// /api/training-results, which is backed by model_performance.json and
// values computed directly from the training notebook / trained pipelines.

let trainingData = null;
const charts = {};

const MODEL_ORDER = ["logistic_regression", "random_forest", "svm"];
const MODEL_COLORS = {
  logistic_regression: "#6a4cff",
  random_forest: "#1f9d63",
  svm: "#e8863a",
};

async function loadTrainingResults() {
  const res = await fetch(`${API_BASE}/api/training-results`);
  if (!res.ok) throw new Error("Failed to load training results");
  return res.json();
}

function renderDatasetStats(dataset) {
  const container = document.getElementById("dataset-stats");
  const items = [
    { label: "Total records (after cleaning)", value: dataset.total_records },
    { label: "Predictors used", value: dataset.total_features },
    { label: "Training set size", value: dataset.train_size },
    { label: "Test set size", value: dataset.test_size },
  ];
  container.innerHTML = items
    .map(
      (i) => `
      <div class="stat-card">
        <div class="stat-label">${i.label}</div>
        <div class="stat-value">${i.value}</div>
      </div>`
    )
    .join("");
}

function bestValues(comparison) {
  const metrics = ["accuracy", "precision", "recall", "f1_score", "roc_auc"];
  const best = {};
  metrics.forEach((m) => {
    best[m] = Math.max(...comparison.map((row) => row[m]));
  });
  return best;
}

function renderComparisonTable(comparison) {
  const body = document.getElementById("comparison-body");
  const best = bestValues(comparison);
  const metrics = ["accuracy", "precision", "recall", "f1_score", "roc_auc"];

  body.innerHTML = comparison
    .map((row) => {
      const cells = metrics
        .map((m) => {
          const isBest = row[m] === best[m];
          const pct = (row[m] * 100).toFixed(2) + "%";
          return `<td class="${isBest ? "best-cell" : ""}">${pct}${isBest ? " &#9733;" : ""}</td>`;
        })
        .join("");
      return `<tr><td>${row.model}</td>${cells}</tr>`;
    })
    .join("");
}

function renderComparisonChart(comparison) {
  const ctx = document.getElementById("comparison-chart");
  const colors = chartThemeColors();
  const metrics = [
    { key: "accuracy", label: "Accuracy" },
    { key: "precision", label: "Precision" },
    { key: "recall", label: "Recall" },
    { key: "f1_score", label: "F1 Score" },
    { key: "roc_auc", label: "ROC-AUC" },
  ];

  const datasets = comparison.map((row) => ({
    label: row.model,
    data: metrics.map((m) => +(row[m] * 100).toFixed(2)),
    backgroundColor: MODEL_COLORS[row.key] || colors.accent,
    borderRadius: 4,
  }));

  if (charts.comparison) charts.comparison.destroy();
  charts.comparison = new Chart(ctx, {
    type: "bar",
    data: { labels: metrics.map((m) => m.label), datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom", labels: { color: colors.text } },
      },
      scales: {
        x: { ticks: { color: colors.muted }, grid: { color: colors.grid } },
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { color: colors.muted, callback: (v) => v + "%" },
          grid: { color: colors.grid },
        },
      },
    },
  });
}

function renderRocChart(rocCurves, comparison) {
  const ctx = document.getElementById("roc-chart");
  const colors = chartThemeColors();

  const aucByKey = {};
  comparison.forEach((row) => (aucByKey[row.key] = row.roc_auc));

  const datasets = MODEL_ORDER.filter((key) => rocCurves[key]).map((key) => {
    const curve = rocCurves[key];
    const points = curve.fpr.map((f, i) => ({ x: f, y: curve.tpr[i] }));
    const modelRow = comparison.find((r) => r.key === key);
    return {
      label: `${modelRow ? modelRow.model : key} (AUC = ${aucByKey[key].toFixed(3)})`,
      data: points,
      borderColor: MODEL_COLORS[key],
      backgroundColor: "transparent",
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.15,
    };
  });

  // Random-guess reference line
  datasets.push({
    label: "Random classifier",
    data: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    borderColor: colors.muted,
    borderDash: [6, 6],
    borderWidth: 1.5,
    pointRadius: 0,
  });

  if (charts.roc) charts.roc.destroy();
  charts.roc = new Chart(ctx, {
    type: "scatter",
    data: { datasets },
    options: {
      responsive: true,
      showLine: true,
      plugins: {
        legend: { position: "bottom", labels: { color: colors.text } },
      },
      scales: {
        x: {
          title: { display: true, text: "False Positive Rate", color: colors.muted },
          min: 0,
          max: 1,
          ticks: { color: colors.muted },
          grid: { color: colors.grid },
        },
        y: {
          title: { display: true, text: "True Positive Rate", color: colors.muted },
          min: 0,
          max: 1,
          ticks: { color: colors.muted },
          grid: { color: colors.grid },
        },
      },
    },
  });
}

function renderConfusionMatrices(matrices, comparison) {
  const container = document.getElementById("confusion-grid");
  container.innerHTML = MODEL_ORDER.filter((key) => matrices[key])
    .map((key) => {
      const m = matrices[key];
      const modelRow = comparison.find((r) => r.key === key);
      const [[tn, fp], [fn, tp]] = m.matrix;
      return `
        <div class="card">
          <h3>${modelRow ? modelRow.model : key}</h3>
          <div class="confusion-matrix">
            <div class="confusion-cell correct">
              <div class="cm-value">${tn}</div>
              <div class="cm-label">True Negative</div>
            </div>
            <div class="confusion-cell incorrect">
              <div class="cm-value">${fp}</div>
              <div class="cm-label">False Positive</div>
            </div>
            <div class="confusion-cell incorrect">
              <div class="cm-value">${fn}</div>
              <div class="cm-label">False Negative</div>
            </div>
            <div class="confusion-cell correct">
              <div class="cm-value">${tp}</div>
              <div class="cm-label">True Positive</div>
            </div>
          </div>
        </div>`;
    })
    .join("");
}

function renderFeatureImportance(featureImportance) {
  const ctx = document.getElementById("feature-importance-chart");
  const colors = chartThemeColors();

  const sorted = [...featureImportance].sort((a, b) => a.importance - b.importance);

  if (charts.featureImportance) charts.featureImportance.destroy();
  charts.featureImportance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sorted.map((f) => f.feature),
      datasets: [
        {
          label: "Importance",
          data: sorted.map((f) => f.importance),
          backgroundColor: colors.accent,
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: colors.muted }, grid: { color: colors.grid } },
        y: { ticks: { color: colors.text }, grid: { display: false } },
      },
    },
  });
}

function renderAll(data) {
  renderDatasetStats(data.dataset);
  renderComparisonTable(data.comparison);
  renderComparisonChart(data.comparison);
  renderRocChart(data.roc_curves, data.comparison);
  renderConfusionMatrices(data.confusion_matrices, data.comparison);
  renderFeatureImportance(data.feature_importance);
}

document.addEventListener("DOMContentLoaded", async () => {
  const loading = document.getElementById("loading");
  const errorBox = document.getElementById("error");
  const content = document.getElementById("content");

  try {
    trainingData = await loadTrainingResults();
    loading.style.display = "none";
    content.style.display = "block";
    renderAll(trainingData);
  } catch (err) {
    loading.style.display = "none";
    errorBox.textContent = "Could not reach the backend API. Make sure the FastAPI server is running.";
    errorBox.style.display = "block";
  }
});

window.addEventListener("menstracare-theme-changed", () => {
  if (trainingData) renderAll(trainingData);
});
