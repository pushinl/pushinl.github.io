"use strict";

const DATA_URL = "data/failure_onset_dashboard.json";
const Z_95 = 1.959963984540054;

let payload = null;
let activeTraceIndex = 0;
let activeCheckpointIndex = 0;

const byId = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function markerValue(value) {
  if (Number.isFinite(value)) return { measured: true, position: value };
  if (
    value &&
    typeof value === "object" &&
    value.measurement_status === "measured" &&
    Number.isFinite(value.position)
  ) {
    return { measured: true, position: value.position };
  }
  return { measured: false, position: null };
}

function wilson(passCount, sampleCount) {
  if (!sampleCount) return { lower: 0, upper: 0 };
  const p = passCount / sampleCount;
  const z2 = Z_95 * Z_95;
  const denominator = 1 + z2 / sampleCount;
  const center = (p + z2 / (2 * sampleCount)) / denominator;
  const spread =
    (Z_95 / denominator) *
    Math.sqrt((p * (1 - p)) / sampleCount + z2 / (4 * sampleCount * sampleCount));
  return {
    lower: Math.max(0, center - spread),
    upper: Math.min(1, center + spread),
  };
}

function pct(value, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`;
}

function markerCard(label, value, kind, description) {
  const marker = markerValue(value);
  return `
    <article class="marker ${kind} ${marker.measured ? "" : "unmeasured"}">
      <span>${escapeHtml(label)}</span>
      <strong>${marker.measured ? `t=${marker.position}` : "未测量"}</strong>
      <small>${escapeHtml(description)}</small>
    </article>
  `;
}

function traceOutcome(trace) {
  const judge = trace.evidence?.judge || {};
  if (judge.reason === "no_valid_python_extracted") return "终止失败 · 无有效代码";
  const base = judge.base?.status || "unknown";
  const plus = judge.plus?.status || "unknown";
  return `MBPP ${base} · MBPP+ ${plus}`;
}

function renderTabs() {
  const root = byId("trace-tabs");
  root.innerHTML = payload.traces
    .map(
      (trace, index) => `
        <button
          class="trace-tab"
          type="button"
          role="tab"
          aria-selected="${index === activeTraceIndex}"
          data-trace-index="${index}"
        >
          <strong>${escapeHtml(trace.task_id)}</strong>
          <span>${trace.output_tokens} output tokens · 6 checkpoints</span>
        </button>
      `,
    )
    .join("");
  root.querySelectorAll(".trace-tab").forEach((button) => {
    button.addEventListener("click", () => {
      activeTraceIndex = Number(button.dataset.traceIndex);
      const trace = payload.traces[activeTraceIndex];
      const repr = markerValue(trace.t_repr);
      const nearest = repr.measured
        ? trace.checkpoints.reduce(
            (best, point, index) =>
              Math.abs(point.token_index - repr.position) <
              Math.abs(trace.checkpoints[best].token_index - repr.position)
                ? index
                : best,
            0,
          )
        : 0;
      activeCheckpointIndex = nearest;
      render();
    });
  });
}

function renderMarkers(trace) {
  byId("marker-grid").innerHTML = [
    markerCard("t_text", trace.t_text, "text", "文本首错 · 未做人类逐 token 标注"),
    markerCard("t_repr", trace.t_repr, "repr", "J-lens 概念变化候选"),
    markerCard("t_decision", trace.t_decision, "decision", "替代动作干预 · 本轮未运行"),
    markerCard("t_lock-in", trace.t_lock_in, "lock", "后续前缀持续低可恢复"),
  ].join("");
}

function checkpointClasses(trace, checkpoint, index) {
  const classes = ["checkpoint"];
  if (index === activeCheckpointIndex) classes.push("selected");
  if (checkpoint.pass_count === 0) classes.push("danger");
  const repr = markerValue(trace.t_repr);
  const lock = markerValue(trace.t_lock_in);
  if (repr.measured && checkpoint.token_index === repr.position) classes.push("repr");
  if (lock.measured && checkpoint.token_index === lock.position) classes.push("lock");
  return classes.join(" ");
}

function renderTimeline(trace) {
  const root = byId("timeline");
  root.innerHTML = trace.checkpoints
    .map((checkpoint, index) => {
      const rate = checkpoint.pass_count / checkpoint.sample_count;
      const interval = wilson(checkpoint.pass_count, checkpoint.sample_count);
      return `
        <button
          type="button"
          class="${checkpointClasses(trace, checkpoint, index)}"
          data-checkpoint-index="${index}"
          aria-label="token ${checkpoint.token_index}, ${checkpoint.pass_count}/${checkpoint.sample_count} 通过"
        >
          <span class="token">t=${checkpoint.token_index}</span>
          <strong class="passes">${checkpoint.pass_count}/${checkpoint.sample_count}</strong>
          <span class="interval">95% CI ${pct(interval.lower)}–${pct(interval.upper)}</span>
          <span class="viability-track"><i style="width:${rate * 100}%"></i></span>
        </button>
      `;
    })
    .join("");
  root.querySelectorAll(".checkpoint").forEach((button) => {
    button.addEventListener("click", () => {
      activeCheckpointIndex = Number(button.dataset.checkpointIndex);
      renderTimeline(trace);
      renderCheckpoint(trace);
    });
  });
}

function renderCheckpoint(trace) {
  const checkpoint = trace.checkpoints[activeCheckpointIndex];
  const rate = checkpoint.pass_count / checkpoint.sample_count;
  const interval = wilson(checkpoint.pass_count, checkpoint.sample_count);
  byId("checkpoint-title").textContent =
    `${checkpoint.checkpoint_id} · token ${checkpoint.token_index}`;
  byId("checkpoint-rate").textContent =
    `${pct(rate)} pass (${checkpoint.pass_count}/${checkpoint.sample_count})`;
  byId("checkpoint-meta").innerHTML = [
    `阶段 ${checkpoint.stage || "unknown"}`,
    `95% Wilson ${pct(interval.lower, 1)}–${pct(interval.upper, 1)}`,
    `J metric ${trace.jspace_metric}`,
    `最近扫描点 ${checkpoint.jlens?.nearest_scan_output_offset ?? "—"}`,
  ]
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join("");

  const concepts = checkpoint.jlens?.top_concepts || [];
  byId("concepts").innerHTML =
    concepts
      .slice(0, 12)
      .map(
        (item) =>
          `<span class="concept">${escapeHtml(item.label.trim() || "∅")} <b>${Number(item.score).toFixed(2)}</b></span>`,
      )
      .join("") || '<span class="concept">无可用概念</span>';
  byId("checkpoint-context").textContent = checkpoint.context || "未测量";
}

function renderTraceNote(trace) {
  const note =
    trace.task_id === "Mbpp/137"
      ? "Mbpp/137 从 prompt 边界就是 0/8；t_repr=614 是后续表征变化，不能被解释为“首次开始失败”。"
      : `该 trace 的 t_repr 比 t_lock-in 早 ${
          markerValue(trace.t_lock_in).position - markerValue(trace.t_repr).position
        } token；这是值得扩大样本验证的预测性线索，而非因果结论。`;
  byId("trace-note").textContent = note;
}

function render() {
  const trace = payload.traces[activeTraceIndex];
  renderTabs();
  byId("trace-domain").textContent =
    `${trace.model} · ${trace.domain} · ${trace.variant}`;
  byId("trace-title").textContent = trace.display_name || trace.task_id;
  byId("trace-description").textContent = trace.description || "";
  byId("trace-outcome").textContent = traceOutcome(trace);
  renderMarkers(trace);
  renderTimeline(trace);
  renderCheckpoint(trace);
  renderTraceNote(trace);
  byId("problem-prompt").textContent = trace.problem_prompt || "未测量";
  byId("response-text").textContent = trace.response_text || "未测量";
  byId("trace-view").hidden = false;
  byId("load-status").textContent =
    `${payload.trace_count} traces · schema v${payload.schema_version} · 静态公开数据`;
}

async function loadData() {
  byId("load-error").hidden = true;
  byId("load-status").textContent = "正在加载公开数据…";
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.traces) || data.traces.length !== 3) {
      throw new Error("预期 3 条 trace，但数据契约不匹配");
    }
    if (data.traces.some((trace) => trace.checkpoints?.length !== 6)) {
      throw new Error("checkpoint 数据不完整");
    }
    payload = data;
    activeTraceIndex = 0;
    activeCheckpointIndex = 0;
    render();
  } catch (error) {
    byId("load-status").textContent = "加载失败";
    const box = byId("load-error");
    box.hidden = false;
    box.querySelector("p").textContent =
      `${error?.message || "未知错误"}。请刷新页面后重试。`;
  }
}

byId("retry-button").addEventListener("click", loadData);
loadData();
