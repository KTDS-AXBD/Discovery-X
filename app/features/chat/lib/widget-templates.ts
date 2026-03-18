/**
 * 위젯 템플릿 6종 — Generative UI (F48)
 * 각 템플릿은 data 인자를 받아 iframe srcdoc 내부에 삽입할 HTML string을 반환하는 순수 함수.
 * CSS 변수(--color-*)를 사용해 호스트 테마와 동기화.
 * 내부 스크립트는 widget:data-ready 이벤트로 __WIDGET_DATA__ 업데이트 지원.
 */

import type { WidgetType } from "./widget-protocol";

// ─── HTML escape ────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Main Dispatcher ────────────────────────────────────────────

export function getWidgetTemplate(
  widgetType: WidgetType,
  data: Record<string, unknown>,
): string {
  switch (widgetType) {
    case "chart":
      return chartTemplate(data);
    case "diagram":
      return diagramTemplate(data);
    case "table":
      return tableTemplate(data);
    case "metric-card":
      return metricCardTemplate(data);
    case "timeline":
      return timelineTemplate(data);
    case "comparison":
      return comparisonTemplate(data);
    default:
      return `<div style="padding:16px;color:var(--color-fg-error,#ef4444)">지원하지 않는 위젯 타입: ${esc(String(widgetType))}</div>`;
  }
}

// ─── 1. Chart (bar / pie / line) ────────────────────────────────

export function chartTemplate(data: Record<string, unknown>): string {
  const chartType = String(data.chartType || "bar");
  const labels = Array.isArray(data.labels) ? data.labels.map(String) : [];
  const values = Array.isArray(data.values) ? data.values.map(Number) : [];
  const title = data.title ? String(data.title) : "";
  // JSON 내부의 </script> 방지 — \u003c로 이스케이프
  const safeData = JSON.stringify({ chartType, labels, values, title })
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");

  return `<div style="padding:12px">
${title ? `<div style="font-size:14px;font-weight:600;color:var(--color-fg,#1a1a2e);margin-bottom:8px">${esc(title)}</div>` : ""}
<canvas id="c" style="width:100%;height:220px"></canvas>
</div>
<script>
(function(){
  var D=${safeData};
  window.addEventListener('widget:data-ready',function(){if(window.__WIDGET_DATA__)D=window.__WIDGET_DATA__;draw()});
  function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim()}
  var COLORS=['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6'];

  function draw(){
    var cv=document.getElementById('c');if(!cv)return;
    cv.width=cv.offsetWidth;cv.height=220;
    var ctx=cv.getContext('2d');
    var fg=css('--color-fg')||'#1a1a2e';
    var br=css('--color-fg-brand')||'#6366f1';
    var ln=css('--color-line-subtle')||'#e2e8f0';
    var sc=css('--color-fg-secondary')||'#64748b';
    ctx.clearRect(0,0,cv.width,cv.height);
    if(D.chartType==='pie') drawPie(ctx,cv,sc);
    else if(D.chartType==='line') drawLine(ctx,cv,br,fg,ln,sc);
    else drawBar(ctx,cv,br,fg,ln,sc);
  }

  function drawBar(ctx,cv,br,fg,ln,sc){
    var n=Math.min(D.labels.length,D.values.length);if(!n)return;
    var mx=Math.max.apply(null,D.values)||1,pad=40,cH=cv.height-50;
    var gap=(cv.width-pad*2)/n,bW=Math.max(12,gap*0.6);
    ctx.strokeStyle=ln;ctx.lineWidth=0.5;
    for(var i=0;i<=4;i++){var y=pad+(cH-pad)*(1-i/4);ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(cv.width-10,y);ctx.stroke()}
    for(var i=0;i<n;i++){
      var h=(D.values[i]/mx)*(cH-pad),x=pad+gap*i+(gap-bW)/2,y=cH-h;
      ctx.fillStyle=br;ctx.fillRect(x,y,bW,h);
      ctx.fillStyle=fg;ctx.font='10px sans-serif';ctx.textAlign='center';
      ctx.fillText(String(D.values[i]),x+bW/2,y-4);
      ctx.fillStyle=sc;ctx.fillText(D.labels[i]||'',x+bW/2,cH+14);
    }
  }

  function drawLine(ctx,cv,br,fg,ln,sc){
    var n=Math.min(D.labels.length,D.values.length);if(n<2)return;
    var mx=Math.max.apply(null,D.values)||1,pad=40,cH=cv.height-50;
    var gap=(cv.width-pad*2)/(n-1);
    ctx.strokeStyle=ln;ctx.lineWidth=0.5;
    for(var i=0;i<=4;i++){var y=pad+(cH-pad)*(1-i/4);ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(cv.width-10,y);ctx.stroke()}
    ctx.strokeStyle=br;ctx.lineWidth=2;ctx.beginPath();
    for(var i=0;i<n;i++){var x=pad+gap*i,y=cH-(D.values[i]/mx)*(cH-pad);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)}
    ctx.stroke();
    for(var i=0;i<n;i++){
      var x=pad+gap*i,y=cH-(D.values[i]/mx)*(cH-pad);
      ctx.fillStyle=br;ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=fg;ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText(String(D.values[i]),x,y-8);
      ctx.fillStyle=sc;ctx.fillText(D.labels[i]||'',x,cH+14);
    }
  }

  function drawPie(ctx,cv,sc){
    var n=D.values.length;if(!n)return;
    var total=D.values.reduce(function(a,b){return a+b},0)||1;
    var cx=cv.width/3,cy=cv.height/2,r=Math.min(cx,cy)-20;
    var angle=-Math.PI/2;
    for(var i=0;i<n;i++){
      var sl=(D.values[i]/total)*Math.PI*2;
      ctx.fillStyle=COLORS[i%COLORS.length];
      ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,angle,angle+sl);ctx.closePath();ctx.fill();
      angle+=sl;
    }
    var lx=cv.width*0.62;
    for(var i=0;i<n;i++){
      var ly=16+i*20;
      ctx.fillStyle=COLORS[i%COLORS.length];ctx.fillRect(lx,ly,10,10);
      ctx.fillStyle=sc;ctx.font='11px sans-serif';ctx.textAlign='left';
      ctx.fillText((D.labels[i]||'')+'  '+D.values[i],lx+16,ly+9);
    }
  }

  draw();
})();
</script>`;
}

// ─── 2. Diagram (flowchart) ─────────────────────────────────────

export function diagramTemplate(data: Record<string, unknown>): string {
  const nodes = Array.isArray(data.nodes)
    ? (data.nodes as Array<{ id: string; label: string }>)
    : [];
  const edges = Array.isArray(data.edges)
    ? (data.edges as Array<{ from: string; to: string; label?: string }>)
    : [];

  // 단순 top-to-bottom 레이아웃: 노드 순서대로 세로 배치
  const nodeW = 160;
  const nodeH = 40;
  const gapY = 60;
  const svgW = 400;
  const svgH = Math.max(100, nodes.length * (nodeH + gapY));

  const posMap: Record<string, { x: number; y: number }> = {};
  const nodesSvg = nodes
    .map((n, i) => {
      const x = svgW / 2 - nodeW / 2;
      const y = 20 + i * (nodeH + gapY);
      posMap[n.id] = { x: x + nodeW / 2, y: y + nodeH / 2 };
      return `<rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="6" fill="var(--color-surface-card,#f8fafc)" stroke="var(--color-line,#cbd5e1)" stroke-width="1.5"/>
<text x="${x + nodeW / 2}" y="${y + nodeH / 2 + 4}" text-anchor="middle" font-size="12" fill="var(--color-fg,#1a1a2e)">${esc(n.label)}</text>`;
    })
    .join("\n");

  const edgesSvg = edges
    .map((e) => {
      const from = posMap[e.from];
      const to = posMap[e.to];
      if (!from || !to) return "";
      const fy = from.y + nodeH / 2;
      const ty = to.y - nodeH / 2;
      const midY = (fy + ty) / 2;
      const labelSvg = e.label
        ? `<text x="${(from.x + to.x) / 2 + 8}" y="${midY}" font-size="10" fill="var(--color-fg-secondary,#64748b)">${esc(e.label)}</text>`
        : "";
      return `<path d="M${from.x},${fy} C${from.x},${midY} ${to.x},${midY} ${to.x},${ty}" fill="none" stroke="var(--color-fg-tertiary,#94a3b8)" stroke-width="1.5" marker-end="url(#arrow)"/>
${labelSvg}`;
    })
    .join("\n");

  return `<div style="padding:8px;overflow-x:auto">
<svg width="100%" viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg">
  <defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="var(--color-fg-tertiary,#94a3b8)"/>
  </marker></defs>
  ${edgesSvg}
  ${nodesSvg}
</svg>
</div>`;
}

// ─── 3. Table (sortable) ────────────────────────────────────────

export function tableTemplate(data: Record<string, unknown>): string {
  const columns = Array.isArray(data.columns) ? data.columns.map(String) : [];
  const rows = Array.isArray(data.rows)
    ? (data.rows as (string | number)[][])
    : [];

  const headerCells = columns
    .map(
      (col, i) =>
        `<th data-col="${i}" style="padding:8px 12px;text-align:left;cursor:pointer;user-select:none;border-bottom:2px solid var(--color-line,#cbd5e1);font-size:12px;font-weight:600;color:var(--color-fg,#1a1a2e);white-space:nowrap">${esc(col)} <span style="opacity:0.4">↕</span></th>`,
    )
    .join("");

  const bodyRows = rows
    .map(
      (row, ri) =>
        `<tr style="background:${ri % 2 === 0 ? "transparent" : "var(--color-surface-secondary,#f1f5f9)"}">${row.map((cell) => `<td style="padding:6px 12px;font-size:12px;color:var(--color-fg-secondary,#475569);border-bottom:1px solid var(--color-line-subtle,#e2e8f0)">${esc(String(cell))}</td>`).join("")}</tr>`,
    )
    .join("\n");

  return `<div style="padding:4px;overflow-x:auto">
<table id="t" style="width:100%;border-collapse:collapse">
<thead><tr>${headerCells}</tr></thead>
<tbody>${bodyRows}</tbody>
</table>
</div>
<script>
(function(){
  var asc={};
  document.querySelectorAll('#t thead th').forEach(function(th){
    th.addEventListener('click',function(){
      var ci=+th.dataset.col,tb=document.querySelector('#t tbody');
      var rows=Array.from(tb.querySelectorAll('tr'));
      asc[ci]=!asc[ci];
      rows.sort(function(a,b){
        var av=a.children[ci]?a.children[ci].textContent:'';
        var bv=b.children[ci]?b.children[ci].textContent:'';
        var an=parseFloat(av),bn=parseFloat(bv);
        if(!isNaN(an)&&!isNaN(bn))return asc[ci]?an-bn:bn-an;
        return asc[ci]?av.localeCompare(bv):bv.localeCompare(av);
      });
      rows.forEach(function(r,i){
        r.style.background=i%2===0?'transparent':'var(--color-surface-secondary,#f1f5f9)';
        tb.appendChild(r);
      });
    });
  });
})();
</script>`;
}

// ─── 4. Metric Card ─────────────────────────────────────────────

export function metricCardTemplate(data: Record<string, unknown>): string {
  const metrics = Array.isArray(data.metrics)
    ? (data.metrics as Array<{
        label: string;
        value: string | number;
        delta?: string;
        deltaType?: "positive" | "negative" | "neutral";
      }>)
    : [];

  const deltaColor = (type?: string): string => {
    if (type === "positive") return "var(--color-fg-success,#16a34a)";
    if (type === "negative") return "var(--color-fg-error,#ef4444)";
    return "var(--color-fg-tertiary,#94a3b8)";
  };

  const cards = metrics
    .map(
      (m) => `<div style="background:var(--color-surface-card,#ffffff);border:1px solid var(--color-line-subtle,#e2e8f0);border-radius:8px;padding:14px">
  <div style="font-size:11px;color:var(--color-fg-secondary,#64748b);margin-bottom:4px">${esc(m.label)}</div>
  <div style="font-size:22px;font-weight:700;color:var(--color-fg,#1a1a2e)">${esc(String(m.value))}</div>
  ${m.delta ? `<div style="font-size:11px;margin-top:4px;color:${deltaColor(m.deltaType)}">${esc(m.delta)}</div>` : ""}
</div>`,
    )
    .join("\n");

  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;padding:12px">
${cards}
</div>`;
}

// ─── 5. Timeline ────────────────────────────────────────────────

export function timelineTemplate(data: Record<string, unknown>): string {
  const events = Array.isArray(data.events)
    ? (data.events as Array<{
        date: string;
        title: string;
        description?: string;
      }>)
    : [];

  const items = events
    .map(
      (ev) => `<div style="display:flex;gap:12px;position:relative;padding-bottom:20px">
  <div style="flex-shrink:0;width:16px;display:flex;flex-direction:column;align-items:center">
    <div style="width:10px;height:10px;border-radius:50%;background:var(--color-fg-brand,#6366f1);position:relative;z-index:1"></div>
    <div style="width:2px;flex:1;background:var(--color-line-subtle,#e2e8f0)"></div>
  </div>
  <div style="padding-bottom:4px">
    <div style="font-size:10px;color:var(--color-fg-tertiary,#94a3b8)">${esc(ev.date)}</div>
    <div style="font-size:13px;font-weight:600;color:var(--color-fg,#1a1a2e)">${esc(ev.title)}</div>
    ${ev.description ? `<div style="font-size:12px;color:var(--color-fg-secondary,#64748b);margin-top:2px">${esc(ev.description)}</div>` : ""}
  </div>
</div>`,
    )
    .join("\n");

  return `<div style="padding:12px">${items}</div>`;
}

// ─── 6. Comparison ──────────────────────────────────────────────

export function comparisonTemplate(data: Record<string, unknown>): string {
  const dimensions = Array.isArray(data.dimensions)
    ? data.dimensions.map(String)
    : [];
  const items = Array.isArray(data.items)
    ? (data.items as Array<{
        label: string;
        values: Record<string, string | number>;
      }>)
    : [];

  if (!items.length) {
    return `<div style="padding:16px;color:var(--color-fg-tertiary,#94a3b8);text-align:center;font-size:12px">비교 데이터 없음</div>`;
  }

  const thStyle =
    "padding:8px 12px;text-align:center;font-size:12px;font-weight:600;color:var(--color-fg,#1a1a2e);border-bottom:2px solid var(--color-line,#cbd5e1);white-space:nowrap";
  const tdStyle =
    "padding:8px 12px;text-align:center;font-size:12px;color:var(--color-fg-secondary,#475569);border-bottom:1px solid var(--color-line-subtle,#e2e8f0)";
  const tdLabelStyle =
    "padding:8px 12px;font-size:12px;font-weight:500;color:var(--color-fg,#1a1a2e);border-bottom:1px solid var(--color-line-subtle,#e2e8f0)";

  const header = `<tr><th style="${thStyle};text-align:left">항목</th>${items.map((it) => `<th style="${thStyle}">${esc(it.label)}</th>`).join("")}</tr>`;

  const rows = dimensions
    .map(
      (dim, ri) =>
        `<tr style="background:${ri % 2 === 0 ? "transparent" : "var(--color-surface-secondary,#f1f5f9)"}"><td style="${tdLabelStyle}">${esc(dim)}</td>${items.map((it) => `<td style="${tdStyle}">${esc(String(it.values[dim] ?? "-"))}</td>`).join("")}</tr>`,
    )
    .join("\n");

  return `<div style="padding:4px;overflow-x:auto">
<table style="width:100%;border-collapse:collapse">
<thead>${header}</thead>
<tbody>${rows}</tbody>
</table>
</div>`;
}
