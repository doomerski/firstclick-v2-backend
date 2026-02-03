/* global api */
(function () {
  const STORAGE_KEY = 'superadmin_admin_approvals_v1';

  function readStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  function writeStore(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (error) {
      // ignore
    }
  }

  function updateStatus(id, status) {
    const store = readStore();
    store[id] = {
      status,
      updated_at: new Date().toISOString()
    };
    writeStore(store);
  }

  function getStatus(id) {
    const store = readStore();
    return store[id]?.status || 'pending';
  }

  function matchesAction(log, matchers) {
    if (!matchers || matchers.length === 0) return true;
    const action = String(log.action || '').toLowerCase();
    return matchers.some(match => action.includes(match));
  }

  function formatDate(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    return date.toLocaleString();
  }

  function renderList(container, logs) {
    if (!container) return;
    if (!logs.length) {
      container.innerHTML = '<div class="empty-state">No pending admin changes.</div>';
      return;
    }

    container.innerHTML = logs.map(log => {
      const status = getStatus(log.id);
      const statusClass = `approval-${status}`;
      
      // Parse details safely
      let details = {};
      try {
        details = typeof log.details === 'string' ? JSON.parse(log.details || '{}') : (log.details || {});
      } catch (e) {
        details = {};
      }
      
      const resourceInfo = `${log.resource_type || 'Resource'} #${log.resource_id || 'N/A'}`;
      
      // Format the details into a readable summary
      let detailsSummary = '';
      if (details && typeof details === 'object') {
        if (details.before && details.after) {
          detailsSummary = Object.keys(details.after)
            .filter(key => details.before[key] !== details.after[key])
            .map(key => `<strong>${key}</strong>: ${details.before[key] || 'N/A'} → ${details.after[key] || 'N/A'}`)
            .join(', ');
        } else if (details.changes) {
          detailsSummary = Object.entries(details.changes)
            .map(([key, val]) => `<strong>${key}</strong>: ${JSON.stringify(val)}`)
            .join(', ');
        } else if (details.description) {
          detailsSummary = details.description;
        } else if (Object.keys(details).length > 0) {
          detailsSummary = JSON.stringify(details).substring(0, 100);
        }
      }
      
      return `
        <div class="list-item">
          <div class="list-row">
            <div>
              <strong>${log.action || 'Admin action'}</strong>
              <div class="muted">${log.user_email || 'Unknown admin'} • ${formatDate(log.created_at)}</div>
            </div>
            <span class="approval-pill ${statusClass}">${status}</span>
          </div>
          <div class="mono">Resource: ${resourceInfo} • Log ID: ${log.id || 'N/A'}</div>
          ${detailsSummary ? `<div class="muted" style="line-height: 1.5; margin: 0.5rem 0;">${detailsSummary}</div>` : ''}
          <div class="list-actions">
            <button class="btn ghost" data-approve="${log.id}" ${status === 'approved' ? 'disabled' : ''}>Approve</button>
            <button class="btn ghost" data-deny="${log.id}" ${status === 'denied' ? 'disabled' : ''}>Deny</button>
          </div>
        </div>
      `;
    }).join('');
  }

  async function loadAdminApprovals(options = {}) {
    const listId = options.listId || 'adminApprovalList';
    const countId = options.countId || 'adminApprovalCount';
    const matchers = (options.match || []).map(match => String(match).toLowerCase());
    const limit = Number(options.limit || 8);

    const container = document.getElementById(listId);
    const counter = document.getElementById(countId);

    if (container) {
      container.innerHTML = '<div class="muted">Loading admin changes…</div>';
    }

    try {
      const response = await api.get('/superadmin/audit-logs');
      const logs = (response.logs || [])
        .filter(log => String(log.user_role || '').toLowerCase() === 'admin')
        .filter(log => matchesAction(log, matchers))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      const limited = logs.slice(0, limit);
      if (counter) {
        counter.textContent = `${logs.length} total`;
      }
      renderList(container, limited);
    } catch (error) {
      if (container) {
        container.innerHTML = '<div class="empty-state">Unable to load admin changes.</div>';
      }
    }
  }

  function attachApprovalHandlers(rootId) {
    const root = document.getElementById(rootId || 'adminApprovalList');
    if (!root) return;

    root.addEventListener('click', event => {
      const approveId = event.target?.getAttribute('data-approve');
      const denyId = event.target?.getAttribute('data-deny');
      if (!approveId && !denyId) return;
      event.preventDefault();
      if (approveId) {
        updateStatus(approveId, 'approved');
      }
      if (denyId) {
        updateStatus(denyId, 'denied');
      }
      loadAdminApprovals({ listId: root.id, countId: root.dataset.countId, match: root.dataset.match ? root.dataset.match.split('|') : [] });
    });
  }

  window.loadAdminApprovals = loadAdminApprovals;
  window.attachApprovalHandlers = attachApprovalHandlers;
})();
