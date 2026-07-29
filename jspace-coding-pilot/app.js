const DATA_URLS = [
  "data/jspace_trace_dashboard.json",
  "../public/data/jspace_trace_dashboard.json",
];

const state = {
  traces: [],
  traceId: "",
};

const elements = {
  headerStatus: document.querySelector("#headerStatus"),
  traceSelect: document.querySelector("#traceSelect"),
  modelName: document.querySelector("#modelName"),
  taskId: document.querySelector("#taskId"),
  traceVariant: document.querySelector("#traceVariant"),
  loadError: document.querySelector("#loadError"),
  loadErrorMessage: document.querySelector("#loadErrorMessage"),
  finalFailure: document.querySelector("#finalFailure"),
  failureKind: document.querySelector("#failureKind"),
  counterexample: document.querySelector("#counterexample"),
  errorWindow: document.querySelector("#errorWindow"),
  errorObservation: document.querySelector("#errorObservation"),
  journeySummary: document.querySelector("#journeySummary"),
  stageRail: document.querySelector("#stageRail"),
  stageSequence: document.querySelector("#stageSequence"),
  problemPrompt: document.querySelector("#problemPrompt"),
  responseText: document.querySelector("#responseText"),
};

const STATUS_LABELS = {
  normal: "过程快照",
  shift: "J-space 换挡",
  uncertain: "定义尚未厘清",
  error_visible: "首次看见走偏",
  after_error: "错误继续",
  final_failure: "最终失败",
  resolved: "内容已经算对",
};

const STAGE_LABELS = {
  reasoning: "思考过程",
  "answer transition": "准备输出答案",
  "final code": "最终代码",
  "未闭合思考 / termination": "未闭合思考",
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeConcept(concept, index) {
  if (typeof concept === "string") {
    return {
      id: `label:${concept}:${index}`,
      tokenId: null,
      label: concept,
      score: null,
      rank: index + 1,
      zScore: null,
    };
  }
  if (!concept || typeof concept !== "object") return null;
  const label = concept.label ?? concept.decoded ?? concept.token ?? concept.text;
  if (label === undefined || label === null || label === "") return null;
  const tokenId = isFiniteNumber(concept.token_id) ? concept.token_id : null;
  return {
    id: tokenId === null ? `label:${String(label)}:${index}` : `token:${tokenId}`,
    tokenId,
    label: String(label),
    score: isFiniteNumber(concept.score) ? concept.score : null,
    rank: isFiniteNumber(concept.rank) ? concept.rank : index + 1,
    zScore: isFiniteNumber(concept.z_score)
      ? concept.z_score
      : isFiniteNumber(concept.max_z_score)
        ? concept.max_z_score
        : null,
  };
}

function normalizeLayers(value) {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .map(([layer, concepts]) => ({
      layer: Number(layer),
      concepts: Array.isArray(concepts)
        ? concepts.map(normalizeConcept).filter(Boolean)
        : [],
    }))
    .filter((entry) => Number.isFinite(entry.layer))
    .sort((left, right) => left.layer - right.layer);
}

function normalizeCheckpoint(checkpoint, index, outputTokens) {
  const position = isFiniteNumber(checkpoint?.token_index)
    ? checkpoint.token_index
    : null;
  const concepts = Array.isArray(checkpoint?.jlens?.top_concepts)
    ? checkpoint.jlens.top_concepts.map(normalizeConcept).filter(Boolean)
    : [];
  const review =
    checkpoint?.review && typeof checkpoint.review === "object"
      ? checkpoint.review
      : {};
  return {
    id: String(
      checkpoint?.stage_id ?? checkpoint?.checkpoint_id ?? `stage-${index + 1}`,
    ),
    position,
    scanPosition: isFiniteNumber(checkpoint?.jlens?.nearest_scan_output_offset)
      ? checkpoint.jlens.nearest_scan_output_offset
      : position,
    progress:
      position !== null && outputTokens > 0
        ? Math.max(0, Math.min(1, position / outputTokens))
        : null,
    semanticStage:
      typeof checkpoint?.stage === "string" ? checkpoint.stage : "",
    context: typeof checkpoint?.context === "string" ? checkpoint.context : "",
    concepts,
    layers: normalizeLayers(checkpoint?.jlens?.layers),
    review: {
      title:
        typeof review.title === "string" && review.title
          ? review.title
          : `输出阶段 ${index + 1}`,
      reading:
        typeof review.reading === "string" && review.reading
          ? review.reading
          : "这个阶段尚未完成人工语义复核。",
      status:
        typeof review.status === "string" && review.status
          ? review.status
          : "normal",
    },
  };
}

function normalizeTrace(trace, index) {
  const outputTokens = isFiniteNumber(trace?.output_tokens)
    ? trace.output_tokens
    : 0;
  const humanReview =
    trace?.human_review && typeof trace.human_review === "object"
      ? trace.human_review
      : {};
  const text = (key) =>
    typeof humanReview[key] === "string" ? humanReview[key] : "";
  return {
    id: String(trace?.trace_id ?? `trace-${index + 1}`),
    label: String(trace?.display_name ?? trace?.task_id ?? `Trace ${index + 1}`),
    taskId: String(trace?.task_id ?? ""),
    model: String(trace?.model ?? ""),
    variant: String(trace?.variant ?? ""),
    outputTokens,
    prompt:
      typeof trace?.problem_prompt === "string" ? trace.problem_prompt : "",
    response:
      typeof trace?.response_text === "string" ? trace.response_text : "",
    review: {
      heroRank: isFiniteNumber(humanReview.hero_rank)
        ? humanReview.hero_rank
        : Number.POSITIVE_INFINITY,
      journeySummary: text("journey_summary"),
      errorWindow: text("error_window"),
      errorObservation: text("error_observation"),
      failureKind: text("failure_kind"),
      finalFailure: text("final_failure"),
      counterexample: text("counterexample"),
    },
    checkpoints: Array.isArray(trace?.jspace_stages)
      ? trace.jspace_stages
          .map((checkpoint, checkpointIndex) =>
            normalizeCheckpoint(checkpoint, checkpointIndex, outputTokens),
          )
          .sort((left, right) => {
            if (left.position === null) return 1;
            if (right.position === null) return -1;
            return left.position - right.position;
          })
      : Array.isArray(trace?.checkpoints)
        ? trace.checkpoints
          .map((checkpoint, checkpointIndex) =>
            normalizeCheckpoint(checkpoint, checkpointIndex, outputTokens),
          )
          .sort((left, right) => {
            if (left.position === null) return 1;
            if (right.position === null) return -1;
            return left.position - right.position;
          })
        : [],
  };
}

function traceById() {
  return state.traces.find((trace) => trace.id === state.traceId) ?? null;
}

function visibleToken(label) {
  const value = String(label)
    .replaceAll("\n", "↵")
    .replaceAll("\r", "↵")
    .replaceAll("\t", "⇥");
  const leading = value.match(/^ +/)?.[0].length ?? 0;
  return `${"␠".repeat(leading)}${value.slice(leading)}` || "∅";
}

function percent(value) {
  return isFiniteNumber(value) ? `${Math.round(value * 100)}%` : "—";
}

function semanticLabel(value) {
  return STAGE_LABELS[value] || value || "输出过程";
}

function variantLabel(value) {
  if (value === "completed-code failure") return "代码答案错误";
  if (value === "termination failure") return "未输出代码";
  return value || "失败 trace";
}

function statusLabel(value) {
  return STATUS_LABELS[value] || "过程快照";
}

function setHeaderStatus(kind, message) {
  elements.headerStatus.className = `header-status ${kind}`;
  elements.headerStatus.querySelector("span").textContent = message;
}

function appendTokenChip(container, concept, className = "") {
  const chip = document.createElement("code");
  chip.className = `token-chip${className ? ` ${className}` : ""}`;
  chip.textContent = visibleToken(concept.label);
  if (concept.score !== null || concept.zScore !== null) {
    const score =
      concept.score !== null ? `aggregate ${concept.score.toFixed(3)}` : "";
    const z = concept.zScore !== null ? `z ${concept.zScore.toFixed(2)}` : "";
    chip.title = [score, z].filter(Boolean).join(" · ");
  }
  container.append(chip);
}

function renderTraceOptions() {
  elements.traceSelect.replaceChildren();
  state.traces.forEach((trace) => {
    const option = document.createElement("option");
    option.value = trace.id;
    option.textContent = trace.label;
    elements.traceSelect.append(option);
  });
  elements.traceSelect.disabled = state.traces.length === 0;
  elements.traceSelect.value = state.traceId;
}

function renderSummary(trace) {
  elements.modelName.textContent = trace.model || "模型未标注";
  elements.taskId.textContent = trace.taskId || trace.id;
  elements.traceVariant.textContent = variantLabel(trace.variant);
  elements.finalFailure.textContent =
    trace.review.finalFailure || "最终失败原因尚未完成人工复核。";
  elements.failureKind.textContent =
    trace.review.failureKind || "失败类型未标注";
  elements.counterexample.textContent =
    trace.review.counterexample || "未提供";
  elements.errorWindow.textContent =
    trace.review.errorWindow || "现有数据无法定位";
  elements.errorObservation.textContent =
    trace.review.errorObservation ||
    "页面不会仅凭 Top-token 自动猜测错误起点。";
  elements.journeySummary.textContent =
    trace.review.journeySummary ||
    "沿六个输出快照比较原文与 J-space 词汇方向。";
}

function stageAnchor(index) {
  return `stage-${index + 1}`;
}

function renderStageRail(trace) {
  elements.stageRail.replaceChildren();
  trace.checkpoints.forEach((checkpoint, index) => {
    const link = document.createElement("a");
    link.href = `#${stageAnchor(index)}`;
    link.className = `rail-stage status-${checkpoint.review.status}`;
    link.setAttribute(
      "aria-label",
      `跳转到第 ${index + 1} 阶段：${checkpoint.review.title}`,
    );

    const top = document.createElement("span");
    const number = document.createElement("b");
    number.textContent = String(index + 1).padStart(2, "0");
    const progress = document.createElement("small");
    progress.textContent = percent(checkpoint.progress);
    top.append(number, progress);

    const title = document.createElement("strong");
    title.textContent = checkpoint.review.title;

    const words = document.createElement("em");
    const labels = checkpoint.concepts
      .slice(0, 2)
      .map((concept) => visibleToken(concept.label));
    words.textContent = labels.length ? labels.join(" · ") : "无可读代表词";

    link.append(top, title, words);
    elements.stageRail.append(link);
  });
}

function renderTokenRanking(checkpoint) {
  const list = document.createElement("ol");
  list.className = "jspace-token-list";
  if (!checkpoint.concepts.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "此快照没有可读的聚合代表词";
    list.append(empty);
    return list;
  }
  checkpoint.concepts.slice(0, 8).forEach((concept, index) => {
    const item = document.createElement("li");
    const rank = document.createElement("span");
    rank.className = "token-rank";
    rank.textContent = String(index + 1).padStart(2, "0");
    const token = document.createElement("code");
    token.textContent = visibleToken(concept.label);
    if (concept.score !== null || concept.zScore !== null) {
      const aggregate =
        concept.score !== null
          ? `aggregate ${concept.score.toFixed(3)}`
          : "";
      const z =
        concept.zScore !== null ? `max z ${concept.zScore.toFixed(2)}` : "";
      token.title = [aggregate, z].filter(Boolean).join(" · ");
    }
    item.append(rank, token);
    list.append(item);
  });
  return list;
}

function renderLayerDetails(checkpoint) {
  const details = document.createElement("details");
  details.className = "layer-details";
  const summary = document.createElement("summary");
  summary.textContent = "展开查看 L8–L24 的逐层原始词汇";
  details.append(summary);

  const rows = document.createElement("div");
  rows.className = "layer-rows";
  checkpoint.layers.forEach(({ layer, concepts }) => {
    const row = document.createElement("div");
    row.className = "layer-row";
    const label = document.createElement("strong");
    label.textContent = `L${layer}`;
    const tokens = document.createElement("div");
    if (!concepts.length) {
      const empty = document.createElement("i");
      empty.textContent = "无可读词汇";
      tokens.append(empty);
    } else {
      concepts.slice(0, 5).forEach((concept) => {
        appendTokenChip(tokens, concept);
      });
    }
    row.append(label, tokens);
    rows.append(row);
  });
  if (!checkpoint.layers.length) {
    const empty = document.createElement("p");
    empty.className = "layer-empty";
    empty.textContent = "这个快照没有逐层数据。";
    rows.append(empty);
  }
  details.append(rows);
  return details;
}

function renderStageCard(trace, checkpoint, index) {
  const card = document.createElement("article");
  card.className = `stage-card status-${checkpoint.review.status}`;
  card.id = stageAnchor(index);

  const head = document.createElement("header");
  head.className = "stage-card-head";
  const number = document.createElement("span");
  number.className = "stage-index";
  number.textContent = String(index + 1).padStart(2, "0");

  const heading = document.createElement("div");
  const kicker = document.createElement("p");
  kicker.className = "eyebrow";
  kicker.textContent = `${semanticLabel(checkpoint.semanticStage)} · ${percent(
    checkpoint.progress,
  )}`;
  const title = document.createElement("h2");
  title.textContent = checkpoint.review.title;
  heading.append(kicker, title);

  const meta = document.createElement("div");
  meta.className = "stage-meta";
  const status = document.createElement("span");
  status.className = "stage-status";
  status.textContent = statusLabel(checkpoint.review.status);
  const position = document.createElement("code");
  position.textContent =
    checkpoint.position === null
      ? "输出位置未记录"
      : `输出 ${checkpoint.position} / ${trace.outputTokens} token`;
  meta.append(status, position);
  head.append(number, heading, meta);

  const body = document.createElement("div");
  body.className = "stage-card-grid";

  const context = document.createElement("section");
  context.className = "context-window";
  const contextHead = document.createElement("header");
  const contextTitle = document.createElement("strong");
  contextTitle.textContent = "该位置附近的原文窗口";
  const contextMeta = document.createElement("small");
  contextMeta.textContent =
    checkpoint.scanPosition === checkpoint.position
      ? "TEXT SNAPSHOT"
      : `J-LENS SCAN ≈ ${checkpoint.scanPosition}`;
  contextHead.append(contextTitle, contextMeta);
  const pre = document.createElement("pre");
  pre.tabIndex = 0;
  pre.textContent = checkpoint.context || "此位置没有可显示的原文窗口。";
  context.append(contextHead, pre);

  const jspace = document.createElement("section");
  jspace.className = "jspace-window";
  const jspaceHead = document.createElement("header");
  const jspaceTitle = document.createElement("strong");
  jspaceTitle.textContent = "J-space 代表词（跨层聚合）";
  const jspaceMeta = document.createElement("small");
  jspaceMeta.textContent = "BASIC JACOBIAN LENS";
  jspaceHead.append(jspaceTitle, jspaceMeta);
  jspace.append(jspaceHead, renderTokenRanking(checkpoint));

  const reading = document.createElement("p");
  reading.className = "stage-reading";
  reading.textContent = checkpoint.review.reading;
  jspace.append(reading, renderLayerDetails(checkpoint));

  body.append(context, jspace);
  card.append(head, body);
  return card;
}

function conceptMap(checkpoint) {
  return new Map(checkpoint.concepts.map((concept) => [concept.id, concept]));
}

function renderDeltaTokens(container, concepts, className) {
  if (!concepts.length) {
    const empty = document.createElement("i");
    empty.textContent = "没有可显示的变化项";
    container.append(empty);
    return;
  }
  concepts.slice(0, 6).forEach((concept) => {
    appendTokenChip(container, concept, className);
  });
}

function renderTransition(before, after, index) {
  const beforeMap = conceptMap(before);
  const afterMap = conceptMap(after);
  const entered = after.concepts.filter((concept) => !beforeMap.has(concept.id));
  const exited = before.concepts.filter((concept) => !afterMap.has(concept.id));

  const transition = document.createElement("aside");
  transition.className = "stage-transition";
  transition.setAttribute(
    "aria-label",
    `第 ${index + 1} 到第 ${index + 2} 阶段的 J-space 变化`,
  );

  const head = document.createElement("header");
  const order = document.createElement("strong");
  order.textContent =
    `${String(index + 1).padStart(2, "0")} → ${String(index + 2).padStart(2, "0")}`;
  const label = document.createElement("span");
  label.textContent = "相邻阶段的词汇方向变化";
  head.append(order, label);

  const grid = document.createElement("div");
  grid.className = "transition-grid";
  const enteredBlock = document.createElement("section");
  const enteredLabel = document.createElement("b");
  enteredLabel.textContent = "+ 新进入";
  const enteredTokens = document.createElement("div");
  renderDeltaTokens(enteredTokens, entered, "entered");
  enteredBlock.append(enteredLabel, enteredTokens);

  const exitedBlock = document.createElement("section");
  const exitedLabel = document.createElement("b");
  exitedLabel.textContent = "− 退出";
  const exitedTokens = document.createElement("div");
  renderDeltaTokens(exitedTokens, exited, "exited");
  exitedBlock.append(exitedLabel, exitedTokens);
  grid.append(enteredBlock, exitedBlock);

  transition.append(head, grid);
  return transition;
}

function renderStageSequence(trace) {
  elements.stageSequence.replaceChildren();
  if (!trace.checkpoints.length) {
    const empty = document.createElement("div");
    empty.className = "sequence-placeholder";
    empty.textContent = "这条 trace 没有可显示的 J-space 快照。";
    elements.stageSequence.append(empty);
    return;
  }
  trace.checkpoints.forEach((checkpoint, index) => {
    elements.stageSequence.append(
      renderStageCard(trace, checkpoint, index),
    );
    if (index < trace.checkpoints.length - 1) {
      elements.stageSequence.append(
        renderTransition(checkpoint, trace.checkpoints[index + 1], index),
      );
    }
  });
}

function renderTrace() {
  const trace = traceById();
  if (!trace) return;
  renderTraceOptions();
  renderSummary(trace);
  renderStageRail(trace);
  renderStageSequence(trace);
  elements.problemPrompt.textContent =
    trace.prompt || "这条 trace 没有原始题面。";
  elements.responseText.textContent =
    trace.response || "这条 trace 没有完整输出文本。";
}

async function loadDashboard() {
  try {
    let payload = null;
    const failures = [];
    for (const url of DATA_URLS) {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          failures.push(`${url}: HTTP ${response.status}`);
          continue;
        }
        payload = await response.json();
        break;
      } catch (error) {
        failures.push(`${url}: ${error instanceof Error ? error.message : error}`);
      }
    }
    if (!payload) {
      throw new Error(failures.join("；"));
    }
    if (!Array.isArray(payload?.traces) || payload.traces.length === 0) {
      throw new Error("JSON 中没有 traces");
    }
    state.traces = payload.traces
      .map(normalizeTrace)
      .sort((left, right) => left.review.heroRank - right.review.heroRank);
    state.traceId = state.traces[0].id;
    elements.loadError.hidden = true;
    renderTrace();
    const stageCount = state.traces.reduce(
      (total, trace) => total + trace.checkpoints.length,
      0,
    );
    setHeaderStatus(
      "ready",
      `${state.traces.length} 条 trace · ${stageCount} 个 J-space 快照`,
    );
  } catch (error) {
    elements.loadError.hidden = false;
    elements.loadErrorMessage.textContent =
      error instanceof Error ? error.message : String(error);
    elements.traceSelect.disabled = true;
    setHeaderStatus("error", "实验数据载入失败");
  }
}

elements.traceSelect.addEventListener("change", (event) => {
  state.traceId = event.target.value;
  renderTrace();
  document.querySelector("#replay")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
});

loadDashboard();
