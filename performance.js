/**
 * ==============================================================================
 * SPACFX — Daily Performance Tracker (performance.html)
 * ==============================================================================
 * Records are read through the database function get_published_performance().
 * The DATABASE decides whether USD P&L amounts are included:
 *   - amounts are returned only when an admin has switched on public display
 *     (site_settings.show_public_usd), or when the viewer is an allowlisted admin;
 *   - otherwise daily_net_pnl comes back as NULL, so there is nothing in the
 *     browser for a visitor to reveal.
 * Day status (Profit / Loss / Break-even / No Trading) is always public, so the
 * calendar keeps its green / red / blue colours in both modes.
 * See supabase_schema.sql, section 10.
 */

let publishedRecords = [];
let viewDate = new Date(); // Current viewing month for calendar
let amountsVisible = false; // set only from the server response
let viewerIsAdmin = false;
let publicUsdEnabled = false;

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
            area.classList.toggle("amounts-hidden", !amountsVisible);
            calculateAndDisplayMetrics();
            renderCalendar();
            if (amountsVisible) drawEquityChart();
        }
    } catch (err) {
        console.warn("Could not load performance records:", err.message);
        showEmptyPerformanceState();
    }
}

// Who is viewing, and what does the public currently see? (for the small status note)
async function loadVisibilityInfo(supabase) {
    try {
        const [{ data: admin }, { data: setting }] = await Promise.all([
            supabase.rpc("is_admin"),
            supabase.from("site_settings").select("show_public_usd").eq("id", 1).maybeSingle(),
        ]);
        viewerIsAdmin = admin === true;
        publicUsdEnabled = !!(setting && setting.show_public_usd);
    } catch (e) {
        viewerIsAdmin = false;
    }
    renderVisibilityNote();
}

function renderVisibilityNote() {
    const note = document.getElementById("perfVisibilityNote");
    if (!note) return;
    if (viewerIsAdmin) {
        note.innerHTML = `<span class="pill">Admin view</span>` +
            `<span>You can see amounts. Public visitors currently see ${publicUsdEnabled ? "the USD amounts" : `<strong>${currencySymbol()}${MASK}</strong>`}. Change this in the <a href="admin.html" style="color: var(--gold-light);">Admin Portal</a>.</span>`;
        note.hidden = false;
    } else if (!amountsVisible && publishedRecords.length) {
        note.innerHTML = `<span>P&amp;L amounts are private. Each day's colour shows its result.</span>`;
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

    // Total PnL (masked unless the database returned amounts)
    const totalPnlEl = document.getElementById("metricTotalPnl");
    totalPnlEl.textContent = fmtAmount(amountsVisible ? totalPnl : null);
    totalPnlEl.classList.toggle("amount-masked", !amountsVisible);
    totalPnlEl.style.color = !amountsVisible ? "var(--text-muted)"
        : (totalPnl > 0 ? "var(--profit-green)" : (totalPnl < 0 ? "var(--loss-red)" : "var(--text-main)"));

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

            const pnlDiv = document.createElement("div");
            pnlDiv.className = "cal-day-pnl" + (amountsVisible ? "" : " amount-masked");
            pnlDiv.textContent = fmtAmount(record.daily_net_pnl);
            cell.appendChild(pnlDiv);

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
    pnlEl.textContent = fmtAmount(record.daily_net_pnl);
    pnlEl.style.color = STATUS_COLOR[status];

    document.getElementById("detailTrades").textContent = record.num_trades !== null && record.num_trades !== undefined ? record.num_trades : "Not specified";
    document.getElementById("detailNotes").textContent = record.market_notes || "None provided for this session.";
}

// ==========================================
// CUMULATIVE EQUITY CURVE (only drawn when amounts are public)
// ==========================================
function drawEquityChart() {
    const canvas = document.getElementById("equityChart");
    if (!canvas || !amountsVisible) return;

    const ctx = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();

    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    if (publishedRecords.length < 2) {
        ctx.fillStyle = cssVar("--text-dim");
        ctx.font = "13px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Need at least 2 published days for a curve.", width / 2, height / 2);
        return;
    }

    let runningPnl = 0;
    const dataPoints = [];
    publishedRecords.forEach(rec => {
        runningPnl += parseFloat(rec.daily_net_pnl) || 0;
        dataPoints.push({ date: rec.trading_date, value: runningPnl });
    });

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
    ctx.fillText(window.SPACFX.formatCurrency(maxVal), padding.left - 8, padding.top + 4);
    ctx.fillText(window.SPACFX.formatCurrency(minVal), padding.left - 8, height - padding.bottom);
    if (minVal < 0 && maxVal > 0) {
        ctx.fillText(window.SPACFX.formatCurrency(0), padding.left - 8, zeroY + 4);
    }
}

let equityResizeTimer;
function redrawEquityIfVisible() {
    if (publishedRecords.length > 0 && amountsVisible) drawEquityChart();
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
