// 数据文件路径（GitHub Pages 部署后相对于 web/ 目录）
const DATA_URL = "../data/commodities.json";

// ECharts 公共配置
const CHART_THEME = {
  backgroundColor: "transparent",
  textStyle: { color: "#8b90a8", fontSize: 11 },
  grid: { top: 12, right: 12, bottom: 28, left: 50, containLabel: false },
  xAxis: {
    type: "time",
    axisLine: { lineStyle: { color: "#2e3248" } },
    axisLabel: { color: "#8b90a8", fontSize: 10, formatter: (v) => formatAxisDate(v) },
    splitLine: { show: false },
  },
  yAxis: {
    type: "value",
    axisLine: { show: false },
    axisLabel: { color: "#8b90a8", fontSize: 10 },
    splitLine: { lineStyle: { color: "#2e3248", type: "dashed" } },
  },
};

function formatAxisDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function filterByRange(data, range) {
  if (!data || !data.length) return [];
  const now = new Date();
  const cutoff = new Date(now);
  if (range === "1m") cutoff.setMonth(cutoff.getMonth() - 1);
  else if (range === "3m") cutoff.setMonth(cutoff.getMonth() - 3);
  else if (range === "6m") cutoff.setMonth(cutoff.getMonth() - 6);
  else cutoff.setFullYear(cutoff.getFullYear() - 1);
  return data.filter((d) => new Date(d.date) >= cutoff);
}

function buildPriceOption(data, unit) {
  if (!data.length) return null;
  const color = "#4f8ef7";
  return {
    ...CHART_THEME,
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1a1d27",
      borderColor: "#2e3248",
      textStyle: { color: "#e4e6f0", fontSize: 11 },
      formatter: (params) => {
        const p = params[0];
        const d = new Date(p.value[0]);
        return `${d.toLocaleDateString("zh-CN")}<br/>${p.value[1].toLocaleString()} ${unit}`;
      },
    },
    xAxis: { ...CHART_THEME.xAxis },
    yAxis: {
      ...CHART_THEME.yAxis,
      axisLabel: {
        ...CHART_THEME.yAxis.axisLabel,
        formatter: (v) => v >= 10000 ? (v / 10000).toFixed(1) + "万" : v.toLocaleString(),
      },
    },
    series: [{
      type: "line",
      smooth: true,
      symbol: "none",
      lineStyle: { color, width: 2 },
      areaStyle: {
        color: {
          type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: "rgba(79,142,247,0.25)" },
            { offset: 1, color: "rgba(79,142,247,0)" },
          ],
        },
      },
      data: data.map((d) => [d.date, d.price]),
    }],
  };
}

function buildOIOption(data) {
  if (!data.length) return null;
  return {
    ...CHART_THEME,
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1a1d27",
      borderColor: "#2e3248",
      textStyle: { color: "#e4e6f0", fontSize: 11 },
      formatter: (params) => {
        const p = params[0];
        const d = new Date(p.value[0]);
        return `${d.toLocaleDateString("zh-CN")}<br/>持仓量: ${p.value[1].toLocaleString()} 手`;
      },
    },
    xAxis: { ...CHART_THEME.xAxis },
    yAxis: {
      ...CHART_THEME.yAxis,
      axisLabel: {
        ...CHART_THEME.yAxis.axisLabel,
        formatter: (v) => v >= 10000 ? (v / 10000).toFixed(0) + "万" : v,
      },
    },
    series: [{
      type: "bar",
      barMaxWidth: 8,
      itemStyle: { color: "#7c5cfc", borderRadius: [2, 2, 0, 0] },
      data: data.map((d) => [d.date, d.value]),
    }],
  };
}

function buildInventoryOption(data) {
  if (!data.length) return null;
  return {
    ...CHART_THEME,
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1a1d27",
      borderColor: "#2e3248",
      textStyle: { color: "#e4e6f0", fontSize: 11 },
      formatter: (params) => {
        const p = params[0];
        const d = new Date(p.value[0]);
        return `${d.toLocaleDateString("zh-CN")}<br/>库存: ${p.value[1].toLocaleString()} 吨`;
      },
    },
    xAxis: { ...CHART_THEME.xAxis },
    yAxis: { ...CHART_THEME.yAxis },
    series: [{
      type: "line",
      smooth: true,
      symbol: "none",
      lineStyle: { color: "#26c281", width: 2 },
      areaStyle: {
        color: {
          type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: "rgba(38,194,129,0.2)" },
            { offset: 1, color: "rgba(38,194,129,0)" },
          ],
        },
      },
      data: data.map((d) => [d.date, d.value]),
    }],
  };
}

function showNoData(container) {
  container.innerHTML = '<div class="no-data">暂无数据</div>';
}

function renderCard(commodity) {
  const tpl = document.getElementById("card-template");
  const card = tpl.content.cloneNode(true);
  const el = (sel) => card.querySelector(sel);

  el(".commodity-name").textContent = commodity.name;

  const badge = el(".commodity-type-badge");
  if (commodity.has_futures) {
    badge.textContent = "期货";
    badge.classList.add("badge-futures");
  } else {
    badge.textContent = "现货";
    badge.classList.add("badge-spot");
  }

  const priceEl = el(".latest-price");
  const changeEl = el(".price-change");
  if (commodity.latest_price != null) {
    priceEl.textContent = commodity.latest_price.toLocaleString();
    el(".price-unit").textContent = commodity.unit || "";
    if (commodity.price_change_pct != null) {
      const chg = commodity.price_change_pct;
      changeEl.textContent = (chg >= 0 ? "▲ +" : "▼ ") + chg.toFixed(2) + "%";
      changeEl.classList.add(chg > 0 ? "up" : chg < 0 ? "down" : "flat");
    }
  } else {
    priceEl.textContent = "—";
    changeEl.textContent = "暂无价格";
    changeEl.classList.add("flat");
  }

  // 显示期货专属区域
  if (commodity.has_futures) {
    el(".futures-section").classList.remove("hidden");
  }

  // 把 DocumentFragment 插入 grid 前先拿到真实节点引用
  const grid = document.getElementById("commodity-grid");
  grid.appendChild(card);
  const articleEl = grid.lastElementChild;

  // ── 价格趋势图 ──
  const priceDom = articleEl.querySelector(".price-chart");
  const priceChart = echarts.init(priceDom);
  let currentRange = "1m";

  function renderPriceChart(range) {
    const filtered = filterByRange(commodity.price_history, range);
    const option = buildPriceOption(filtered, commodity.unit || "");
    if (option) {
      priceChart.setOption(option, true);
    } else {
      showNoData(priceDom);
    }
  }
  renderPriceChart(currentRange);

  articleEl.querySelectorAll(".price-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      articleEl.querySelectorAll(".price-tabs .tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentRange = btn.dataset.range;
      renderPriceChart(currentRange);
    });
  });

  // ── 持仓量图 ──
  if (commodity.has_futures) {
    const oiDom = articleEl.querySelector(".oi-chart");
    const oiData = filterByRange(commodity.open_interest, "1y");
    const oiOption = buildOIOption(oiData);
    if (oiOption) {
      echarts.init(oiDom).setOption(oiOption);
    } else {
      showNoData(oiDom);
    }

    // ── 库存图 ──
    const invDom = articleEl.querySelector(".inventory-chart");
    const invData = filterByRange(commodity.inventory, "1y");
    const invOption = buildInventoryOption(invData);
    if (invOption) {
      echarts.init(invDom).setOption(invOption);
    } else {
      showNoData(invDom);
    }
  }

  // 响应窗口大小变化
  window.addEventListener("resize", () => priceChart.resize());
}

async function init() {
  try {
    const resp = await fetch(DATA_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    // 更新时间
    const meta = data["_meta"] || {};
    const timeEl = document.getElementById("update-time");
    timeEl.textContent = meta.updated_at ? `数据更新：${meta.updated_at}` : "";

    // 过滤出品种数据（去掉 _meta）
    const commodities = Object.values(data).filter((v) => v && v.id);

    // 渲染每个品种
    const grid = document.getElementById("commodity-grid");
    grid.classList.remove("hidden");
    commodities.forEach(renderCard);

    document.getElementById("loading").classList.add("hidden");
  } catch (err) {
    console.error(err);
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("error-screen").classList.remove("hidden");
  }
}

init();
