const app = document.querySelector("#app");


function fmt(value, digits = 3) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "—";
}


function pct(value, digits = 1) {
  return Number.isFinite(value)
    ? `${(Number(value) * 100).toFixed(digits)}%`
    : "—";
}


function signed(value, digits = 3) {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${Number(value).toFixed(digits)}`;
}


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function tag(tone, label) {
  return `<span class="result-tag ${tone}">${escapeHtml(label)}</span>`;
}


function sectionTitle(index, kicker, title, description) {
  return `
    <header class="section-title">
      <div class="section-index">${escapeHtml(index)}</div>
      <div>
        <p>${escapeHtml(kicker)}</p>
        <h2>${escapeHtml(title)}</h2>
        <div class="section-intro">${description}</div>
      </div>
    </header>
  `;
}


function metricCard(label, value, note, tone = "teal") {
  return `
    <article class="metric-card tone-${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(note)}</p>
    </article>
  `;
}


function brierChart(rows) {
  const width = 900;
  const height = 320;
  const left = 58;
  const right = 20;
  const top = 26;
  const bottom = 52;
  const yMin = 0.18;
  const yMax = 0.31;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const x = (index) =>
    left + (index / Math.max(rows.length - 1, 1)) * chartWidth;
  const y = (value) =>
    top + ((yMax - value) / (yMax - yMin)) * chartHeight;
  const ticks = [0.2, 0.225, 0.25, 0.275, 0.3];
  const series = [
    { key: "J", label: "J@h", className: "j-line" },
    { key: "raw", label: "raw h", className: "raw-line" },
    { key: "logit", label: "logit", className: "logit-line" },
  ];
  const grid = ticks.map((tick) => `
    <g>
      <line class="${tick === 0.25 ? "grid chance" : "grid"}"
        x1="${left}" x2="${width - right}" y1="${y(tick)}" y2="${y(tick)}"></line>
      <text class="axis-label" x="${left - 10}" y="${y(tick) + 5}">${tick.toFixed(3)}</text>
    </g>
  `).join("");
  const lines = series.map((item) => {
    const points = rows
      .map((row, index) => `${x(index)},${y(row[item.key].brier)}`)
      .join(" ");
    const circles = rows.map((row, index) => `
      <circle class="series-point" cx="${x(index)}"
        cy="${y(row[item.key].brier)}" r="${row.offset === 256 ? 7 : 4.5}">
        <title>${item.label} · t=${row.offset} · Brier ${fmt(row[item.key].brier, 4)}</title>
      </circle>
    `).join("");
    return `<g class="${item.className}"><polyline class="series-line" points="${points}"></polyline>${circles}</g>`;
  }).join("");
  const labels = rows.map((row, index) => `
    <text class="${row.offset === 256 ? "x-label active" : "x-label"}"
      x="${x(index)}" y="${height - 20}">${row.offset}</text>
  `).join("");

  return `
    <div class="chart-shell">
      <div class="chart-head">
        <div><span>同题正误轨迹成对比较</span><strong>Brier score，越低越好</strong></div>
        <div class="chart-legend">
          <span class="j-line"><i></i>J@h</span>
          <span class="raw-line"><i></i>raw h</span>
          <span class="logit-line"><i></i>logit</span>
          <span class="chance-line"><i></i>chance 0.25</span>
        </div>
      </div>
      <div class="chart-scroll">
        <svg class="brier-chart" viewBox="0 0 ${width} ${height}"
          role="img" aria-label="J、raw hidden state 与 logit 在各 checkpoint 的 Brier score">
          ${grid}${lines}${labels}
          <text class="axis-title" x="${width - right}" y="${height - 2}">
            已生成 token 数（离散 checkpoint）
          </text>
        </svg>
      </div>
      <p class="chart-note">
        曲线不是逐 token 的连续风险。只有若干离散 checkpoint，且每个点单独拟合读出；
        因此 256 token 的低点不能被解释成“模型恰好从这里开始犯错”。
      </p>
    </div>
  `;
}


function layerPanel(rows, nested) {
  const body = rows.map((row) => `
    <div class="${row.layer >= 20 ? "layer-row late" : "layer-row"}">
      <strong>L${row.layer}</strong>
      <div class="meter teal"><i style="width:${pct(row.J.accuracy)}"></i><span>${pct(row.J.accuracy)}</span></div>
      <div class="meter ink"><i style="width:${pct(row.raw.accuracy)}"></i><span>${pct(row.raw.accuracy)}</span></div>
      <code>${fmt(row.J.brier)} / ${fmt(row.raw.brier)}</code>
    </div>
  `).join("");
  return `
    <div class="layer-panel">
      <div class="panel-heading">
        <div><span>LAYER SWEEP · t=256</span><h3>若干中后层点估计较好，但层选择不稳定</h3></div>
        ${tag("candidate", "探索性")}
      </div>
      <div class="layer-table">
        <div class="layer-table-head"><span>层</span><span>J 配对准确率</span><span>raw 配对准确率</span><span>Brier J / raw</span></div>
        ${body}
      </div>
      <div class="panel-foot">
        嵌套选择层与正则后：J Brier ${fmt(nested.J_brier)}，raw ${fmt(nested.raw_brier)}，
        差值 ${signed(nested.delta_brier)}；6 题 bootstrap 95% CI
        [${fmt(nested.delta_ci?.[0])}, ${fmt(nested.delta_ci?.[1])}]，仍跨 0。
      </div>
    </div>
  `;
}


function phrasePanel(phrase) {
  const rows = phrase.rows.map((row) => `
    <div class="${row.offset === 256 ? "phrase-row active" : "phrase-row"}">
      <strong>t=${row.offset}</strong>
      <div><span>J phrase</span><i><b style="width:${pct(row.J_auc)}"></b></i><em>${fmt(row.J_auc)}</em></div>
      <div class="raw"><span>raw logit</span><i><b style="width:${pct(row.raw_logit_auc)}"></b></i><em>${fmt(row.raw_logit_auc)}</em></div>
    </div>
  `).join("");
  return `
    <div class="phrase-panel">
      <div class="panel-heading">
        <div><span>FIXED MULTI-TOKEN CONCEPTS</span><h3>把“几个关键词”换成固定风险短语轴</h3></div>
        ${tag("candidate", "内部条件关联")}
      </div>
      <p class="panel-copy">
        预先固定 7 个多词概念：正确思路、错误思路、忽略边界、off-by-one、
        误解题意、语法无效、需要修正。下图是同题内区分失败轨迹的 macro AUC。
      </p>
      <div class="phrase-bars">${rows}</div>
      <div class="panel-foot">
        t=256 的 J phrase AUC = 0.761；对 4 个 checkpoint 做 max-statistic 校正后
        p=${fmt(phrase.familywise_p, 4)}（${phrase.permutations.toLocaleString("zh-CN")} 次置换）。
        这是 6 个开发任务内的相对风险读出，没有独立任务复现，也不是模型
        自然语言“内心独白”；当前也没有对 J-vs-raw AUC 差异做独立推断。
      </div>
    </div>
  `;
}


function selectionPanel(rows) {
  const row = rows.find((item) => item.offset === 256) || rows[0];
  const bars = [
    ["J 排名 Top-1", row?.J_top1, "teal"],
    ["raw h 排名 Top-1", row?.raw_top1, "ink"],
    ["随机选 1 条", row?.random_top1, "gray"],
    ["J 排名 Top-2 至少一条通过", row?.J_top2, "violet"],
  ].map(([label, value, tone]) => `
    <div><span>${label}</span><i class="${tone}"><b style="width:${pct(value)}"></b></i><strong>${pct(value)}</strong></div>
  `).join("");
  return `
    <div class="selection-panel">
      <div class="panel-heading">
        <div><span>WHAT WOULD RETRY ACTUALLY DO?</span><h3>256 token 时，从 8 条兄弟轨迹里选继续生成的分支</h3></div>
        ${tag("candidate", "需要扩大样本")}
      </div>
      <div class="selection-bars">${bars}</div>
      <p class="panel-copy">
        J Top-1 比随机高 ${pct((row?.J_top1 || 0) - (row?.random_top1 || 0))}，
        但与 raw hidden-state 完全相同。J−随机的 6 题 bootstrap 95% CI 为
        [${pct(row?.J_minus_random_top1_ci?.[0])}, ${pct(row?.J_minus_random_top1_ci?.[1])}]；
        J−raw 也跨 0。现在只能把它当成 prospective 验证候选，不能上线早停。
      </p>
    </div>
  `;
}


function steeringPanel(steering) {
  if (!steering || steering.status === "running") {
    return `
      <div class="steering-panel running">
        ${tag("candidate", "正在运行")}
        <div><h3>四臂因果干预仍在运行</h3><p>baseline / concept+ / 等范数随机方向 / concept−。</p></div>
      </div>
    `;
  }
  const counts = Object.entries(steering.pass_counts || {}).map(([name, value]) =>
    `<span><b>${value}</b>${escapeHtml(name)}</span>`
  ).join("");
  return `
    <div class="steering-panel">
      ${tag(steering.verdict === "positive" ? "positive" : "negative", "因果结果")}
      <div>
        <h3>${escapeHtml(steering.title)}</h3>
        <p>${escapeHtml(steering.conclusion)}</p>
        <div class="steering-counts">${counts}</div>
        <p class="steering-inference">
          concept+ 相对 baseline：1 次错→对、4 次对→错，exact McNemar 双侧
          p=${fmt(steering.concept_plus_vs_baseline?.exact_mcnemar_two_sided_p, 3)}；
          concept+ 与随机方向净差为 0，p=
          ${fmt(steering.concept_plus_vs_random?.exact_mcnemar_two_sided_p, 3)}。
          n=10，不能把“有害趋势”当成确定效应。
        </p>
      </div>
    </div>
  `;
}


function problemArchive(traces) {
  const items = traces.map((trace, index) => {
    const search = `${trace.task_id} ${trace.problem_prompt} ${trace.entry_point || ""}`.toLowerCase();
    const originalCorrect =
      typeof trace.original_outcome === "object"
        ? Boolean(trace.original_outcome?.correct)
        : trace.original_outcome === "pass";
    return `
      <details class="problem-item" data-search="${escapeHtml(search)}" ${index === 0 ? "open" : ""}>
        <summary>
          <span>${String(index + 1).padStart(2, "0")}</span>
          <div>
            <strong>${escapeHtml(trace.task_id)}</strong>
            <small>entry point: ${escapeHtml(trace.entry_point || "—")} · 原轨迹：
              ${originalCorrect ? "通过" : "失败"} ·
              ${trace.output_token_count} output tokens</small>
          </div>
          <b>展开原文</b>
        </summary>
        <div class="problem-content">
          <section><h3>原始题面 / 测试</h3><pre>${escapeHtml(trace.problem_prompt)}</pre></section>
          <section><h3>模型完整原始输出</h3><pre>${escapeHtml(trace.response_text)}</pre></section>
        </div>
      </details>
    `;
  }).join("");
  return `
    <div class="problem-archive">
      <div class="problem-toolbar">
        <div><strong>原始题目与完整保存的失败采样</strong><span id="problemCount">${traces.length} / ${traces.length} 道题</span></div>
        <label><span>筛选题号或题意</span><input id="problemFilter" placeholder="例如 Mbpp/125 或 substring"></label>
      </div>
      <div class="problem-list">${items}</div>
    </div>
  `;
}


function answerCard(number, question, verdict, tone, copy) {
  return `
    <article class="answer-card ${tone}">
      <div class="answer-number">${number}</div>
      <div><span>${question}</span><h3>${verdict}</h3><p>${copy}</p></div>
    </article>
  `;
}


function explorationPanel(explore) {
  const spectral = explore?.spectral_subspace || {};
  const format = explore?.format_confound || {};
  const transfer = explore?.cross_time_transfer || {};
  const rotation = explore?.temporal_direction_rotation || {};
  const unsupervised = explore?.unsupervised_selection || {};
  const fused = explore?.fused_scalar_probe || {};
  const learning = explore?.few_task_learning_curve || {};
  const retry = explore?.selective_retry || {};
  const surface = explore?.surface_capacity || {};
  const learningRows = Array.isArray(learning.rows) ? learning.rows : [];
  const firstLearning = learningRows[0] || {};
  const lastLearning = learningRows.at(-1) || {};
  const fixedRetryRows = Array.isArray(retry.fixed_rows)
    ? retry.fixed_rows
    : [];
  const lastFixedRetry = fixedRetryRows.at(-1) || {};

  const fullSpectralBenefit =
    spectral.raw_brier - spectral.full_J_brier;
  const spectralWidth = (value) => {
    if (!Number.isFinite(value) || !(fullSpectralBenefit > 0)) return 4;
    return Math.max(
      4,
      Math.min(
        100,
        ((spectral.raw_brier - value) / fullSpectralBenefit) * 100,
      ),
    );
  };
  const spectrumRows = [
    ["完整 J", spectral.full_J_brier],
    ["仅 top 10% 奇异方向", spectral.top_10pct_brier],
    ["仅 top 25%", spectral.top_25pct_brier],
    ["仅 25–50% 频带", spectral.band_25_to_50pct_brier],
    ["仅 bottom 50%", spectral.bottom_50pct_brier],
  ].map(([label, value], index) => `
    <div class="${index === 1 ? "explore-bar active" : "explore-bar"}">
      <span>${escapeHtml(label)}</span>
      <i><b style="width:${spectralWidth(value)}%"></b></i>
      <code>${fmt(value, 4)}</code>
    </div>
  `).join("");

  const learningCurve = learningRows.map((row) => `
    <div class="learning-row">
      <strong>k=${row.training_task_count}</strong>
      <i><b style="width:${Math.min(100, Math.abs(row.J_minus_raw_brier) / 0.04 * 100)}%"></b></i>
      <code>${signed(row.J_minus_raw_brier, 5)}</code>
      <small>Mbpp/614 ${signed(row.Mbpp_614_J_minus_raw_brier, 4)}</small>
    </div>
  `).join("");

  const retryTable = fixedRetryRows.map((row) => `
    <div class="${row.branches === 4 ? "retry-audit-row active" : "retry-audit-row"}">
      <strong>${row.branches} 条</strong>
      <span>${row.oracle_pass_count}/${row.task_count}</span>
      <span>${row.J_pass_count}/${row.task_count}</span>
      <code>${Math.round(row.mean_output_tokens).toLocaleString("zh-CN")}</code>
    </div>
  `).join("");

  return `
    <div class="exploration-summary">
      ${tag("positive", "第二轮有效收敛")}
      <div>
        <h3>真正有价值的不是多看几个词，而是确定 J 改变了什么、没改变什么</h3>
        <p>
          目前最一致的解释是：J 把 raw hidden state 变成一套小样本几何先验；
          有效方向集中在上半段奇异谱、会随生成阶段旋转。它不是额外的
          correctness 信息，也没有形成稳定的“从这里开始错”轴。
        </p>
      </div>
    </div>

    <div class="explore-grid">
      <article class="explore-card spectrum-card">
        <header>${tag("positive", "机制定位")}<span>01 · SPECTRUM</span></header>
        <h3>top 10% 几乎复现完整 J，但不是一个“魔法维度”</h3>
        <div class="explore-bars">${spectrumRows}</div>
        <p>
          Brier 越低越好。top 10% 恢复了
          ${pct(spectral.top_10pct_recovered_benefit_fraction)} 的点估计收益；
          但 25–50% 频带单独仍有 ${fmt(spectral.band_25_to_50pct_brier, 4)}，
          说明信号分布在上谱。移除 top 1% 后 Brier 恶化
          ${signed(spectral.drop_top_1pct_delta_brier, 4)}，
          exact sign-flip p=${fmt(spectral.drop_top_1pct_signflip_p, 4)}；
          仍是同 ${spectral.task_count} 个开发题。
        </p>
      </article>

      <article class="explore-card clean-card">
        <header>${tag("positive", "排除混淆")}<span>02 · CLEAN CODE</span></header>
        <h3>在双方都是完整、可解析代码时，J 的分离反而更强</h3>
        <div class="number-triplet">
          <div><strong>${fmt(format.J_clean_pair_accuracy, 3)}</strong><span>J</span></div>
          <div><strong>${fmt(format.raw_clean_pair_accuracy, 3)}</strong><span>raw</span></div>
          <div><strong>${fmt(format.surface_clean_pair_accuracy, 3)}</strong><span>surface</span></div>
        </div>
        <p>
          ${format.clean_task_count} 题 / ${format.clean_pair_count} 对 strict-clean
          正误比较。J 对“最终是否 clean”的预测 AUC 只有
          ${fmt(format.clean_format_prediction_auc, 3)}，接近随机。
          因而局部信号不像只是识别截断、缺代码块或格式坏掉；但 5 题结果仍属事后审计。
        </p>
      </article>

      <article class="explore-card surface-card">
        <header>${tag("positive", "更强对照")}<span>03 · SURFACE 16K</span></header>
        <h3>把文本哈希特征扩到 ${surface.best_scanned_dimension?.toLocaleString("zh-CN")} 维，仍追不上 J</h3>
        <div class="compare-big">
          <div><span>J Brier</span><strong>${fmt(surface.J_brier, 4)}</strong></div>
          <b>vs</b>
          <div><span>surface Brier</span><strong>${fmt(surface.surface_brier, 4)}</strong></div>
        </div>
        <p>
          最佳扫描的 wide-surface 仍比 J 差
          ${signed(surface.surface_minus_J_brier, 4)} Brier。
          这削弱了“旧 surface baseline 只是维度太小/哈希冲突”的解释；
          维度是在看完结果后扫描的，所以不是独立确认。
        </p>
      </article>
    </div>

    <div class="time-audit">
      <article>
        <header>${tag("negative", "跨时间失败")}<span>04 · FROZEN t256 READOUT</span></header>
        <h3>同一个 t256 方向到了 t384 会反转</h3>
        <div class="time-contrast">
          <div><span>t=256</span><strong>AUC ${fmt(transfer.t256_J_auc, 3)}</strong><code>分离 ${signed(transfer.t256_J_score_separation, 3)}</code></div>
          <i>→</i>
          <div class="bad"><span>t=384</span><strong>AUC ${fmt(transfer.t384_J_auc, 3)}</strong><code>分离 ${signed(transfer.t384_J_score_separation, 3)}</code></div>
        </div>
        <p>
          在 ${transfer.train_offset} token 训练、跨 checkpoint 原样应用；
          ${transfer.offset_count} 个 offset 的 max-statistic FWER p=
          ${fmt(transfer.max_over_offsets_familywise_p, 4)}
          （t256 pointwise p=${fmt(transfer.t256_pointwise_p, 4)}）。
          所以 256 是局部 pocket，不是错误 onset。
        </p>
      </article>
      <article>
        <header>${tag("candidate", "阶段特异")}<span>05 · DIRECTION ROTATION</span></header>
        <h3>同一时刻方向可重复，换一个时刻几乎正交</h3>
        <dl class="rotation-numbers">
          <div><dt>J · 同时刻跨 fold cosine</dt><dd>${fmt(rotation.J?.same_offset_cross_fold_mean_cosine, 3)}</dd></div>
          <div><dt>J · 相邻时刻 |cosine|</dt><dd>${fmt(rotation.J?.adjacent_offset_mean_absolute_cosine, 3)}</dd></div>
          <div><dt>raw · 同时刻跨 fold cosine</dt><dd>${fmt(rotation.raw?.same_offset_cross_fold_mean_cosine, 3)}</dd></div>
          <div><dt>raw · 相邻时刻 |cosine|</dt><dd>${fmt(rotation.raw?.adjacent_offset_mean_absolute_cosine, 3)}</dd></div>
        </dl>
        <p>
          这更像“每个生成阶段需要自己的读出”，不是一条贯穿整段生成的
          wrongness axis；raw 也呈现相同行为，因此旋转本身并非 J 特异现象。
        </p>
      </article>
    </div>

    <div class="explore-grid lower">
      <article class="explore-card">
        <header>${tag("negative", "无监督未过关")}<span>06 · NO LABELS</span></header>
        <h3>几何离群点最好 ${Math.round((unsupervised.best_pass_at_selected || 0) * (unsupervised.task_count || 0))}/${unsupervised.task_count}，但全族校正后不成立</h3>
        <div class="number-triplet">
          <div><strong>${pct(unsupervised.best_pass_at_selected)}</strong><span>J Top-1</span></div>
          <div><strong>${pct(unsupervised.matching_raw_pass_at_selected)}</strong><span>raw Top-1</span></div>
          <div><strong>${fmt(unsupervised.familywise_p, 3)}</strong><span>FWER p</span></div>
        </div>
        <p>
          最佳 cell 是 t64 的 3-NN outlier，但 J 与 raw 完全打平；
          搜索整族 ${escapeHtml(unsupervised.best_cell)} 后，
          p=${fmt(unsupervised.familywise_p, 4)}。无标签 selector 暂无 J 特异发现。
        </p>
      </article>

      <article class="explore-card fusion-card">
        <header>${tag("positive", "工程结论")}<span>07 · EXACT FUSION</span></header>
        <h3>固定标量 probe 部署时，可以完全不算 J@h</h3>
        <div class="fusion-equation"><code>βᵀ(Jh)</code><b>=</b><code>(Jᵀβ)ᵀh</code></div>
        <div class="fusion-stats">
          <strong>${fused.dense_J_macs?.toLocaleString("zh-CN")}</strong><span>dense J MAC</span>
          <i>→</i>
          <strong>${fused.fused_macs?.toLocaleString("zh-CN")}</strong><span>fused MAC</span>
        </div>
        <p>
          理论计算量缩小 ${Math.round(fused.theoretical_reduction_factor).toLocaleString("zh-CN")}×，
          最大 score 误差 ${Number(fused.maximum_absolute_score_error).toExponential(1)}。
          这不是近似：冻结一个排序/报警标量后，把 J 离线融合进 raw 方向即可；
          只有要保留完整 J 向量或在线重拟合时才需要运行时 J。
        </p>
      </article>

      <article class="explore-card learning-card">
        <header>${tag("candidate", "样本效率")}<span>08 · FEW-TASK CURVE</span></header>
        <h3>训练任务增加时，J−raw 的 Brier 差距反而扩大</h3>
        <div class="learning-head"><span>训练题数</span><span>J−raw Brier</span><span>单题反例</span></div>
        <div class="learning-rows">${learningCurve}</div>
        <p>
          总体从 k=${firstLearning.training_task_count} 的
          ${signed(firstLearning.J_minus_raw_brier, 5)} 变为
          k=${lastLearning.training_task_count} 的
          ${signed(lastLearning.J_minus_raw_brier, 5)}；但 Mbpp/614 的伤害也从
          ${signed(firstLearning.Mbpp_614_J_minus_raw_brier, 4)} 放大到
          ${signed(lastLearning.Mbpp_614_J_minus_raw_brier, 4)}。
          几何先验既能放大匹配，也会放大家族不匹配。
        </p>
      </article>
    </div>

    <div class="retry-audit">
      <div class="retry-audit-copy">
        ${tag("negative", "策略尚不可用")}
        <h3>有可选的正确分支，不等于 J 能把它选出来</h3>
        <p>
          Oracle 只回答“前 k 条里有没有正确答案”；J 是真实排序结果。
          到 ${lastFixedRetry.branches} 条时 oracle 达到
          ${lastFixedRetry.oracle_pass_count}/${lastFixedRetry.task_count}，而 J 仍为
          ${lastFixedRetry.J_pass_count}/${lastFixedRetry.task_count}，瓶颈已经从采样
          转向 verifier / selector。
        </p>
        <p>
          自适应 cap-4：${retry.adaptive_cap4?.pass_count}/${retry.adaptive_cap4?.task_count}
          通过、平均看 ${fmt(retry.adaptive_cap4?.mean_revealed_branches, 2)} 条、
          ${Math.round(retry.adaptive_cap4?.mean_output_tokens || 0).toLocaleString("zh-CN")}
          output tokens；固定 k=4 是
          ${retry.fixed_cap4?.pass_count}/${retry.fixed_cap4?.task_count}、
          ${Math.round(retry.fixed_cap4?.mean_output_tokens || 0).toLocaleString("zh-CN")}
          tokens。自适应策略被固定 k=4 支配：
          ${retry.adaptive_cap4?.dominated_by_fixed_4 ? "是" : "否"}。
        </p>
      </div>
      <div class="retry-audit-table">
        <div class="retry-audit-head"><span>revealed</span><span>oracle</span><span>J 实选</span><span>output tokens</span></div>
        ${retryTable}
      </div>
    </div>

    <div class="exploration-takeaway">
      <strong>这一轮得到的可执行结论</strong>
      <p>
        下一轮应测试“按 checkpoint 分开的 probe bank + 新题族校准”，并把
        Mbpp/614 这种 prior mismatch 当作一等失败模式；不应继续把资源投入到
        Top-K 词解释、单一 J Δ 阈值、无监督离群点或当前自适应 retry。
        若最终只部署一个冻结标量评分器，则直接部署融合后的 raw 方向。
      </p>
    </div>

    <div class="next-pilot">
      ${tag("candidate", "正在做 · 尚无结果")}
      <div>
        <span>NEXT · EPISTEMIC RELIABILITY</span>
        <h3>从 coding correctness 扩展到“何时应该停止胡编”</h3>
        <p>
          下一组 matched pilot 会为同一问题构造
          <b>信息完整 / 缺关键信息 / 输入互相矛盾</b> 三种条件，并分别测量：
          输入客观上是否可回答、模型是否做出恰当 abstain、若继续回答是否随后产生
          unsupported claim。这里展示的是已冻结的实验问题，不是已有正结果；
          三个标签必须分开，避免把“题目不可答”和“模型答错”混为一谈。
        </p>
      </div>
    </div>
  `;
}


function render(findings, traces) {
  const study = findings.study;
  const paired256 = findings.paired_timeline.find((row) => row.offset === 256);
  const absolute256 = findings.absolute_timeline.find((row) => row.offset === 256);
  const random256 = findings.random_alignment.find((row) => row.offset === 256);

  app.innerHTML = `
    <main>
      <header class="topbar">
        <a href="#top" class="brand"><span>J</span><div><strong>J-space × Coding</strong><small>Qwen3.5-4B strict pilot</small></div></a>
        <nav><a href="#answer">结论</a><a href="#evidence">证据</a><a href="#explore">新发现</a><a href="#retry">重试</a><a href="#problems">10 道原题</a><a href="#method">方法</a></nav>
        <span class="public-chip">公开访问 · 无需登录</span>
      </header>

      <section class="hero" id="top">
        <div class="hero-copy">
          <p class="eyebrow">STRICT EXACT-PREFIX · 2026-07-30</p>
          <h1>J-space 还不能告诉我们<br><em>“这条轨迹从此刻开始错了”</em></h1>
          <p class="hero-lead">
            但在这 6 个 mixed-outcome 开发题的 L24 / t=256 screen 中，
            J@h 出现了一个更窄、可检验的 sibling-ranking 候选信号。
            它目前适合研究“分支排序”，不适合做单轨实时报警，也没有证明跨题泛化。
          </p>
          <div class="hero-actions"><a class="primary-button" href="#answer">先看三个答案 ↓</a><a class="secondary-button" href="#problems">直接看 10 道原题</a></div>
        </div>
        <aside class="hero-verdict">
          <span>当前最诚实的结论</span>
          <strong>相对排序：有候选信号</strong>
          <strong class="negative">绝对报警：没有证据</strong>
          <dl>
            <div><dt>t=256 配对 Brier</dt><dd>${fmt(paired256?.J.brier)}</dd></div>
            <div><dt>J / raw 配对准确率</dt><dd>${pct(paired256?.J.accuracy)} / ${pct(paired256?.raw.accuracy)}</dd></div>
            <div><dt>单轨 J Brier / prior</dt><dd>${fmt(absolute256?.J_brier)} / ${fmt(absolute256?.prior_brier)}</dd></div>
            <div><dt>保谱随机方向检验</dt><dd>p=${fmt(random256?.rank_p, 4)}</dd></div>
          </dl>
          <p>所有主要预测结果均为 whole-task leave-one-task-out；只有 6 个混合正误任务。</p>
        </aside>
      </section>

      <section class="metric-strip">
        ${metricCard("采样规模", `${study.tasks_sampled} × ${study.samples_per_task}`, `${study.trajectories} 条轨迹：${study.correct_trajectories} 对 / ${study.failed_trajectories} 错`)}
        ${metricCard("严格提取", String(study.exact_prefix_rows), "每个 checkpoint 单独 cropped forward，不可见未来 suffix", "green")}
        ${metricCard("有效比较任务", `${study.mixed_outcome_tasks} 题`, `${study.mixed_trajectories} 条同题兄弟轨迹，可做正误相对比较`, "violet")}
        ${metricCard("因果泄漏审计", `${findings.causal_gate.same_prefix_different_suffix_groups} 组`, "同可见前缀、不同未来 suffix 的 raw/J 输出逐 bit 相同", "amber")}
      </section>

      <section class="content-section" id="answer">
        ${sectionTitle("01", "先回答你真正关心的问题", "J-space 到底能得到什么？", "页面中的“对/错”都来自真实 MBPP+ 测试，不是看关键词人工猜测。")}
        <div class="answer-grid">
          ${answerCard("A", "能看到模型具体在想什么吗？", "不能；Top-K 词只是投影摘要", "negative", "J@h 是 2560 维向量。报告展示的几个词只是用 unembedding 把这个向量词汇化，不等于完整思维内容。固定多词概念轴比散乱关键词更有用，但仍只是一个可解释 measurement。")}
          ${answerCard("B", "能定位单条轨迹何时开始错吗？", "当前不能；没有稳定、单调的 onset", "negative", "单轨绝对风险的 J Brier 没有超过 task-agnostic prior；同一个读出跨时间共享时，256 token 的优势也明显衰减。所谓 J Δ、范数、速度等简单标量均未通过 familywise 置换检验。")}
          ${answerCard("C", "那 J-space 有什么可用价值？", "多分支相对排序是最值得继续的方向", "positive", "给同一道题同时保留 4–8 条前缀，在 t≈256 比较它们；J@h 的相对读出在当前小样本上有方向特异性。下一步应冻结层、时间点和评分器，在全新题上做 prospective top-1 / top-2 验证。")}
        </div>
        <div class="relation-map">
          <div><span>同一道题</span><b>1 个 prompt</b></div><i>→</i>
          <div><span>并行采样</span><b>8 条前缀</b></div><i>→</i>
          <div><span>t = 256</span><b>取 h<sub>ℓ</sub></b></div><i>→</i>
          <div class="focus"><span>J-space</span><b>J<sub>ℓ</sub>h<sub>ℓ</sub></b></div><i>→</i>
          <div><span>相对排序</span><b>继续 Top-1/2</b></div>
        </div>
        <p class="relation-note">这里的关系不是“J-space 发现某个关键词 → 宣判错误”，而是训练一个只在同题兄弟分支间比较的 held-out-task ranker。若只生成一条轨迹，就没有当前证据支持报警。</p>
      </section>

      <section class="content-section section-tinted" id="evidence">
        ${sectionTitle("02", "时间 × 表征", "为什么不能把 256 token 叫作“跑偏起点”？", "若真存在通用 onset，我们希望风险随时间稳定上升，且同一个评分方向能跨 checkpoint 工作。实际看到的是一个孤立的时间 pocket。")}
        ${brierChart(findings.paired_timeline)}
        <div class="evidence-callouts">
          <article>${tag("candidate", "事后候选")}<h3>t=256 的局部对照通过，但还不是确认性结果</h3><p>固定 C 后，999 次 task 内标签置换，J−raw p=${fmt(findings.label_permutation_at_256.J_minus_raw_p, 4)}。100 个保持 J 奇异谱、随机输入方向的 JQ 对照中，${random256?.random_better_count}/${random256?.random_count} 个优于官方 J，秩检验 p=${fmt(random256?.rank_p, 4)}。这两项都没有覆盖先查看 10 个 offset 再选 256 的完整发现过程。</p></article>
          <article>${tag("negative", "不成立")}<h3>不能从一条轨迹得到校准失败概率</h3><p>t=256 单轨 J Brier ${fmt(absolute256?.J_brier)}，task-agnostic prior ${fmt(absolute256?.prior_brier)}，J 更差。跨时间共享 J 方向的综合 Brier 为 ${fmt(findings.negative_controls.shared_time_integrated_J_brier)}，也差于 chance 0.250。</p></article>
          <article>${tag("negative", "J Δ 无效")}<h3>变化幅度不等于错误</h3><p>J Δ 指相邻 checkpoint 的 J@h 变化，例如 ‖J h<sub>t</sub> − J h<sub>t−1</sub>‖ / Δtoken。它只表示内部状态变了多少。范数、速度、cosine 等标量联合筛选后，最佳 J familywise p=${fmt(findings.negative_controls.geometry_best_J_familywise_p, 3)}。</p></article>
        </div>
        <div class="metric-prior-panel">
          <div class="metric-prior-copy">
            ${tag("positive", "等价性成立")}
            <h3>J 的收益不是“新信息”，而是一套各向异性 metric prior</h3>
            <p>
              因为 J@h 是 h 的确定性线性变换，线性 probe 不可能从中获得 h
              原本没有的信息。我们把 J-space ridge 精确改写成 raw h 上的
              J-induced penalty；两者输出几乎逐数值相同。这说明 J 的实际价值是：
              在只有 5 个训练任务的极小样本下，预先放大未来 Jacobian 更敏感的方向。
            </p>
            <div class="metric-equivalence">
              <code>ridge(Jh)</code><b>≡</b><code>ridge<sub>J-metric</sub>(h)</code>
            </div>
          </div>
          <dl class="metric-prior-numbers">
            <div><dt>普通 raw ridge</dt><dd>${fmt(findings.metric_prior.raw_isotropic_brier, 6)}</dd></div>
            <div><dt>J probe</dt><dd>${fmt(findings.metric_prior.stored_J_brier, 9)}</dd></div>
            <div class="match"><dt>raw + 精确 J metric</dt><dd>${fmt(findings.metric_prior.raw_with_exact_J_metric_brier, 9)}</dd></div>
            <div><dt>J − matched raw</dt><dd>${findings.metric_prior.J_minus_matched_brier.toExponential(2)}</dd></div>
          </dl>
          <div class="metric-prior-time">
            <div class="metric-prior-time-head">
              <span>checkpoint</span><span>J Brier</span><span>ordinary raw</span>
              <span>raw + J metric</span><span>J − matched</span><span>JQ rank p · C=.003</span>
            </div>
            ${(findings.metric_prior.time_comparison || []).map((row) => `
              <div class="${row.offset === 256 ? "metric-prior-time-row active" : "metric-prior-time-row"}">
                <strong>t=${row.offset}</strong>
                <code>${fmt(row.stored_J_brier, 6)}</code>
                <code>${fmt(row.raw_isotropic_brier, 6)}</code>
                <code>${fmt(row.raw_with_exact_J_metric_brier, 6)}</code>
                <code>${Number(row.J_minus_matched_brier).toExponential(1)}</code>
                <code>${fmt(row.random_alignment_rank_p, 4)}</code>
              </div>
            `).join("")}
          </div>
          <p class="metric-prior-foot">
            64 / 128 / 256 三个 checkpoint 都满足 J ≈ raw + exact J metric；
            前三列 Brier 使用 nested fold-specific C，JQ empirical rank p
            则固定 C=.003，且三个 checkpoint 仍来自事后 screen。
            但 t=128 的保谱随机输入方向检验 p=${fmt(
              findings.metric_prior.time_comparison?.find((row) => row.offset === 128)
                ?.random_alignment_rank_p,
              3,
            )}，说明“J 优于 ordinary raw”本身还不足以证明 official
            Jacobian alignment 特殊。t=256 只是当前最强的 prospective pocket，
            不是错误 onset。<br>
            6 个 outer-fold 的有效方向平均 cosine：
            J metric ${fmt(findings.metric_prior.J_effective_fold_direction_mean_cosine, 3)}
            vs 普通 raw ${fmt(findings.metric_prior.raw_fold_direction_mean_cosine, 3)}。
            学到的方向有 ${pct(findings.metric_prior.top_1pct_direction_energy)}
            能量落在 J 奇异谱 top 1%（各向同性期望
            ${pct(findings.metric_prior.isotropic_expected_top_1pct_energy)}）。
            这支持“有限样本几何先验”，还不是独立的新题 sample-efficiency 证明。
          </p>
        </div>
        <div class="two-panel-grid">${layerPanel(findings.layers_at_256, findings.nested_layer_at_256)}${phrasePanel(findings.phrase_hazard)}</div>
      </section>

      <section class="content-section" id="explore">
        ${sectionTitle("03", "DIVERGENT EXPLORATION · ROUND 2", "把几个关键词之外的方向都试一遍，真正留下什么？", "以下 9 项都从实验 artifact 自动抽取。重点不是再制造一个好看的分数，而是区分机制、混淆、跨时间泛化、无标签选择、部署成本和真实 retry 效果。")}
        ${explorationPanel(findings.exploration_v2)}
      </section>

      <section class="content-section" id="retry">
        ${sectionTitle("04", "从分析走向行动", "如果要利用它重试，正确的系统形态是什么？", "当前证据支持“先并行、后相对筛选”的实验，不支持监控单条输出并在某个 J Δ 阈值处打断。")}
        ${selectionPanel(findings.selection)}
        <div class="retry-design">
          <article><span>01 · FAN OUT</span><h3>同题生成 4–8 条前缀</h3><p>用匹配采样预算生成到冻结的 t=256；不看未来代码，不动态挑时间点。</p></article>
          <article><span>02 · SCORE</span><h3>固定 L24 / t256 读出</h3><p>先在开发集冻结 J ranker，同时保留 raw h、logit、随机选择三组基线。</p></article>
          <article><span>03 · PRUNE</span><h3>只继续 Top-1 或 Top-2</h3><p>评估最终 pass@selected、节省 token、误杀本来会成功分支的概率。</p></article>
          <article><span>04 · PROSPECTIVE</span><h3>只在全新题上报一次</h3><p>至少 100 个混合正误任务；不能再按结果挑 layer、checkpoint 或 concept。</p></article>
        </div>
        ${steeringPanel(findings.steering)}
      </section>

      <section class="content-section section-dark" id="problems">
        ${sectionTitle("05", "RAW EVIDENCE", "10 道原题与完整保存的失败采样", "这里展示模型实际收到的原始题面/测试，以及逐字符串保存的原始响应；其中 3 条命中 3072-token 生成上限。可以直接核对每题，不需要依赖我们对关键词的解释。")}
        ${problemArchive(traces)}
      </section>

      <section class="content-section" id="method">
        ${sectionTitle("06", "CLAIM BOUNDARY", "严格做到什么，仍然缺什么", "这是一轮 10 题 pilot。它的价值是排除错误方向并冻结下一轮实验，不是给出部署结论。")}
        <div class="method-grid">
          <article class="method-card can"><h3>本轮已经控制</h3><ul>
            <li>每个轨迹 × checkpoint 单独 exact-prefix forward。</li>
            <li>477/477 前缀 token/hash 与输入一致。</li>
            <li>同可见前缀、不同未来 suffix 的 raw/J/logit 逐 bit 相同。</li>
            <li>外层按完整任务 LOTO，内层选择正则；没有把同题泄漏到测试折。</li>
            <li>标签置换、保谱随机 J、raw/logit/surface、跨层和 coding-domain lens 对照。</li>
          </ul></article>
          <article class="method-card cannot"><h3>本轮仍不能宣称</h3><ul>
            <li>J-space 能恢复模型完整思维或自然语言 CoT。</li>
            <li>256 token 是通用的错误开始时刻。</li>
            <li>只看一条轨迹就能决定 retry。</li>
            <li>J Top-1 已经显著优于 raw hidden state。</li>
            <li>steering 或 J-space SFT 已经提升 coding pass@1。</li>
          </ul></article>
        </div>
        <div class="theory-note"><strong>一个重要的数学边界</strong><p>J@h 是 h 的确定性线性变换，不会凭空增加 correctness 信息。它可能有价值的地方，是把“未来敏感方向”变成一个小样本下更合适的几何先验。因此所有 J 收益都必须和 raw h、随机保谱变换、匹配正则严格比较。</p></div>
        <details class="provenance"><summary>展开全部结果文件 provenance</summary><dl>
          ${Object.entries(findings.provenance).map(([name, path]) => `<div><dt>${escapeHtml(name)}</dt><dd><code>${escapeHtml(path)}</code></dd></div>`).join("")}
        </dl></details>
      </section>

      <footer><div><strong>J-space × Coding · strict pilot</strong><span>Qwen3.5-4B · MBPP+ · generated ${escapeHtml(findings.generated_at.slice(0, 10))}</span></div><p>公开页面 · 无需 ChatGPT 登录 · 原题与原始轨迹已内嵌</p><a href="#top">回到顶部 ↑</a></footer>
    </main>
  `;

  const filter = document.querySelector("#problemFilter");
  const count = document.querySelector("#problemCount");
  const problemItems = [...document.querySelectorAll(".problem-item")];
  filter?.addEventListener("input", () => {
    const query = filter.value.trim().toLowerCase();
    let visible = 0;
    problemItems.forEach((item) => {
      const show = !query || item.dataset.search.includes(query);
      item.hidden = !show;
      if (show) visible += 1;
    });
    if (count) count.textContent = `${visible} / ${problemItems.length} 道题`;
  });
}


Promise.all([
  fetch("data/strict_findings_dashboard.json", { cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error(`findings HTTP ${response.status}`);
    return response.json();
  }),
  fetch("data/prefix_signal_dashboard.json", { cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error(`problems HTTP ${response.status}`);
    return response.json();
  }),
])
  .then(([findings, raw]) => render(findings, Array.isArray(raw.traces) ? raw.traces : []))
  .catch((reason) => {
    app.innerHTML = `
      <main class="loading error">
        <span>!</span>
        <h1>数据载入失败</h1>
        <p>${escapeHtml(reason?.message || "未知错误")}</p>
      </main>
    `;
  });
