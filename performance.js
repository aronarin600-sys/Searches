/**
 * ==============================================================================
 * SPACFX — Daily Performance Tracker (performance.html)
 * ==============================================================================
 * Records are read through the database function get_published_performance().
 *   - Everyone receives the day status, pips and the daily % (daily_pct), which
 *     the DATABASE calculates from the private capital and P&L.
 *   - USD P&L and balances are returned only to allowlisted admins; for anyone
 *     else daily_net_pnl comes back as NULL, so there is nothing to reveal.
 * Day status (Profit / Loss / Break-even / No Trading) keeps the calendar's
 * green / red / blue colours. See supabase_schema.sql, section 11.
 */

let publishedRecords = [];
let viewDate = new Date(); // Current viewing month for calendar
let amountsVisible = false; // true only for verified admins (set from the server response)
let viewerIsAdmin = false;

// ==========================================
// PERCENTAGE HELPERS (shared with dashboard.js)
// All % figures compound the database's daily % values; no USD is needed.
// ==========================================
function pctOf(rec) {
    const v = rec ? rec.daily_pct : null;
    return (v === null || v === undefined || v === "") ? null : Number(v);
}
// Compounded return of a list of daily % values, e.g. [5, 2, -1] -> 6.029
function compoundPct(pcts) {
    let g = 1;
    pcts.forEach((p) => { if (p !== null && Number.isFinite(p)) g *= 1 + p / 100; });
    return (g - 1) * 100;
}
// Largest fall from a peak of the compounded growth curve (positive number)
function maxDrawdownPct(pcts) {
    let g = 1, peak = 1, worst = 0;
    pcts.forEach((p) => {
        if (p === null || !Number.isFinite(p)) return;
        g *= 1 + p / 100;
        if (g > peak) peak = g;
        worst = Math.max(worst, (peak - g) / peak);
    });
    return worst * 100;
}
function fmtPct(v, digits = 2) {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    const r = Math.abs(v) < 0.005 ? 0 : v;
    return (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r).toFixed(digits) + "%";
}
function pctColor(v) {
    if (v === null || !Number.isFinite(v)) return "var(--text-muted)";
    return v > 0.0049 ? "var(--profit-green)" : (v < -0.0049 ? "var(--loss-red)" : "var(--text-main)");
}
function hasAnyPct() {
    return publishedRecords.some((r) => pctOf(r) !== null);
}

const MASK = "•••";
const STATUS_CLASS = {
    "Profit": "day-profit",
    "Loss": "day-loss",
    "Break-even": "day-breakeven",
    "No Trading": "day-neutral",
};
const STATUS_COLOR = {
    "Profit": "var(--profit-green)",
    "Loss": "var(--loss-red)",
    "Break-even": "var(--be-blue)",
    "No Trading": "var(--neutral-gray)",
};

function dayStatus(rec) {
    if (STATUS_CLASS[rec.trading_status]) return rec.trading_status;
    const pnl = Number(rec.daily_net_pnl);
    if (pnl > 0) return "Profit";
    if (pnl < 0) return "Loss";
    return "Break-even";
}

function currencySymbol() {
    return (window.SPACFX.getConfig().REPORTING_CURRENCY_SYMBOL) || "$";
}

// Formats an amount, or the mask when amounts are private
function fmtAmount(value, includeSign = true) {
    if (!amountsVisible || value === null || value === undefined) return currencySymbol() + MASK;
    return window.SPACFX.formatCurrency(value, includeSign);
}

// ==========================================
// DATA LOADING
// ==========================================
async function fetchPerformanceData() {
    const supabase = window.SPACFX.getClient();
    if (!supabase) {
        showEmptyPerformanceState();
        return;
    }

    try {
        let rows;
        const { data, error } = await supabase.rpc("get_published_performance");

        if (error) {
            // Database not upgraded yet: read status-only columns. Amounts are not requested.
            console.warn("get_published_performance() unavailable; showing results without amounts. Run section 10 of supabase_schema.sql.", error.message);
            const res = await supabase
                .from("daily_performance")
                .select("id, trading_date, trading_status, num_trades, winning_trades, losing_trades, be_trades, win_rate, risk_reward, market_notes")
                .eq("publication_status", "Published")
                .order("trading_date", { ascending: true });
            if (res.error) throw res.error;
            rows = (res.data || []).map(r => ({ ...r, daily_net_pnl: null, amounts_visible: false }));
        } else {
            rows = data || [];
        }

        publishedRecords = rows;
        amountsVisible = rows.length > 0 && rows.every(r => r.amounts_visible === true);

        await loadVisibilityInfo(supabase);

        if (publishedRecords.length === 0) {
            showEmptyPerformanceState();
        } else {
            document.getElementById("performanceEmptyState").style.display = "none";
            const area = document.getElementById("performanceInteractiveArea");
            area.style.display = "grid";
            area.classList.remove("amounts-hidden");
            calculateAndDisplayMetrics();
            renderCalendar();
            drawEquityChart();
        }
    } catch (err) {
        console.warn("Could not load performance records:", err.message);
        showEmptyPerformanceState();
    }
}

// Who is viewing? (for the small status note)
async function loadVisibilityInfo(supabase) {
    try {
        const { data: admin } = await supabase.rpc("is_admin");
        viewerIsAdmin = admin === true;
    } catch (e) {
        viewerIsAdmin = false;
    }
    renderVisibilityNote();
}

function renderVisibilityNote() {
    const note = document.getElementById("perfVisibilityNote");
    if (!note) return;
    if (viewerIsAdmin && amountsVisible) {
        note.innerHTML = `<span class="pill">Admin view</span>` +
            `<span>You see USD and %. Visitors see only percentages and pips.</span>`;
        note.hidden = false;
    } else if (publishedRecords.length) {
        note.innerHTML = `<span>Results are shown as a percentage of the trading account. Each day's colour shows its result.</span>`;
        note.hidden = false;
    } else {
        note.hidden = true;
    }
}

function showEmptyPerformanceState() {
    document.getElementById("metricTotalPnl").textContent = "—";
    document.getElementById("metricWinRate").textContent = "—";
    document.getElementById("metricDayBreakdown").textContent = "—";
    document.getElementById("metricTotalDays").textContent = "0";
    document.getElementById("performanceEmptyState").style.display = "block";
    document.getElementById("performanceInteractiveArea").style.display = "none";
}

function calculateAndDisplayMetrics() {
    let totalPnl = 0;
    let profitDays = 0;
    let lossDays = 0;
    let breakEvenDays = 0;

    publishedRecords.forEach(rec => {
        totalPnl += parseFloat(rec.daily_net_pnl) || 0;
        const status = dayStatus(rec);
        if (status === "Profit") profitDays++;
        else if (status === "Loss") lossDays++;
        else breakEvenDays++;
    });

    const totalDays = publishedRecords.length;
    const winRate = totalDays > 0 ? ((profitDays / totalDays) * 100).toFixed(1) : "0.0";

    // Total return % (compounded). Admins also see the USD total underneath.
    const totalPnlEl = document.getElementById("metricTotalPnl");
    const totalRet = hasAnyPct() ? compoundPct(publishedRecords.map(pctOf)) : null;
    totalPnlEl.textContent = fmtPct(totalRet);
    totalPnlEl.classList.remove("amount-masked");
    totalPnlEl.style.color = pctColor(totalRet);
    const subEl = document.getElementById("metricPnlSub");
    if (subEl) {
        subEl.textContent = amountsVisible
            ? `Admin: ${window.SPACFX.formatCurrency(totalPnl, true)} net P/L`
            : (totalRet === null ? "Available once the account capital is set" : "Compounded since start");
    }

    document.getElementById("metricWinRate").textContent = `${winRate}%`;

    document.getElementById("metricDayBreakdown").innerHTML = `
        <span style="color: var(--profit-green)">${profitDays}W</span> /
        <span style="color: var(--loss-red)">${lossDays}L</span> /
        <span style="color: var(--be-blue)">${breakEvenDays}BE</span>
    `;

    document.getElementById("metricTotalDays").textContent = totalDays;
}

// ==========================================
// INTERACTIVE CALENDAR
// ==========================================
function renderCalendar() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    document.getElementById("calendarMonthYear").textContent = `${monthNames[month]} ${year}`;

    const calendarGrid = document.getElementById("calendarGrid");
    while (calendarGrid.children.length > 7) {
        calendarGrid.removeChild(calendarGrid.lastChild);
    }

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) {
        const emptyCell = document.createElement("div");
        emptyCell.className = "cal-day empty";
        calendarGrid.appendChild(emptyCell);
    }

    const recordsMap = {};
    publishedRecords.forEach(r => { recordsMap[String(r.trading_date).slice(0, 10)] = r; });

    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement("div");
        cell.className = "cal-day";

        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const record = recordsMap[dateStr];

        const dayNum = document.createElement("div");
        dayNum.className = "cal-day-num";
        dayNum.textContent = day;
        cell.appendChild(dayNum);

        if (record) {
            const status = dayStatus(record);
            cell.classList.add(STATUS_CLASS[status]);
            cell.title = `${dateStr}: ${status}`;
            cell.setAttribute("aria-label", `${dateStr}: ${status}`);

            // Daily % for everyone; admins also see the USD amount
            const pct = pctOf(record);
            const pctDiv = document.createElement("div");
            pctDiv.className = "cal-day-pnl cal-day-pct";
            pctDiv.textContent = fmtPct(pct);
            pctDiv.style.color = pct === null ? "" : pctColor(pct);
            cell.appendChild(pctDiv);
            if (amountsVisible) {
                const usdDiv = document.createElement("div");
                usdDiv.className = "cal-day-usd";
                usdDiv.textContent = fmtAmount(record.daily_net_pnl);
                cell.appendChild(usdDiv);
            }

            cell.addEventListener("click", () => showDayDetail(record));
        }

        calendarGrid.appendChild(cell);
    }
}

function prevMonth() {
    viewDate.setMonth(viewDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    viewDate.setMonth(viewDate.getMonth() + 1);
    renderCalendar();
}

function currentMonthView() {
    viewDate = new Date();
    renderCalendar();
}

function showDayDetail(record) {
    const panel = document.getElementById("dayDetailPanel");
    panel.style.display = "block";

    const status = dayStatus(record);
    document.getElementById("detailDate").textContent = `Trading Date: ${record.trading_date}`;
    const statusEl = document.getElementById("detailStatus");
    statusEl.textContent = status;
    statusEl.style.color = STATUS_COLOR[status];

    const pnlEl = document.getElementById("detailPnl");
    const pct = pctOf(record);
    pnlEl.textContent = amountsVisible
        ? `${fmtPct(pct)}  (${fmtAmount(record.daily_net_pnl)})`
        : fmtPct(pct);
    pnlEl.style.color = STATUS_COLOR[status];

    document.getElementById("detailTrades").textContent = record.num_trades !== null && record.num_trades !== undefined ? record.num_trades : "Not specified";
    document.getElementById("detailNotes").textContent = record.market_notes || "None provided for this session.";
}

// ==========================================
// CUMULATIVE PERFORMANCE CURVE — compounded % growth (no USD; public)
// ==========================================
function drawEquityChart() {
    const canvas = document.getElementById("equityChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();

    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    const noCurve = (msg) => {
        ctx.fillStyle = cssVar("--text-dim");
        ctx.font = "13px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(msg, width / 2, height / 2);
    };
    if (!hasAnyPct()) { noCurve("Percentages appear once the account capital is set."); return; }

    // Start at 0% (the starting capital), then compound each day's %
    let growth = 1;
    const dataPoints = [{ date: null, value: 0 }];
    publishedRecords.forEach(rec => {
        const p = pctOf(rec);
        if (p !== null && Number.isFinite(p)) growth *= 1 + p / 100;
        dataPoints.push({ date: rec.trading_date, value: (growth - 1) * 100 });
    });
    if (dataPoints.length < 2) { noCurve("Need at least 1 published day for a curve."); return; }
    const summary = document.getElementById("chartSummary");
    if (summary) summary.textContent = `Total compounded return: ${fmtPct(dataPoints[dataPoints.length - 1].value)} · ${dataPoints.length - 1} trading day${dataPoints.length === 2 ? "" : "s"}`;

    const padding = { top: 30, right: 30, bottom: 40, left: 60 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const values = dataPoints.map(d => d.value);
    const minVal = Math.min(0, ...values);
    const maxVal = Math.max(0, ...values);
    const range = (maxVal - minVal) === 0 ? 1 : (maxVal - minVal);

    const getX = (idx) => padding.left + (idx / (dataPoints.length - 1)) * plotWidth;
    const getY = (val) => padding.top + plotHeight - ((val - minVal) / range) * plotHeight;

    const goldColor = cssVar("--gold-primary");
    ctx.strokeStyle = cssVar("--chart-grid");
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (plotHeight / 4) * i;
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
    }
    ctx.stroke();

    const zeroY = getY(0);
    ctx.strokeStyle = cssVar("--border-gold");
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(width - padding.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, "rgba(212, 175, 55, 0.35)");
    gradient.addColorStop(1, "rgba(212, 175, 55, 0.0)");

    ctx.beginPath();
    ctx.moveTo(getX(0), getY(dataPoints[0].value));
    for (let i = 1; i < dataPoints.length; i++) ctx.lineTo(getX(i), getY(dataPoints[i].value));
    ctx.lineTo(getX(dataPoints.length - 1), zeroY);
    ctx.lineTo(getX(0), zeroY);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = goldColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(dataPoints[0].value));
    for (let i = 1; i < dataPoints.length; i++) ctx.lineTo(getX(i), getY(dataPoints[i].value));
    ctx.stroke();

    dataPoints.forEach((pt, idx) => {
        ctx.fillStyle = goldColor;
        ctx.beginPath();
        ctx.arc(getX(idx), getY(pt.value), 3.5, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.fillStyle = cssVar("--chart-axis");
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(fmtPct(maxVal), padding.left - 8, padding.top + 4);
    ctx.fillText(fmtPct(minVal), padding.left - 8, height - padding.bottom);
    if (minVal < 0 && maxVal > 0) {
        ctx.fillText("0%", padding.left - 8, zeroY + 4);
    }
}

let equityResizeTimer;
function redrawEquityIfVisible() {
    if (publishedRecords.length > 0) drawEquityChart();
}
window.addEventListener("resize", () => {
    clearTimeout(equityResizeTimer);
    equityResizeTimer = setTimeout(redrawEquityIfVisible, 120);
});
document.addEventListener("spacfx:themechange", redrawEquityIfVisible);

// ==========================================
// "VIEW PERFORMANCE DASHBOARD" — compact by default
// ==========================================
function initDashboardToggle() {
    const btn = document.getElementById("dashToggle");
    const panel = document.getElementById("dashboardPanel");
    const label = document.getElementById("dashToggleText");
    if (!btn || !panel) return;

    const setOpen = (open) => {
        panel.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
        label.textContent = open ? "Hide Performance Dashboard" : "View Performance Dashboard";
        if (open) document.dispatchEvent(new CustomEvent("spacfx:dashboardshown"));
    };

    btn.addEventListener("click", () => {
        const open = panel.hidden;
        setOpen(open);
        if (open) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    if (location.hash === "#dashboard") setOpen(true);
}

window.addEventListener("DOMContentLoaded", () => {
    initDashboardToggle();
    fetchPerformanceData();
    // Re-check when the admin signs in or out in another tab
    try {
        const client = window.SPACFX.getClient();
        if (client) client.auth.onAuthStateChange((evt) => {
            if (evt === "SIGNED_IN" || evt === "SIGNED_OUT") setTimeout(fetchPerformanceData, 0);
        });
    } catch (e) { /* optional */ }
});
