const DATA_URL = "data/failure_onset_dashboard.json";
const Z_95 = 1.96;

const state = {
  traces: [],
  traceId: "",
  checkpointId: "",
};

const elements = {
  headerStatus: document.querySelector("#headerStatus"),
  traceSelect: document.querySelector("#traceSelect"),
  modelName: document.querySelector("#modelName"),
  taskId: document.querySelector("#taskId"),
  traceVariant: document.querySelector("#traceVariant"),
  loadError: document.querySelector("#loadError"),
  loadErrorMessage: document.querySelector("#loadErrorMessage"),
  replayTitle: document.querySelector("#replayTitle"),
  verdictDetail: document.querySelector("#verdictDetail"),
  verdictOrder: document.querySelector("#verdictOrder strong"),
  markerText: document.querySelector("#markerText strong"),
  markerRepr: document.querySelector("#markerRepr strong"),
  markerDecision: document.querySelector("#markerDecision strong"),
  markerLock: document.querySelector("#markerLock strong"),
  failureKind: document.querySelector("#failureKind"),
  finalFailure: document.querySelector("#finalFailure"),
  counterexample: document.querySelector("#counterexample"),
  judgeSummary: document.querySelector("#judgeSummary"),
  signalVerdict: document.querySelector("#signalVerdict"),
  reprReading: document.querySelector("#reprReading"),
  lockReading: document.querySelector("#lockReading"),
  viabilitySequence: document.querySelector("#viabilitySequence"),
  timelinePlot: document.querySelector("#timelinePlot"),
  checkpointTitle: document.querySelector("#checkpointTitle"),
  checkpointStage: document.querySelector("#checkpointStage"),
  passFraction: document.querySelector("#passFraction"),
  passPercent: document.querySelector("#passPercent"),
  passCi: document.querySelector("#passCi"),
  passNumber: document.querySelector(".pass-number"),
  branchDots: document.querySelector("#branchDots"),
  contextPosition: document.querySelector("#contextPosition"),
  checkpointContext: document.querySelector("#checkpointContext"),
  jScoreShift: document.querySelector("#jScoreShift"),
  jChangeLead: document.querySelector("#jChangeLead"),
  reprBefore: document.querySelector("#reprBefore"),
  reprAfter: document.querySelector("#reprAfter"),
  conceptRiver: document.querySelector("#conceptRiver"),
  addedMeta: document.querySelector("#addedMeta"),
  removedMeta: document.querySelector("#removedMeta"),
  changedMeta: document.querySelector("#changedMeta"),
  addedConcepts: document.querySelector("#addedConcepts"),
  removedConcepts: document.querySelector("#removedConcepts"),
  changedConcepts: document.querySelector("#changedConcepts"),
  problemPrompt: document.querySelector("#problemPrompt"),
  responseText: document.querySelector("#responseText"),
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function measuredMarker(value) {
  if (isFiniteNumber(value)) return { measured: true, position: value };
  if (!value || typeof value !== "object") {
    return { measured: false, position: null };
  }
  const status = String(value.measurement_status || value.status || "")
    .toLowerCase()
    .replaceAll("-", "_");
  if (
    status.includes("unmeasured") ||
    status.includes("not_measured") ||
    status.includes("missing") ||
    status.includes("not_run")
  ) {
    return { measured: false, position: null };
  }
  const position = [
    value.position,
    value.token_index,
    value.token,
    value.t,
  ].find(isFiniteNumber);
  return {
    measured: isFiniteNumber(position),
    position: isFiniteNumber(position) ? position : null,
  };
}

function wilsonInterval(successes, total) {
  if (
    !isFiniteNumber(successes) ||
    !isFiniteNumber(total) ||
    total <= 0 ||
    successes < 0 ||
    successes > total
  ) {
    return null;
  }
  const p = successes / total;
  const z2 = Z_95 * Z_95;
  const denominator = 1 + z2 / total;
  const center = p + z2 / (2 * total);
  const spread =
    Z_95 *
    Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
  return {
    low: Math.max(0, (center - spread) / denominator),
    high: Math.min(1, (center + spread) / denominator),
  };
}

function normalizeConcept(concept, index) {
  if (typeof concept === "string") {
    return { id: `${concept}-${index}`, label: concept, score: null, maxZ: null };
  }
  if (!concept || typeof concept !== "object") return null;
  const label = concept.label ?? concept.concept ?? concept.token ?? concept.text;
  if (label === undefined || label === null || label === "") return null;
  return {
    id: `${String(label)}-${index}`,
    label: String(label),
    score: isFiniteNumber(concept.score) ? concept.score : null,
    maxZ: isFiniteNumber(concept.max_z_score) ? concept.max_z_score : null,
  };
}

function normalizeCheckpoint(checkpoint, index) {
  const position = isFiniteNumber(checkpoint?.token_index)
    ? checkpoint.token_index
    : null;
  const passCount = isFiniteNumber(checkpoint?.pass_count)
    ? checkpoint.pass_count
    : null;
  const sampleCount = isFiniteNumber(checkpoint?.sample_count)
    ? checkpoint.sample_count
    : null;
  const passRate =
    passCount !== null && sampleCount !== null && sampleCount > 0
      ? passCount / sampleCount
      : null;
  const concepts = Array.isArray(checkpoint?.jlens?.top_concepts)
    ? checkpoint.jlens.top_concepts
        .map(normalizeConcept)
        .filter(Boolean)
    : [];
  return {
    id: String(
      checkpoint?.checkpoint_id ??
        (position !== null ? `t-${position}` : `checkpoint-${index + 1}`),
    ),
    position,
    passCount,
    sampleCount,
    passRate,
    ci: wilsonInterval(passCount, sampleCount),
    stage:
      typeof checkpoint?.stage === "string" && checkpoint.stage
        ? checkpoint.stage
        : "",
    context:
      typeof checkpoint?.context === "string" ? checkpoint.context : "",
    candidateScore: isFiniteNumber(checkpoint?.jlens?.concept_score)
      ? checkpoint.jlens.concept_score
      : null,
    concepts,
  };
}

function normalizeTrace(trace, index) {
  const checkpoints = Array.isArray(trace?.checkpoints)
    ? trace.checkpoints
        .map(normalizeCheckpoint)
        .sort((a, b) => {
          if (a.position === null) return 1;
          if (b.position === null) return -1;
          return a.position - b.position;
        })
    : [];
  const domainStart = isFiniteNumber(trace?.domain?.start)
    ? trace.domain.start
    : checkpoints.find((checkpoint) => checkpoint.position !== null)?.position ?? 0;
  const lastPosition = [...checkpoints]
    .reverse()
    .find((checkpoint) => checkpoint.position !== null)?.position;
  const domainEnd = isFiniteNumber(trace?.domain?.end)
    ? trace.domain.end
    : lastPosition ?? domainStart;
  const review =
    trace?.human_review && typeof trace.human_review === "object"
      ? trace.human_review
      : {};
  const reviewText = (key) =>
    typeof review[key] === "string" ? review[key] : "";
  return {
    id: String(trace?.trace_id ?? `trace-${index + 1}`),
    label: String(trace?.display_name ?? trace?.task_id ?? `Trace ${index + 1}`),
    taskId: String(trace?.task_id ?? ""),
    model: String(trace?.model ?? ""),
    variant: String(trace?.variant ?? ""),
    description: String(trace?.description ?? ""),
    prompt:
      typeof trace?.problem_prompt === "string" ? trace.problem_prompt : "",
    response:
      typeof trace?.response_text === "string" ? trace.response_text : "",
    humanReview: {
      heroRank: isFiniteNumber(review.hero_rank)
        ? review.hero_rank
        : Number.POSITIVE_INFINITY,
      answer: reviewText("answer"),
      failureKind: reviewText("failure_kind"),
      finalFailure: reviewText("final_failure"),
      signalVerdict: reviewText("signal_verdict"),
      counterexample: reviewText("counterexample"),
      judgeSummary: reviewText("judge_summary"),
      reprBefore: reviewText("repr_before"),
      reprAfter: reviewText("repr_after"),
      reprReading: reviewText("repr_reading"),
      lockReading: reviewText("lock_in_reading"),
      viabilitySequence: reviewText("viability_sequence"),
    },
    tText: measuredMarker(trace?.t_text),
    tRepr: measuredMarker(trace?.t_repr),
    tDecision: measuredMarker(trace?.t_decision),
    tLock: measuredMarker(trace?.t_lock_in),
    domainStart,
    domainEnd: Math.max(domainStart, domainEnd),
    checkpoints,
  };
}

function traceById() {
  return state.traces.find((trace) => trace.id === state.traceId) ?? null;
}

function checkpointById(trace) {
  return (
    trace?.checkpoints.find((checkpoint) => checkpoint.id === state.checkpointId) ??
    trace?.checkpoints[0] ??
    null
  );
}

function scalePosition(trace, position) {
  if (!isFiniteNumber(position)) return null;
  if (trace.domainEnd === trace.domainStart) return 50;
  return Math.max(
    0,
    Math.min(
      100,
      ((position - trace.domainStart) /
        (trace.domainEnd - trace.domainStart)) *
        100,
    ),
  );
}

function formatPercent(value) {
  if (!isFiniteNumber(value)) return "未测量";
  return `${(value * 100).toFixed(value === 0 || value === 1 ? 0 : 1)}%`;
}

function formatScore(value) {
  return isFiniteNumber(value) ? value.toFixed(3) : "未测量";
}

function visibleConcept(label) {
  const text = String(label).replaceAll("\n", "↵").replaceAll("\t", "⇥");
  const leading = text.match(/^ +/)?.[0].length ?? 0;
  return `${"␠".repeat(leading)}${text.slice(leading)}` || "∅";
}

function setHeaderStatus(kind, text) {
  elements.headerStatus.className = `header-status ${kind}`;
  elements.headerStatus.querySelector("span").textContent = text;
}

function defaultCheckpoint(trace) {
  if (!trace) return null;
  const preferredMarker = trace.tLock.measured ? trace.tLock : trace.tRepr;
  if (preferredMarker.measured) {
    const exact = trace.checkpoints.find(
      (checkpoint) => checkpoint.position === preferredMarker.position,
    );
    if (exact) return exact;
    const nearest = [...trace.checkpoints]
      .filter((checkpoint) => checkpoint.position !== null)
      .sort(
        (a, b) =>
          Math.abs(a.position - preferredMarker.position) -
          Math.abs(b.position - preferredMarker.position),
      )[0];
    if (nearest) return nearest;
  }
  return trace.checkpoints[0] ?? null;
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

function renderVerdict(trace) {
  elements.modelName.textContent = trace.model || "模型未测量";
  elements.taskId.textContent = trace.taskId || trace.id;
  elements.traceVariant.textContent = trace.variant || "失败 trace";
  elements.markerText.textContent = trace.tText.measured
    ? `t=${trace.tText.position}`
    : "未测量";
  elements.markerRepr.textContent = trace.tRepr.measured
    ? `t=${trace.tRepr.position}`
    : "未测量";
  elements.markerDecision.textContent = trace.tDecision.measured
    ? `t=${trace.tDecision.position}`
    : "未测量";
  elements.markerLock.textContent = trace.tLock.measured
    ? `t=${trace.tLock.position}`
    : "未测量";

  const reviewedAnswer = trace.humanReview.answer;
  if (trace.tRepr.measured && trace.tLock.measured) {
    if (trace.tLock.position === 0) {
      elements.replayTitle.textContent =
        reviewedAnswer ||
        `这条轨迹从 t=0 起已经锁死；到 t=${trace.tRepr.position} 才观察到 J-space 异常候选。`;
      elements.verdictDetail.textContent =
        "8 次分支从起点就全部失败，因此这里不能把较晚出现的表征信号解释成造成 lock-in 的先行证据。";
      elements.verdictOrder.textContent =
        `t_lock-in=0 → t_repr=${trace.tRepr.position}`;
    } else if (trace.tRepr.position < trace.tLock.position) {
      const delta = trace.tLock.position - trace.tRepr.position;
      elements.replayTitle.textContent =
        reviewedAnswer ||
        `J-space 在 t=${trace.tRepr.position} 开始异常；到 t=${trace.tLock.position}，轨迹失去恢复能力。`;
      elements.verdictDetail.textContent =
        `表征候选领先 lock-in ${delta} 个 output token；这是一段值得加密采样和干预的风险窗口，不是因果结论。`;
      elements.verdictOrder.textContent =
        `t_repr=${trace.tRepr.position} → Δ${delta} → t_lock-in=${trace.tLock.position}`;
    } else {
      elements.replayTitle.textContent =
        reviewedAnswer ||
        `轨迹在 t=${trace.tLock.position} 锁死；J-space 候选到 t=${trace.tRepr.position} 才出现。`;
      elements.verdictDetail.textContent =
        "表征候选没有领先于失去恢复能力，不能作为早期预警信号。";
      elements.verdictOrder.textContent =
        `t_lock-in=${trace.tLock.position} → t_repr=${trace.tRepr.position}`;
    }
  } else {
    elements.replayTitle.textContent = "关键 onset 尚未完整测量。";
    elements.verdictDetail.textContent =
      "页面不会用文本分叉、checkpoint 曲线或其他 trace 的数值补齐缺失 marker。";
    elements.verdictOrder.textContent = "未测量";
  }

  elements.failureKind.textContent =
    trace.humanReview.failureKind || "未测量";
  elements.finalFailure.textContent =
    trace.humanReview.finalFailure || "未测量";
  elements.counterexample.textContent =
    trace.humanReview.counterexample || "未测量";
  elements.judgeSummary.textContent =
    trace.humanReview.judgeSummary || "未测量";
  elements.signalVerdict.textContent =
    trace.humanReview.signalVerdict || "未测量";
  elements.reprReading.textContent =
    trace.humanReview.reprReading || "J-space 人工复核未测量。";
  elements.lockReading.textContent =
    trace.humanReview.lockReading || "lock-in 人工复核未测量。";
  elements.viabilitySequence.textContent = trace.humanReview.viabilitySequence
    ? `viability · ${trace.humanReview.viabilitySequence}`
    : "viability · 未测量";
}

function addMarkerLine(plot, trace, marker, label, className) {
  if (!marker.measured) return;
  const left = scalePosition(trace, marker.position);
  const line = document.createElement("div");
  const edge = left < 7 ? " edge-start" : left > 93 ? " edge-end" : "";
  line.className = `timeline-marker-line ${className}${edge}`;
  line.style.left = `${left}%`;
  const tag = document.createElement("span");
  tag.textContent = `${label} · t=${marker.position}`;
  line.append(tag);
  plot.append(line);
}

function addZone(track, start, end, className) {
  if (end <= start) return;
  const zone = document.createElement("div");
  zone.className = `recovery-zone ${className}`;
  zone.style.left = `${start}%`;
  zone.style.width = `${end - start}%`;
  track.append(zone);
}

function renderTimeline(trace, selectedCheckpoint) {
  const plot = elements.timelinePlot;
  plot.replaceChildren();

  const content = document.createElement("div");
  content.className = "timeline-content";
  const track = document.createElement("div");
  track.className = "recovery-track";
  const reprPercent = trace.tRepr.measured
    ? scalePosition(trace, trace.tRepr.position)
    : null;
  const lockPercent = trace.tLock.measured
    ? scalePosition(trace, trace.tLock.position)
    : null;

  if (lockPercent !== null) {
    const riskStart =
      reprPercent !== null && reprPercent < lockPercent
        ? reprPercent
        : lockPercent;
    addZone(track, 0, riskStart, "green");
    addZone(track, riskStart, lockPercent, "yellow");
    addZone(track, lockPercent, 100, "red");
  } else if (reprPercent !== null) {
    addZone(track, 0, reprPercent, "green");
    addZone(track, reprPercent, 100, "yellow");
  } else {
    addZone(track, 0, 100, "green");
  }
  content.append(track);

  addMarkerLine(content, trace, trace.tRepr, "t_repr", "");
  addMarkerLine(content, trace, trace.tLock, "t_lock-in", "lock");

  trace.checkpoints
    .filter((checkpoint) => checkpoint.position !== null)
    .forEach((checkpoint) => {
      const left = scalePosition(trace, checkpoint.position);
      const button = document.createElement("button");
      const riskClass =
        checkpoint.passRate === 0
          ? "locked"
          : checkpoint.passRate !== null && checkpoint.passRate <= 0.25
            ? "risk"
            : "";
      button.className =
        `checkpoint-dot ${riskClass}` +
        (selectedCheckpoint?.id === checkpoint.id ? " selected" : "");
      button.style.left = `${left}%`;
      button.type = "button";
      button.textContent =
        checkpoint.passCount !== null && checkpoint.sampleCount !== null
          ? `${checkpoint.passCount}/${checkpoint.sampleCount}`
          : "—";
      button.setAttribute(
        "aria-label",
        `查看 t=${checkpoint.position} checkpoint，通过率 ${formatPercent(
          checkpoint.passRate,
        )}`,
      );
      button.addEventListener("click", () => {
        state.checkpointId = checkpoint.id;
        renderCheckpointSelection();
      });
      content.append(button);

      const tick = document.createElement("span");
      tick.className = "checkpoint-tick";
      tick.style.left = `${left}%`;
      tick.textContent = `t=${checkpoint.position}`;
      content.append(tick);
    });

  const start = document.createElement("span");
  start.className = "axis-end start";
  start.textContent = `start · t=${trace.domainStart}`;
  const end = document.createElement("span");
  end.className = "axis-end end";
  end.textContent = `end · t=${trace.domainEnd}`;
  plot.append(content, start, end);
}

function renderCheckpoint(checkpoint) {
  if (!checkpoint) {
    elements.checkpointTitle.textContent = "t=—";
    elements.checkpointStage.textContent = "未测量";
    elements.passFraction.textContent = "—/—";
    elements.passPercent.textContent = "未测量";
    elements.passCi.textContent = "95% Wilson CI · 未测量";
    elements.passNumber.classList.remove("zero");
    elements.branchDots.replaceChildren();
    elements.contextPosition.textContent = "position 未测量";
    elements.checkpointContext.textContent = "未测量";
    return;
  }
  elements.checkpointTitle.textContent =
    checkpoint.position === null ? "t=未测量" : `t=${checkpoint.position}`;
  elements.checkpointStage.textContent = checkpoint.stage || "未测量";
  elements.passFraction.textContent =
    checkpoint.passCount !== null && checkpoint.sampleCount !== null
      ? `${checkpoint.passCount}/${checkpoint.sampleCount}`
      : "—/—";
  elements.passPercent.textContent = formatPercent(checkpoint.passRate);
  elements.passCi.textContent = checkpoint.ci
    ? `95% Wilson CI · ${formatPercent(checkpoint.ci.low)}–${formatPercent(
        checkpoint.ci.high,
      )}`
    : "95% Wilson CI · 未测量";
  elements.passNumber.classList.toggle("zero", checkpoint.passRate === 0);
  elements.contextPosition.textContent =
    checkpoint.position === null
      ? "position 未测量"
      : `output token ${checkpoint.position}`;
  elements.checkpointContext.textContent = checkpoint.context || "未测量";

  elements.branchDots.replaceChildren();
  if (
    checkpoint.passCount !== null &&
    checkpoint.sampleCount !== null &&
    checkpoint.sampleCount > 0
  ) {
    for (let index = 0; index < checkpoint.sampleCount; index += 1) {
      const dot = document.createElement("i");
      if (index < checkpoint.passCount) dot.className = "pass";
      dot.setAttribute("aria-hidden", "true");
      elements.branchDots.append(dot);
    }
    elements.branchDots.setAttribute(
      "aria-label",
      `${checkpoint.passCount} 个通过，${
        checkpoint.sampleCount - checkpoint.passCount
      } 个失败`,
    );
  } else {
    elements.branchDots.setAttribute("aria-label", "分支结果未测量");
  }
}

function conceptMap(checkpoint) {
  const map = new Map();
  checkpoint?.concepts.forEach((concept, index) => {
    const key = concept.label;
    if (!map.has(key)) map.set(key, { ...concept, rank: index + 1 });
  });
  return map;
}

function fillConceptList(list, entries, kind) {
  list.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent =
      kind === "changed" ? "没有共同概念，无法计算同名分数变化" : "没有观测到";
    list.append(empty);
    return;
  }
  entries.slice(0, 7).forEach((entry, index) => {
    const item = document.createElement("li");
    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = String(index + 1).padStart(2, "0");
    const label = document.createElement("span");
    label.className = "concept-label";
    label.textContent = visibleConcept(entry.label);
    const value = document.createElement("span");
    value.className = "concept-value";
    if (kind === "changed") {
      const sign = entry.delta > 0 ? "+" : "";
      value.textContent = `${sign}${entry.delta.toFixed(3)}`;
    } else {
      value.textContent = isFiniteNumber(entry.score)
        ? `score ${entry.score.toFixed(3)}`
        : "score 未测量";
    }
    item.append(rank, label, value);
    list.append(item);
  });
}

function renderJChange(trace) {
  elements.reprBefore.textContent =
    trace.humanReview.reprBefore || "未测量";
  elements.reprAfter.textContent =
    trace.humanReview.reprAfter || "未测量";
  if (!trace.tRepr.measured || !trace.checkpoints.length) {
    elements.jScoreShift.textContent = "未测量";
    elements.jChangeLead.textContent =
      "t_repr 未测量，页面不会选择替代 checkpoint 伪造前后对比。";
    elements.addedMeta.textContent = "未测量";
    elements.removedMeta.textContent = "未测量";
    elements.changedMeta.textContent = "未测量";
    fillConceptList(elements.addedConcepts, [], "added");
    fillConceptList(elements.removedConcepts, [], "removed");
    fillConceptList(elements.changedConcepts, [], "changed");
    return;
  }
  const at =
    trace.checkpoints.find(
      (checkpoint) => checkpoint.position === trace.tRepr.position,
    ) ??
    [...trace.checkpoints]
      .filter((checkpoint) => checkpoint.position !== null)
      .sort(
        (a, b) =>
          Math.abs(a.position - trace.tRepr.position) -
          Math.abs(b.position - trace.tRepr.position),
      )[0];
  const before = [...trace.checkpoints]
    .filter(
      (checkpoint) =>
        checkpoint.position !== null &&
        at?.position !== null &&
        checkpoint.position < at.position,
    )
    .sort((a, b) => b.position - a.position)[0];

  if (!at || !before) {
    elements.jScoreShift.textContent = "未测量";
    elements.jChangeLead.textContent =
      "t_repr 前没有可用 checkpoint，无法构造真实的前后对比。";
    elements.addedMeta.textContent = "未测量";
    elements.removedMeta.textContent = "未测量";
    elements.changedMeta.textContent = "未测量";
    fillConceptList(elements.addedConcepts, [], "added");
    fillConceptList(elements.removedConcepts, [], "removed");
    fillConceptList(elements.changedConcepts, [], "changed");
    return;
  }

  const beforeMap = conceptMap(before);
  const atMap = conceptMap(at);
  const added = [...atMap.entries()]
    .filter(([label]) => !beforeMap.has(label))
    .map(([, concept]) => concept)
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  const removed = [...beforeMap.entries()]
    .filter(([label]) => !atMap.has(label))
    .map(([, concept]) => concept)
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  const changed = [...atMap.entries()]
    .filter(
      ([label, concept]) =>
        beforeMap.has(label) &&
        isFiniteNumber(concept.score) &&
        isFiniteNumber(beforeMap.get(label).score),
    )
    .map(([label, concept]) => ({
      label,
      delta: concept.score - beforeMap.get(label).score,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  elements.jScoreShift.textContent =
    `${formatScore(before.candidateScore)} → ${formatScore(at.candidateScore)}`;
  const reviewedShift =
    trace.humanReview.reprBefore && trace.humanReview.reprAfter
      ? `人工复核：${trace.humanReview.reprBefore} → ${trace.humanReview.reprAfter}。`
      : "";
  elements.jChangeLead.textContent =
    `${reviewedShift}比较 t=${before.position} 与 t=${at.position}：进入 ${added.length} 个、退出 ${removed.length} 个、共同概念 ${changed.length} 个。列表只展示变化最大的前 7 项。`;
  elements.addedMeta.textContent = `t=${at.position} 新出现 · ${added.length} 项`;
  elements.removedMeta.textContent = `自 t=${before.position} 消失 · ${removed.length} 项`;
  elements.changedMeta.textContent = `同名概念 · ${changed.length} 项`;
  fillConceptList(elements.addedConcepts, added, "added");
  fillConceptList(elements.removedConcepts, removed, "removed");
  fillConceptList(elements.changedConcepts, changed, "changed");
}

function riverConcepts(checkpoint) {
  const seen = new Set();
  const labels = [];
  checkpoint.concepts.forEach((concept) => {
    const label = String(concept.label || "").trim();
    const key = label.toLocaleLowerCase();
    if (!label || seen.has(key)) return;
    seen.add(key);
    labels.push(label);
  });
  return labels.slice(0, 3);
}

function renderConceptRiver(trace) {
  elements.conceptRiver.replaceChildren();
  trace.checkpoints.forEach((checkpoint) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "river-card";
    if (checkpoint.passCount === 0) card.classList.add("zero");
    if (
      trace.tRepr.measured &&
      checkpoint.position === trace.tRepr.position
    ) {
      card.classList.add("repr");
    }
    if (
      trace.tLock.measured &&
      checkpoint.position === trace.tLock.position
    ) {
      card.classList.add("lock");
    }
    if (checkpoint.id === state.checkpointId) card.classList.add("selected");

    const head = document.createElement("span");
    head.className = "river-card-head";
    head.textContent =
      `t=${checkpoint.position ?? "—"} · ${checkpoint.passCount ?? "—"}/${checkpoint.sampleCount ?? "—"}`;
    card.append(head);

    const list = document.createElement("span");
    list.className = "river-concepts";
    const labels = riverConcepts(checkpoint);
    if (!labels.length) {
      const empty = document.createElement("i");
      empty.textContent = "无可读 Top-token";
      list.append(empty);
    } else {
      labels.forEach((label) => {
        const item = document.createElement("b");
        item.textContent = visibleConcept(label);
        list.append(item);
      });
    }
    card.append(list);

    const stage = document.createElement("small");
    stage.textContent = checkpoint.stage || "阶段未测量";
    card.append(stage);
    card.addEventListener("click", () => {
      state.checkpointId = checkpoint.id;
      renderCheckpointSelection();
    });
    elements.conceptRiver.append(card);
  });
}

function renderCheckpointSelection() {
  const trace = traceById();
  if (!trace) return;
  const checkpoint = checkpointById(trace);
  if (checkpoint) state.checkpointId = checkpoint.id;
  renderTimeline(trace, checkpoint);
  renderCheckpoint(checkpoint);
  renderConceptRiver(trace);
}

function renderTrace() {
  const trace = traceById();
  if (!trace) return;
  const checkpoint = defaultCheckpoint(trace);
  state.checkpointId = checkpoint?.id ?? "";
  renderTraceOptions();
  renderVerdict(trace);
  renderTimeline(trace, checkpoint);
  renderCheckpoint(checkpoint);
  renderJChange(trace);
  renderConceptRiver(trace);
  elements.problemPrompt.textContent = trace.prompt || "未测量";
  elements.responseText.textContent = trace.response || "未测量";
}

function showLoadError(error) {
  state.traces = [];
  state.traceId = "";
  state.checkpointId = "";
  elements.traceSelect.replaceChildren();
  const option = document.createElement("option");
  option.textContent = "数据未载入";
  elements.traceSelect.append(option);
  elements.traceSelect.disabled = true;
  elements.loadError.hidden = false;
  elements.loadErrorMessage.textContent =
    `${error?.message || "未知错误"}。请确认相对路径 ${DATA_URL} 可访问。`;
  setHeaderStatus("error", "实验数据未载入");
  elements.replayTitle.textContent = "无法回答：trace 数据未载入。";
  elements.verdictDetail.textContent =
    "静态镜像不包含伪造 fallback，也不会借用其他页面的数据。";
  elements.verdictOrder.textContent = "未测量";
  elements.markerRepr.textContent = "未测量";
  elements.markerLock.textContent = "未测量";
  elements.timelinePlot.innerHTML =
    '<div class="timeline-placeholder">checkpoint 未测量</div>';
}

async function loadData() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload?.traces) || payload.traces.length === 0) {
      throw new Error("JSON 中没有 traces");
    }
    state.traces = payload.traces
      .filter((trace) => trace && typeof trace === "object")
      .map(normalizeTrace)
      .sort(
        (a, b) =>
          a.humanReview.heroRank - b.humanReview.heroRank ||
          a.id.localeCompare(b.id),
      );
    if (!state.traces.length) throw new Error("没有可读 trace");
    state.traceId = state.traces[0].id;
    elements.loadError.hidden = true;
    setHeaderStatus("ready", `${state.traces.length} 条 trace 已载入`);
    renderTrace();
  } catch (error) {
    showLoadError(error);
  }
}

elements.traceSelect.addEventListener("change", (event) => {
  state.traceId = event.target.value;
  renderTrace();
});

loadData();
