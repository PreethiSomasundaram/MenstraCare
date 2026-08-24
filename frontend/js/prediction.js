// Prediction page logic.
// Field definitions below are derived from feature_columns.json / feature_info.json
// (all 30 features are numeric; the *_Y_N clinical symptom fields are rendered as
// Yes/No selects for usability, matching the underlying 0/1 coding).

const FIELD_GROUPS = [
  {
    title: "Basic information",
    fields: [
      { key: "Age_yrs", label: "Age (years)", min: 15, max: 55, step: 1, default: 28 },
      { key: "Weight_Kg", label: "Weight (kg)", min: 30, max: 130, step: 0.5, default: 60 },
      { key: "HeightCm", label: "Height (cm)", min: 130, max: 190, step: 0.5, default: 156 },
      { key: "BP__Systolic_mmHg", label: "BP — Systolic (mmHg)", min: 80, max: 180, step: 1, default: 110 },
      { key: "BP__Diastolic_mmHg", label: "BP — Diastolic (mmHg)", min: 50, max: 120, step: 1, default: 76 },
    ],
  },
  {
    title: "Menstrual cycle",
    fields: [
      { key: "CycleR_I", label: "Cycle (R/I) code", min: 2, max: 5, step: 1, default: 2, hint: "2 = Regular, 4 = Irregular" },
      { key: "Cycle_lengthdays", label: "Cycle length (days)", min: 0, max: 15, step: 1, default: 5 },
      { key: "PregnantY_N", label: "Currently pregnant?", binary: true, default: 0 },
      { key: "No._of_abortions", label: "Number of abortions", min: 0, max: 6, step: 1, default: 0 },
    ],
  },
  {
    title: "Hormonal profile",
    fields: [
      { key: "Hbg_dl", label: "Hemoglobin (g/dl)", min: 6, max: 16, step: 0.1, default: 11 },
      { key: "FSHmIU_mL", label: "FSH (mIU/mL)", min: 0, max: 20, step: 0.1, default: 5 },
      { key: "LHmIU_mL", label: "LH (mIU/mL)", min: 0, max: 20, step: 0.1, default: 3 },
      { key: "FSH_LH", label: "FSH/LH ratio", min: 0, max: 10, step: 0.01, default: 2 },
      { key: "TSH_mIU_L", label: "TSH (mIU/L)", min: 0, max: 20, step: 0.01, default: 2.3 },
      { key: "AMHng_mL", label: "AMH (ng/mL)", min: 0, max: 30, step: 0.1, default: 3.7 },
      { key: "PRLng_mL", label: "Prolactin (ng/mL)", min: 0, max: 60, step: 0.1, default: 22 },
      { key: "PRGng_mL", label: "Progesterone (ng/mL)", min: 0, max: 10, step: 0.01, default: 0.32 },
      { key: "RBSmg_dl", label: "Random blood sugar (mg/dl)", min: 50, max: 300, step: 1, default: 100 },
    ],
  },
  {
    title: "Symptoms & lifestyle",
    fields: [
      { key: "Weight_gainY_N", label: "Recent weight gain?", binary: true, default: 0 },
      { key: "hair_growthY_N", label: "Excess hair growth?", binary: true, default: 0 },
      { key: "Skin_darkening_Y_N", label: "Skin darkening?", binary: true, default: 0 },
      { key: "Hair_lossY_N", label: "Hair loss?", binary: true, default: 0 },
      { key: "PimplesY_N", label: "Pimples / acne?", binary: true, default: 0 },
      { key: "Fast_food_Y_N", label: "Regular fast food intake?", binary: true, default: 0 },
      { key: "Reg.ExerciseY_N", label: "Regular exercise?", binary: true, default: 0 },
    ],
  },
  {
    title: "Ultrasound findings",
    fields: [
      { key: "Follicle_No._L", label: "Follicle count — Left", min: 0, max: 30, step: 1, default: 5 },
      { key: "Follicle_No._R", label: "Follicle count — Right", min: 0, max: 30, step: 1, default: 6 },
      { key: "Avg._F_size_L_mm", label: "Avg. follicle size — Left (mm)", min: 0, max: 30, step: 0.1, default: 15 },
      { key: "Avg._F_size_R_mm", label: "Avg. follicle size — Right (mm)", min: 0, max: 30, step: 0.1, default: 16 },
      { key: "Endometrium_mm", label: "Endometrium thickness (mm)", min: 0, max: 25, step: 0.1, default: 8.5 },
    ],
  },
];

async function loadModelInfo() {
  const res = await fetch(`${API_BASE}/api/model-info`);
  if (!res.ok) throw new Error("Failed to load model info");
  return res.json();
}

function renderModelSelect(info) {
  const select = document.getElementById("model-select");
  select.innerHTML = "";
  info.models.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.key;
    opt.textContent = m.label + (m.available ? "" : " (unavailable)");
    opt.disabled = !m.available;
    select.appendChild(opt);
  });
  // Prefer Random Forest as the default selection if available.
  const preferred = info.models.find((m) => m.key === "random_forest" && m.available);
  if (preferred) select.value = preferred.key;
}

function renderForm() {
  const container = document.getElementById("form-sections");
  container.innerHTML = "";

  FIELD_GROUPS.forEach((group) => {
    const section = document.createElement("div");
    section.className = "form-section";

    const heading = document.createElement("h3");
    heading.textContent = group.title;
    section.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "form-grid";

    group.fields.forEach((field) => {
      const wrap = document.createElement("div");
      wrap.className = "field";

      const label = document.createElement("label");
      label.setAttribute("for", `field-${field.key}`);
      label.textContent = field.label;
      wrap.appendChild(label);

      if (field.binary) {
        const select = document.createElement("select");
        select.id = `field-${field.key}`;
        select.dataset.key = field.key;
        [
          { v: 0, t: "No" },
          { v: 1, t: "Yes" },
        ].forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt.v;
          o.textContent = opt.t;
          if (opt.v === field.default) o.selected = true;
          select.appendChild(o);
        });
        wrap.appendChild(select);
      } else {
        const input = document.createElement("input");
        input.type = "number";
        input.id = `field-${field.key}`;
        input.dataset.key = field.key;
        input.min = field.min;
        input.max = field.max;
        input.step = field.step;
        input.value = field.default;
        input.required = true;
        wrap.appendChild(input);
      }

      if (field.hint) {
        const hint = document.createElement("div");
        hint.className = "hint";
        hint.textContent = field.hint;
        wrap.appendChild(hint);
      }

      grid.appendChild(wrap);
    });

    section.appendChild(grid);
    container.appendChild(section);
  });
}

function collectFeatures() {
  const features = {};
  document.querySelectorAll("#form-sections [data-key]").forEach((el) => {
    features[el.dataset.key] = parseFloat(el.value);
  });
  return features;
}

async function submitPrediction(event) {
  event.preventDefault();
  const btn = document.getElementById("predict-btn");
  const errorBox = document.getElementById("predict-error");
  const resultPanel = document.getElementById("result-panel");

  errorBox.style.display = "none";
  resultPanel.classList.remove("visible");
  btn.disabled = true;
  btn.textContent = "Predicting…";

  try {
    const model = document.getElementById("model-select").value;
    const features = collectFeatures();

    const res = await fetch(`${API_BASE}/api/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, features }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Prediction failed");
    }

    showResult(data);
  } catch (err) {
    errorBox.textContent = err.message || "Something went wrong while predicting.";
    errorBox.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "Predict";
  }
}

function showResult(data) {
  const panel = document.getElementById("result-panel");
  const card = document.getElementById("result-card");
  const value = document.getElementById("result-value");
  const probability = document.getElementById("result-probability");
  const modelLabel = document.getElementById("result-model");

  const isPositive = data.prediction === 1;
  card.classList.remove("positive", "negative");
  card.classList.add(isPositive ? "positive" : "negative");

  value.textContent = data.label;
  probability.textContent = data.probability !== null && data.probability !== undefined
    ? `${(data.probability * 100).toFixed(1)}%`
    : "—";
  modelLabel.textContent = data.model_label;

  panel.classList.add("visible");
}

document.addEventListener("DOMContentLoaded", async () => {
  renderForm();
  document.getElementById("prediction-form").addEventListener("submit", submitPrediction);

  try {
    const info = await loadModelInfo();
    renderModelSelect(info);
  } catch (err) {
    const errorBox = document.getElementById("predict-error");
    errorBox.textContent = "Could not reach the backend API. Make sure the FastAPI server is running.";
    errorBox.style.display = "block";
  }
});
