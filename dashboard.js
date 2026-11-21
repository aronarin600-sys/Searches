/**
 * ==============================================================================
 * SPACFX Trading Performance Dashboard
 * ==============================================================================
 * Everything here is calculated from the DAYS list and the HIDE_USD /
 * ALLOW_TOGGLE settings at the top of index.html. You never need to edit this
 * file to update results: just add, change or remove lines in DAYS.
 *
 * DAYS row format: ["YYYY-MM-DD", net pips, number of trades, net R, net USD]
 * A day is a "winning day" when its net pips are above zero.
 */
(function () {
    "use strict";

    const $ = (id) => document.getElementById(id);
    if (!$("tpd")) return;

    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
    const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const MINUS = "−";
    const REDUCED_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ------------------------------------------------------------------
    // DATA — clean, merge same-date rows, sort, add running total
    // ------------------------------------------------------------------
    const toNum = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
    const round2 = (x) => Math.round(x * 100) / 100;
    const pad2 = (n) => String(n).padStart(2, "0");

    const source = (typeof DAYS !== "undefined" && Array.isArray(DAYS)) ? DAYS : [];
    const byDate = new Map();
    source.forEach((row) => {
        if (!Array.isArray(row)) return;
        const date = String(row[0] || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        const d = byDate.get(date) || { date, pips: 0, trades: 0, r: 0, usd: 0 };
        d.pips = round2(d.pips + toNum(row[1]));
        d.trades += toNum(row[2]);
        d.r = round2(d.r + toNum(row[3]));
        d.usd = round2(d.usd + toNum(row[4]));
        byDate.set(date, d);
    });

    const days = Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let running = 0;
    days.forEach((d) => { running = round2(running + d.pips); d.cum = running; });

    let hideUsd = typeof HIDE_USD !== "undefined" ? !!HIDE_USD : false;
    const allowToggle = typeof ALLOW_TOGGLE !== "undefined" ? !!ALLOW_TOGGLE : true;

    // ------------------------------------------------------------------
    // FORMATTING
    // ------------------------------------------------------------------
    const sign = (v) => (v > 0 ? "+" : v < 0 ? MINUS : "");
    const num = (v, dp) => Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: dp });
    const fPips = (v) => sign(v) + num(v, 1);
    const fR = (v) => sign(v) + num(v, 2) + "R";
    const fUsd = (v) => (hideUsd ? "$•••" : sign(v) + "$" + num(v, 2));
    const tone = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "flat");
    const usdHtml = (v) => `<span class="${hideUsd ? "masked" : tone(v)}">${fUsd(v)}</span>`;

    const parseDate = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
    const fDateShort = (s) => { const d = parseDate(s); return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`; };
    const fDateDow = (s) => { const d = parseDate(s); return `${DOW[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`; };
    const fDateFull = (s) => `${fDateDow(s)}, ${s.slice(0, 4)}`;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

    // Count-up helper: whole numbers stay whole while animating
    const tween = (v, t) => {
        if (t >= 1) return v;
        const scale = Number.isInteger(v) ? 1 : 100;
        return Math.round(v * t * scale) / scale;
    };

    // ------------------------------------------------------------------
    // SUMMARY STATISTICS
    // ------------------------------------------------------------------
    function computeStats() {
        const n = days.length;
        const sum = (k) => round2(days.reduce((s, d) => s + d[k], 0));
        const winDays = days.filter((d) => d.pips > 0).length;
        const lossDays = days.filter((d) => d.pips < 0).length;
        const winsR = days.filter((d) => d.r > 0);
        const lossesR = days.filter((d) => d.r < 0);
        const grossWon = winsR.reduce((s, d) => s + d.r, 0);
        const grossLost = -lossesR.reduce((s, d) => s + d.r, 0);
        const avgWin = winsR.length ? grossWon / winsR.length : 0;
        const avgLoss = lossesR.length ? grossLost / lossesR.length : 0;
        let best = null, worst = null;
        days.forEach((d) => {
            if (!best || d.pips > best.pips) best = d;
            if (!worst || d.pips < worst.pips) worst = d;
        });
        return {
            n,
            pips: sum("pips"),
            r: sum("r"),
            usd: sum("usd"),
            trades: sum("trades"),
            winDays,
            lossDays,
            evenDays: n - winDays - lossDays,
            winPct: n ? (winDays / n) * 100 : 0,
            avgWin,
            avgLoss,
            rr: avgLoss > 0 ? avgWin / avgLoss : null,
            pf: grossLost > 0 ? grossWon / grossLost : (grossWon > 0 ? Infinity : null),
            best,
            worst,
        };
    }

    const S = computeStats();
    let statsT = REDUCED_MOTION ? 1 : 0;

    function renderStats(t) {
        statsT = t;
        const el = $("tpdStats");
        if (!S.n) {
            el.innerHTML = `<div class="tpd-stat" style="grid-column: 1 / -1;"><div class="tpd-stat-label">No data yet</div><div class="tpd-stat-sub">Add lines to the DAYS list at the top of index.html.</div></div>`;
            return;
        }
        const card = (label, valueHtml, sub) =>
            `<div class="tpd-stat"><div class="tpd-stat-label">${label}</div><div class="tpd-stat-value">${valueHtml}</div><div class="tpd-stat-sub">${sub}</div></div>`;

        const pips = tween(S.pips, t), r = tween(S.r, t), usd = tween(S.usd, t);
        const dayBreak = `${S.winDays}W · ${S.lossDays}L${S.evenDays ? ` · ${S.evenDays}BE` : ""}`;
        const rrText = S.rr === null ? "—" : `1:${(S.rr * Math.min(t, 1)).toFixed(2)}`;
        const pfText = S.pf === null ? "—" : (S.pf === Infinity ? "∞" : (S.pf * t).toFixed(2));

        el.innerHTML = [
            card("Net pips", `<span class="${tone(S.pips)}">${fPips(pips)}</span>`, `${plural(S.n, "trading day")}`),
            card("Net R", `<span class="${tone(S.r)}">${fR(r)}</span>`, `avg ${fR(round2(S.r / S.n))} / day`),
            card("Net USD", `<span class="${hideUsd ? "masked" : tone(S.usd)}">${fUsd(usd)}</span>`, hideUsd ? "Hidden" : `avg ${fUsd(round2(S.usd / S.n))} / day`),
            card("Day win %", `${(S.winPct * t).toFixed(1)}%`, dayBreak),
            card("Avg R:R", rrText, `win ${num(S.avgWin, 2)}R / loss ${num(S.avgLoss, 2)}R`),
            card("Profit factor", pfText, "gross R won ÷ R lost"),
            card("Best day", `<span class="${tone(S.best.pips)}">${fPips(tween(S.best.pips, t))}</span>`, `${fDateShort(S.best.date)} · ${fR(S.best.r)}`),
            card("Worst day", `<span class="${tone(S.worst.pips)}">${fPips(tween(S.worst.pips, t))}</span>`, `${fDateShort(S.worst.date)} · ${fR(S.worst.r)}`),
            card("Total trades", String(Math.round(S.trades * t)), `${(S.trades / S.n).toFixed(1)} per day`),
        ].join("");
    }

    // ------------------------------------------------------------------
    // CANVAS CHARTS
    // ------------------------------------------------------------------
    const tok = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const FONT = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    let chartP = REDUCED_MOTION ? 1 : 0; // draw-in progress 0..1
    const hover = { cum: -1, bar: -1 };
    const geom = { cum: null, bar: null };

    function prepCanvas(cv) {
        const box = cv.parentElement;
        const w = box.clientWidth, h = box.clientHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = Math.round(w * dpr), H = Math.round(h * dpr);
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        const ctx = cv.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        return { ctx, w, h };
    }

    function niceTicks(min, max, count) {
        if (min === max) { min -= 1; max += 1; }
        const raw = (max - min) / count;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const norm = raw / mag;
        const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
        const lo = Math.floor(min / step) * step;
        const hi = Math.ceil(max / step) * step;
        const ticks = [];
        for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
        return ticks;
    }

    // Shared frame: y-axis ticks + grid + date labels; returns scale helpers
    function frame(ctx, w, h, values) {
        const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 4);
        const lo = ticks[0], hi = ticks[ticks.length - 1];
        ctx.font = FONT;
        const labelW = Math.max(...ticks.map((t) => ctx.measureText(fPips(t)).width));
        const pad = { t: 10, r: 8, b: 24, l: Math.ceil(labelW) + 12 };
        const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
        const y = (v) => pad.t + ph - ((v - lo) / (hi - lo)) * ph;

        ctx.lineWidth = 1;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ticks.forEach((t) => {
            const yy = Math.round(y(t)) + 0.5;
            ctx.strokeStyle = t === 0 ? tok("--chart-axis") : tok("--chart-grid");
            ctx.globalAlpha = t === 0 ? 0.55 : 1;
            ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r, yy); ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = tok("--chart-axis");
            ctx.fillText(fPips(t), pad.l - 8, yy);
        });
        return { pad, pw, ph, y };
    }

    function dateLabels(ctx, w, h, pad, xAt) {
        if (!days.length) return;
        ctx.font = FONT;
        ctx.fillStyle = tok("--chart-axis");
        ctx.textBaseline = "alphabetic";
        const idx = days.length > 2 ? [0, Math.floor((days.length - 1) / 2), days.length - 1] : days.map((_, i) => i);
        idx.forEach((i, k) => {
            ctx.textAlign = k === 0 ? "left" : (k === idx.length - 1 ? "right" : "center");
            let x = xAt(i);
            if (k === 0) x = Math.max(pad.l, x - 4);
            if (k === idx.length - 1) x = Math.min(w - pad.r, x + 4);
            ctx.fillText(fDateShort(days[i].date), x, h - 6);
        });
    }

    function noData(ctx, w, h) {
        ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillStyle = tok("--text-dim");
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("No days entered yet", w / 2, h / 2);
    }

    function drawCumulative() {
        const cv = $("tpdCumChart");
        const { ctx, w, h } = prepCanvas(cv);
        if (!days.length) { noData(ctx, w, h); geom.cum = null; return; }

        const vals = days.map((d) => d.cum);
        const { pad, pw, y } = frame(ctx, w, h, vals);
        const n = days.length;
        const x = (i) => (n === 1 ? pad.l + pw / 2 : pad.l + (i / (n - 1)) * pw);
        geom.cum = { pad, pw, n, x, y };
        dateLabels(ctx, w, h, pad, x);

        const accent = tok("--accent");
        const base = y(0); // fill toward the zero line

        // Reveal from left to right while animating
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, pad.l + pw * chartP + 3, h);
        ctx.clip();

        // Soft filled area (accent → transparent toward the zero line)
        const grad = ctx.createLinearGradient(0, pad.t, 0, base);
        grad.addColorStop(0, hexA(accent, 0.28));
        grad.addColorStop(1, hexA(accent, 0.02));
        ctx.beginPath();
        ctx.moveTo(x(0), base);
        days.forEach((d, i) => ctx.lineTo(x(i), y(d.cum)));
        ctx.lineTo(x(n - 1), base);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Line
        ctx.beginPath();
        days.forEach((d, i) => (i ? ctx.lineTo(x(i), y(d.cum)) : ctx.moveTo(x(i), y(d.cum))));
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();

        // End-point marker once fully drawn
        if (chartP >= 1) dot(ctx, x(n - 1), y(days[n - 1].cum), accent);

        // Hover crosshair + marker
        const hi = hover.cum;
        if (hi >= 0 && hi < n) {
            const hx = x(hi), hy = y(days[hi].cum);
            ctx.strokeStyle = tok("--chart-axis");
            ctx.globalAlpha = 0.5;
            ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(Math.round(hx) + 0.5, pad.t); ctx.lineTo(Math.round(hx) + 0.5, h - pad.b); ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            dot(ctx, hx, hy, accent);
        }
    }

    function drawBars() {
        const cv = $("tpdBarChart");
        const { ctx, w, h } = prepCanvas(cv);
        if (!days.length) { noData(ctx, w, h); geom.bar = null; return; }

        const vals = days.map((d) => d.pips);
        const { pad, pw, y } = frame(ctx, w, h, vals);
        const n = days.length;
        const slot = pw / n;
        const bw = Math.max(2, Math.min(28, slot - Math.max(2, slot * 0.28)));
        const cx = (i) => pad.l + slot * i + slot / 2;
        geom.bar = { pad, slot, n, cx, y };
        dateLabels(ctx, w, h, pad, cx);

        const ease = 1 - Math.pow(1 - chartP, 3);
        const up = tok("--profit-green"), down = tok("--loss-red");
        const y0 = y(0);
        days.forEach((d, i) => {
            if (!d.pips) return;
            const v = d.pips * ease;
            ctx.globalAlpha = hover.bar >= 0 && hover.bar !== i ? 0.4 : 1;
            ctx.fillStyle = d.pips > 0 ? up : down;
            roundedBar(ctx, cx(i) - bw / 2, y0, bw, y(v), Math.min(4, bw / 2));
        });
        ctx.globalAlpha = 1;
    }

    function roundedBar(ctx, x, y0, bw, y1, r) {
        const top = Math.min(y0, y1), bot = Math.max(y0, y1);
        const hgt = bot - top;
        if (hgt < 0.5) return;
        const rr = Math.min(r, hgt);
        ctx.beginPath();
        if (y1 < y0) { // positive: round the top (data end)
            ctx.moveTo(x, bot);
            ctx.lineTo(x, top + rr);
            ctx.quadraticCurveTo(x, top, x + rr, top);
            ctx.lineTo(x + bw - rr, top);
            ctx.quadraticCurveTo(x + bw, top, x + bw, top + rr);
            ctx.lineTo(x + bw, bot);
        } else {       // negative: round the bottom (data end)
            ctx.moveTo(x, top);
            ctx.lineTo(x, bot - rr);
            ctx.quadraticCurveTo(x, bot, x + rr, bot);
            ctx.lineTo(x + bw - rr, bot);
            ctx.quadraticCurveTo(x + bw, bot, x + bw, bot - rr);
            ctx.lineTo(x + bw, top);
        }
        ctx.closePath();
        ctx.fill();
    }

    function dot(ctx, x, y, color) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = tok("--bg-card");
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }

    // "#a78bfa" + alpha → rgba(); falls back to the original string
    function hexA(hex, a) {
        const m = /^#?([0-9a-f]{6})$/i.exec(hex);
        if (!m) return hex;
        const v = parseInt(m[1], 16);
        return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
    }

    function drawCharts() {
        drawCumulative();
        drawBars();
    }

    function chartMeta() {
        if (!days.length) return;
        $("tpdCumMeta").innerHTML = `Total <b class="${tone(S.pips)}">${fPips(S.pips)}</b> pips`;
        $("tpdBarMeta").textContent = `${S.winDays} up · ${S.lossDays} down`;
    }

    // Tooltips
    function placeTip(tip, cv, px, py) {
        const bw = cv.clientWidth, bh = cv.clientHeight;
        const tw = tip.offsetWidth, th = tip.offsetHeight;
        let left = px + 14;
        if (left + tw > bw) left = px - tw - 14;
        left = Math.max(0, left);
        const top = Math.max(0, Math.min(bh - th, py - th - 12));
        tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    }

    function bindHover(cv, tip, key, indexAt, describe) {
        let touchTimer;
        const clear = () => {
            hover[key] = -1;
            tip.classList.remove("show");
            drawCharts();
        };
        const move = (e) => {
            const g = geom[key];
            if (!g) return;
            const rect = cv.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const i = indexAt(g, px);
            if (i < 0 || i >= days.length) { if (hover[key] !== -1) clear(); return; }
            if (hover[key] !== i) {
                hover[key] = i;
                tip.innerHTML = describe(days[i]);
                drawCharts();
            }
            tip.classList.add("show");
            const anchorX = key === "cum" ? g.x(i) : g.cx(i);
            const anchorY = key === "cum" ? g.y(days[i].cum) : g.y(Math.max(0, days[i].pips));
            placeTip(tip, cv, anchorX, anchorY);
            if (e.pointerType && e.pointerType !== "mouse") {
                clearTimeout(touchTimer);
                touchTimer = setTimeout(clear, 2500);
            }
        };
        cv.addEventListener("pointermove", move);
        cv.addEventListener("pointerdown", move);
        cv.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") clear(); });
    }

    bindHover($("tpdCumChart"), $("tpdCumTip"), "cum",
        (g, px) => (g.n === 1 ? 0 : Math.max(0, Math.min(g.n - 1, Math.round(((px - g.pad.l) / g.pw) * (g.n - 1))))),
        (d) => `<strong>${fDateDow(d.date)}</strong>Total <span class="${tone(d.cum)}">${fPips(d.cum)}</span> pips<br>Day <span class="${tone(d.pips)}">${fPips(d.pips)}</span> pips`);

    bindHover($("tpdBarChart"), $("tpdBarTip"), "bar",
        (g, px) => Math.floor((px - g.pad.l) / g.slot),
        (d) => `<strong>${fDateDow(d.date)}</strong><span class="${tone(d.pips)}">${fPips(d.pips)}</span> pips · <span class="${tone(d.r)}">${fR(d.r)}</span><br>${plural(d.trades, "trade")} · ${usdHtml(d.usd)}`);

    // ------------------------------------------------------------------
    // MONTHLY CALENDAR
    // ------------------------------------------------------------------
    const anchor = days.length ? days[days.length - 1].date : todayStr;
    const view = { y: +anchor.slice(0, 4), m: +anchor.slice(5, 7) - 1 };

    function renderCalendar() {
        const { y, m } = view;
        const prefix = `${y}-${pad2(m + 1)}`;
        $("tpdMonth").textContent = `${MONTHS[m]} ${y}`;

        const inMonth = days.filter((d) => d.date.startsWith(prefix));
        const mp = round2(inMonth.reduce((s, d) => s + d.pips, 0));
        const mr = round2(inMonth.reduce((s, d) => s + d.r, 0));
        const mu = round2(inMonth.reduce((s, d) => s + d.usd, 0));
        $("tpdMonthSum").innerHTML =
            `<span>Pips <b class="${tone(mp)}">${fPips(mp)}</b></span>` +
            `<span>R <b class="${tone(mr)}">${fR(mr)}</b></span>` +
            `<span>USD <b>${usdHtml(mu)}</b></span>` +
            `<span>Trading days <b>${inMonth.length}</b></span>`;

        let html = DOW.map((d) => `<div class="tpd-dow">${d}</div>`).join("") + `<div class="tpd-dow wk">Week</div>`;
        const startOffset = new Date(y, m, 1).getDay();
        const dim = new Date(y, m + 1, 0).getDate();
        let i = 0, week = 0;

        for (let first = 1 - startOffset; first <= dim; first += 7) {
            week++;
            const wk = { pips: 0, r: 0, usd: 0, n: 0, trades: 0 };
            for (let k = 0; k < 7; k++, i++) {
                const dn = first + k;
                if (dn < 1 || dn > dim) { html += `<div class="tpd-day out" aria-hidden="true"></div>`; continue; }
                const ds = `${prefix}-${pad2(dn)}`;
                const d = byDate.get(ds);
                const today = ds === todayStr ? " today" : "";
                if (!d) {
                    html += `<div class="tpd-day none${today}" style="--i:${i}"><span class="dnum">${dn}</span></div>`;
                    continue;
                }
                wk.pips += d.pips; wk.r += d.r; wk.usd += d.usd; wk.n++; wk.trades += d.trades;
                const cls = d.pips > 0 ? "win" : d.pips < 0 ? "loss" : "even";
                html += `<div class="tpd-day ${cls}${today}" style="--i:${i}" title="${fDateFull(ds)}">` +
                    `<span class="dnum">${dn}</span>` +
                    `<span class="dpips ${tone(d.pips)}">${fPips(d.pips)}</span>` +
                    `<span class="dmeta">${fR(d.r)} · ${plural(d.trades, "trade")}</span>` +
                    `<span class="dusd">${usdHtml(d.usd)}</span>` +
                    `</div>`;
            }
            wk.pips = round2(wk.pips); wk.r = round2(wk.r); wk.usd = round2(wk.usd);
            html += `<div class="tpd-week" style="--i:${i}"><span class="wlabel">Week ${week}</span>` +
                (wk.n
                    ? `<span class="wpips ${tone(wk.pips)}">${fPips(wk.pips)}</span>` +
                      `<span class="wmeta">${fR(wk.r)} · ${plural(wk.n, "day")}</span>` +
                      `<span>${usdHtml(wk.usd)}</span>`
                    : `<span class="wmeta">—</span>`) +
                `</div>`;
        }
        $("tpdCal").innerHTML = html;
    }

    function shiftMonth(delta) {
        view.m += delta;
        if (view.m < 0) { view.m = 11; view.y--; }
        if (view.m > 11) { view.m = 0; view.y++; }
        renderCalendar();
    }

    $("tpdPrev").addEventListener("click", () => shiftMonth(-1));
    $("tpdNext").addEventListener("click", () => shiftMonth(1));

    // ------------------------------------------------------------------
    // RECENT DAYS TABLE
    // ------------------------------------------------------------------
    const TABLE_LIMIT = 10;
    let showAll = false;

    function renderTable() {
        const list = days.slice().reverse();
        const shown = showAll ? list : list.slice(0, TABLE_LIMIT);
        $("tpdTableBody").innerHTML = shown.length
            ? shown.map((d) =>
                `<tr><td>${fDateFull(d.date)}</td>` +
                `<td class="${tone(d.pips)}">${fPips(d.pips)}</td>` +
                `<td class="${tone(d.r)}">${fR(d.r)}</td>` +
                `<td>${usdHtml(d.usd)}</td>` +
                `<td class="${tone(d.cum)}">${fPips(d.cum)}</td></tr>`).join("")
            : `<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">No days entered yet.</td></tr>`;

        $("tpdTableMeta").textContent = list.length ? `Showing ${shown.length} of ${list.length}` : "";
        const more = $("tpdMore");
        more.hidden = list.length <= TABLE_LIMIT;
        more.textContent = showAll ? "Show fewer days" : `Show all ${list.length} days`;
    }

    $("tpdMore").addEventListener("click", () => { showAll = !showAll; renderTable(); });

    // ------------------------------------------------------------------
    // HEADER: date range + USD toggle
    // ------------------------------------------------------------------
    $("tpdRange").textContent = days.length
        ? `${fDateShort(days[0].date)}, ${days[0].date.slice(0, 4)} – ${fDateShort(days[days.length - 1].date)}, ${days[days.length - 1].date.slice(0, 4)} · ${plural(days.length, "trading day")}`
        : "No days entered yet";

    const toggle = $("tpdUsdToggle");
    function syncToggle() {
        $("tpdUsdToggleText").textContent = hideUsd ? "Show USD" : "Hide USD";
        toggle.setAttribute("aria-pressed", String(hideUsd));
    }
    if (allowToggle) {
        toggle.hidden = false;
        syncToggle();
        toggle.addEventListener("click", () => {
            hideUsd = !hideUsd;
            syncToggle();
            renderStats(statsT);
            renderCalendar();
            renderTable();
            // Close any open tooltip so it can't show a stale USD value
            hover.cum = hover.bar = -1;
            $("tpdCumTip").classList.remove("show");
            $("tpdBarTip").classList.remove("show");
            drawCharts();
        });
    }

    // ------------------------------------------------------------------
    // ENTRANCE ANIMATIONS (count-up stats, chart draw-in)
    // ------------------------------------------------------------------
    function animate(duration, step, done) {
        const t0 = performance.now();
        const frameFn = (t) => {
            const p = Math.min(1, (t - t0) / duration);
            step(1 - Math.pow(1 - p, 3));
            if (p < 1) requestAnimationFrame(frameFn); else if (done) done();
        };
        requestAnimationFrame(frameFn);
    }

    function onFirstView(el, fn) {
        if (REDUCED_MOTION || !("IntersectionObserver" in window)) { fn(); return; }
        const io = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
        }, { threshold: 0.2 });
        io.observe(el);
    }

    // Initial render
    renderStats(statsT);
    chartMeta();
    drawCharts();
    renderCalendar();
    renderTable();

    onFirstView($("tpdStats"), () => {
        if (REDUCED_MOTION) { renderStats(1); return; }
        animate(1000, (t) => renderStats(t));
    });

    onFirstView(document.querySelector(".tpd-charts"), () => {
        if (REDUCED_MOTION) { chartP = 1; drawCharts(); return; }
        animate(1200, (t) => { chartP = t; drawCharts(); });
    });

    // Redraw charts on resize and theme change
    let resizeTimer;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(drawCharts, 100);
    });
    document.addEventListener("spacfx:themechange", drawCharts);
})();
