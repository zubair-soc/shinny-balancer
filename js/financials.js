    // ===== SUPABASE =====
    const db = window.SKATE_MANAGER_CLIENT;

    // ===== STATE =====
    let currentYear = new Date().getFullYear();
    let currentMonth = new Date().getMonth(); // 0-indexed

    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

    // ===== THEME =====
    function toggleTheme() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        document.documentElement.setAttribute('data-theme', isDark ? '' : 'dark');
        document.querySelector('.theme-btn').textContent = isDark ? '🌙' : '☀️';
        localStorage.setItem('theme', isDark ? 'light' : 'dark');
    }
    if (localStorage.getItem('theme') === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.querySelector('.theme-btn').textContent = '☀️';
    }

    // ===== NAVIGATION =====
    function populateYearSelect() {
        const sel = document.getElementById('yearSelect');
        const thisYear = new Date().getFullYear();
        sel.innerHTML = '';
        for (let y = thisYear - 3; y <= thisYear + 1; y++) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            if (y === currentYear) opt.selected = true;
            sel.appendChild(opt);
        }
    }

    function updateSelectors() {
        document.getElementById('monthSelect').value = currentMonth;
        document.getElementById('yearSelect').value = currentYear;
    }

    function onMonthYearChange() {
        currentMonth = parseInt(document.getElementById('monthSelect').value);
        currentYear = parseInt(document.getElementById('yearSelect').value);
        loadFinancials();
    }

    function changeMonth(dir) {
        currentMonth += dir;
        if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        if (currentMonth < 0) { currentMonth = 11; currentYear--; }
        updateSelectors();
        loadFinancials();
    }

    function updateMonthLabel() {
        updateSelectors();
    }

    // ===== HELPERS =====
    function fmt(val) {
        if (val === null || val === undefined) return '<span class="no-data">—</span>';
        return `$${parseFloat(val).toFixed(2)}`;
    }
    function fmtPL(val) {
        if (val === null || val === undefined) return '<span class="no-data">—</span>';
        const n = parseFloat(val);
        const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero';
        const sign = n > 0 ? '+' : '';
        return `<span class="profit-cell ${cls}">${sign}$${Math.abs(n).toFixed(2)}</span>`;
    }
    function formatDate(dateStr) {
        const [y, m, d] = dateStr.split('-');
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const date = new Date(dateStr + 'T12:00:00');
        const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        return `${days[date.getDay()]}, ${months[parseInt(m)-1]} ${parseInt(d)}`;
    }
    function formatTime(t) {
        if (!t) return '';
        const [h, m] = t.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${String(m).padStart(2,'0')}${ampm}`;
    }

    // ===== LOAD DATA =====
    async function loadFinancials() {
        updateMonthLabel();
        document.getElementById('skateTableBody').innerHTML = '<tr><td colspan="10" class="loading">Loading...</td></tr>';

        // Date range for month
        const startDate = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-01`;
        const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
        const endDate = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-${lastDay}`;

        // Fetch skates for the month
        const { data: skates, error } = await db
            .from('skates')
            .select('id, title, date, time_start, time_end, location, tier, cost, capacity, ice_cost, ref_cost, other_cost, is_free')
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true });

        if (error) {
            document.getElementById('skateTableBody').innerHTML = `<tr><td colspan="10" class="loading">Error: ${error.message}</td></tr>`;
            return;
        }

        if (!skates || skates.length === 0) {
            document.getElementById('skateTableBody').innerHTML = '<tr><td colspan="10" class="empty"><h3>No skates this month</h3></td></tr>';
            updateSummary([]);
            return;
        }

        // Fetch registrations for these skates in chunks
        const skateIds = skates.map(s => s.id);
        let allRegs = [];
        const chunkSize = 10;
        for (let i = 0; i < skateIds.length; i += chunkSize) {
            const chunk = skateIds.slice(i, i + chunkSize);
            const { data: regs } = await db
                .from('skate_registrations')
                .select('skate_id, is_goalie, is_waitlist')
                .in('skate_id', chunk)
                .eq('is_waitlist', false)
                .limit(2000);
            if (regs) allRegs = allRegs.concat(regs);
        }

        // Count skaters per skate
        const counts = {};
        allRegs.forEach(r => {
            if (!counts[r.skate_id]) counts[r.skate_id] = { skaters: 0, goalies: 0 };
            if (r.is_goalie) counts[r.skate_id].goalies++;
            else counts[r.skate_id].skaters++;
        });

        // Build rows
        const rows = skates.map(skate => {
            const c = counts[skate.id] || { skaters: 0, goalies: 0 };
            const costPerPlayer = parseFloat((skate.cost || '$0').replace('$','')) || 0;
            const revenue = skate.is_free ? 0 : costPerPlayer * c.skaters;
            const ice = skate.ice_cost || 0;
            const ref = skate.ref_cost || 0;
            const other = skate.other_cost || 0;
            const totalCost = ice + ref + other;
            const pl = totalCost > 0 || revenue > 0 ? revenue - totalCost : null;
            return { skate, c, revenue, ice, ref, other, totalCost, pl };
        });

        renderTable(rows);
        updateSummary(rows);
    }

    function renderTable(rows) {
        const tbody = document.getElementById('skateTableBody');
        document.getElementById('skateCount').textContent = `${rows.length} skate${rows.length !== 1 ? 's' : ''}`;

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty"><h3>No skates this month</h3></td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(({ skate, c, revenue, ice, ref, other, totalCost, pl }) => {
            const titleParts = skate.title || '';
            return `<tr>
                <td><span class="skate-name">${escapeHTML(titleParts)}</span>${skate.is_free ? ' <span style="font-size:10px; padding:2px 6px; border-radius:10px; background:rgba(239,68,68,0.1); color:#ef4444; font-weight:700;">FREE</span>' : ''}</td>
                <td class="muted">${formatDate(skate.date)}</td>
                <td class="muted">${escapeHTML(skate.location || '—')}</td>
                <td class="num">${c.skaters}${c.goalies > 0 ? ` <span style="color:var(--text-muted); font-size:11px;">+${c.goalies}G</span>` : ''}</td>
                <td class="num">${(() => {
                    if (!revenue) return '<span class="no-data">—</span>';
                    const price = parseFloat((skate.cost || '').replace('$','')) || null;
                    return price ? `<span style="color:var(--text-muted); font-size:11px;">$${price}/p</span> ${fmt(revenue)}` : fmt(revenue);
                })()}</td>
                <td class="num">${(() => {
                    if (!ice) return '<span class="no-data">—</span>';
                    const dur = (new Date('1970-01-01T' + skate.time_end) - new Date('1970-01-01T' + skate.time_start)) / 3600000;
                    const rate = dur > 0 ? Math.round(ice / dur) : null;
                    return rate ? `<span style="color:var(--text-muted); font-size:11px;">$${rate}/hr</span> ${fmt(ice)}` : fmt(ice);
                })()}</td>
                <td class="num">${ref > 0 ? fmt(ref) : '<span class="no-data">—</span>'}</td>
                <td class="num">${other > 0 ? fmt(other) : '<span class="no-data">—</span>'}</td>
                <td class="num">${totalCost > 0 ? fmt(totalCost) : '<span class="no-data">—</span>'}</td>
                <td class="num">${fmtPL(pl)}</td>
            </tr>`;
        }).join('');

        // Totals row
        const totRev = rows.reduce((s, r) => s + r.revenue, 0);
        const totIce = rows.reduce((s, r) => s + r.ice, 0);
        const totRef = rows.reduce((s, r) => s + r.ref, 0);
        const totOther = rows.reduce((s, r) => s + r.other, 0);
        const totCost = rows.reduce((s, r) => s + r.totalCost, 0);
        const totPL = totRev - totCost;
        const totSkaters = rows.reduce((s, r) => s + r.c.skaters, 0);

        tbody.innerHTML += `<tr class="totals-row">
            <td colspan="3" style="font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Monthly Totals</td>
            <td class="num">${totSkaters}</td>
            <td class="num" style="color:var(--green);">${fmt(totRev)}</td>
            <td class="num">${fmt(totIce)}</td>
            <td class="num">${fmt(totRef)}</td>
            <td class="num">${fmt(totOther)}</td>
            <td class="num">${fmt(totCost)}</td>
            <td class="num">${fmtPL(totPL)}</td>
        </tr>`;
    }

    function updateSummary(rows) {
        const totRev = rows.reduce((s, r) => s + r.revenue, 0);
        const totIce = rows.reduce((s, r) => s + r.ice, 0);
        const totRef = rows.reduce((s, r) => s + r.ref, 0);
        const totOther = rows.reduce((s, r) => s + r.other, 0);
        const totCost = rows.reduce((s, r) => s + r.totalCost, 0);
        const totPL = totRev - totCost;

        document.getElementById('sumSkates').textContent = rows.length;
        document.getElementById('sumRevenue').textContent = `$${totRev.toFixed(0)}`;
        document.getElementById('sumIce').textContent = `$${totIce.toFixed(0)}`;
        document.getElementById('sumRef').textContent = `$${totRef.toFixed(0)}`;
        document.getElementById('sumOther').textContent = `$${totOther.toFixed(0)}`;
        document.getElementById('sumProfit').textContent = `${totPL >= 0 ? '+' : ''}$${totPL.toFixed(0)}`;

        const card = document.getElementById('sumProfitCard');
        card.className = 'summary-card ' + (totPL > 0 ? 'profit' : totPL < 0 ? 'loss' : '');
    }

    // ===== INIT =====
    populateYearSelect();
    updateSelectors();
    loadFinancials();
