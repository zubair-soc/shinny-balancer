(() => {
  const client = window.SKATE_MANAGER_CLIENT;
  let playersById = new Map();
  let balances = [];
  let skates = [];
  let selectedPlayerId = null;

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('creditPlayerSearch').addEventListener('input', renderBalances);
    loadManagerCredits();
  });

  async function loadManagerCredits() {
    const list = document.getElementById('managerCreditList');
    try {
      const [playersResult, balancesResult, skatesResult] = await Promise.all([
        client.from('skate_manager_players').select('id, name').order('name'),
        client.rpc('get_skate_manager_credit_balances'),
        client.from('skate_manager_skates').select('id,title,date,time_start,cost,capacity,location,is_archived').gte('date', new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(new Date())).order('date').order('time_start')
      ]);
      if (playersResult.error) throw playersResult.error;
      if (balancesResult.error) throw balancesResult.error;
      if (skatesResult.error) throw skatesResult.error;
      playersById = new Map((playersResult.data || []).map(player => [Number(player.id), player]));
      balances = (balancesResult.data || []).map(row => ({ playerId: Number(row.player_id), amount: Number(row.available_amount) }))
        .filter(row => playersById.has(row.playerId))
        .sort((a, b) => playersById.get(a.playerId).name.localeCompare(playersById.get(b.playerId).name));
      skates = (skatesResult.data || []).filter(skate => !skate.is_archived);
      renderBalances();
    } catch (error) {
      console.error('Could not load player credit balances:', error);
      list.innerHTML = '<div class="manager-credit-empty">Credit balances could not load. Refresh and try again.</div>';
    }
  }

  function renderBalances() {
    const list = document.getElementById('managerCreditList');
    const term = document.getElementById('creditPlayerSearch').value.trim().toLowerCase();
    const shown = balances.filter(row => playersById.get(row.playerId).name.toLowerCase().includes(term));
    const creditCount = balances.filter(row => row.amount > 0).length;
    document.getElementById('managerCreditCount').textContent = `${creditCount} with credit`;
    if (!shown.length) {
      list.innerHTML = '<div class="manager-credit-empty">No players with available credit match that search.</div>';
      return;
    }
    list.innerHTML = shown.map(row => {
      const player = playersById.get(row.playerId);
      const initials = player.name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
      const action = row.amount > 0
        ? `<button class="button" type="button" onclick="openManagerCreditModal(${row.playerId})">Use credit</button>`
        : '<span class="manager-credit-none">No available credit</span>';
      return `<article class="manager-credit-row"><div class="manager-credit-person"><span class="manager-credit-avatar" aria-hidden="true">${escapeHTML(initials)}</span><div class="manager-credit-person-copy"><div class="manager-credit-player">${escapeHTML(player.name)}</div><div class="manager-credit-amount ${row.amount > 0 ? 'has-credit' : ''}">${row.amount > 0 ? `$${row.amount.toFixed(2)} available` : 'No available credit'}</div></div></div>${action}</article>`;
    }).join('');
  }

  window.openManagerCreditModal = function (playerId) {
    selectedPlayerId = Number(playerId);
    const player = playersById.get(selectedPlayerId);
    const balance = balances.find(row => row.playerId === selectedPlayerId)?.amount || 0;
    document.getElementById('managerCreditPlayerSummary').textContent = `${player.name} has $${balance.toFixed(2)} in available credit.`;
    const select = document.getElementById('managerCreditSkateSelect');
    select.innerHTML = '<option value="">Select a skate</option>' + skates.map(skate => {
      const date = new Date(skate.date + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
      return `<option value="${skate.id}">${escapeHTML(skate.title)} · ${date} · ${escapeHTML(skate.location)}</option>`;
    }).join('');
    const status = document.getElementById('managerCreditApplyStatus');
    status.textContent = '';
    status.className = 'manager-credit-status';
    document.getElementById('applyManagerCreditModal').classList.add('active');
  };

  window.closeManagerCreditModal = function () {
    document.getElementById('applyManagerCreditModal').classList.remove('active');
    selectedPlayerId = null;
  };

  window.applyManagerCredit = async function () {
    const skateId = Number(document.getElementById('managerCreditSkateSelect').value);
    const status = document.getElementById('managerCreditApplyStatus');
    const button = document.getElementById('managerCreditApplyButton');
    if (!selectedPlayerId || !skateId) {
      status.textContent = 'Choose an upcoming skate first.';
      status.classList.add('is-error');
      return;
    }
    button.disabled = true;
    button.textContent = 'Applying…';
    try {
      const { data, error } = await client.rpc('apply_player_credit_to_skate', {
        p_player_id: selectedPlayerId,
        p_skate_id: skateId
      });
      if (error) throw error;
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      const due = Number(result.remaining_to_pay || 0);
      status.textContent = due > 0
        ? `Applied $${Number(result.applied).toFixed(2)}. $${due.toFixed(2)} remains to be paid.`
        : `Applied $${Number(result.applied).toFixed(2)}. The player is on the roster as paid.`;
      status.className = 'manager-credit-status is-success';
      await loadManagerCredits();
    } catch (error) {
      console.error('Could not apply player credit:', error);
      status.textContent = error.message || 'Could not apply the credit. Try again.';
      status.className = 'manager-credit-status is-error';
    } finally {
      button.disabled = false;
      button.textContent = 'Apply credit';
    }
  };
})();
