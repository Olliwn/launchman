/**
 * Launchman - Frontend with process management
 */

let apps = [];
let editingAppId = null;
let deletingAppId = null;

// Track transient UI states (e.g. "starting..." spinner) so polls don't overwrite them
const transientStates = {}; // { appId: 'starting' | 'stopping' }

const appsGrid = document.getElementById('apps-grid');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const appForm = document.getElementById('app-form');
const deleteModal = document.getElementById('delete-modal');
const deleteMessage = document.getElementById('delete-message');

function isModalOpen() {
    return !modal.classList.contains('hidden') || !deleteModal.classList.contains('hidden');
}

// API
async function fetchApps() {
    // Don't refresh while user is interacting with a modal
    if (isModalOpen()) return;

    try {
        const response = await fetch('/api/apps');
        const freshApps = await response.json();

        // Clear transient states for apps whose server state now matches the expected outcome
        for (const [appId, state] of Object.entries(transientStates)) {
            const freshApp = freshApps.find(a => a.id === appId);
            if (!freshApp) { delete transientStates[appId]; continue; }
            if (state === 'starting' && freshApp.running) delete transientStates[appId];
            if (state === 'stopping' && !freshApp.running) delete transientStates[appId];
        }

        apps = freshApps;
        renderApps();
    } catch (error) {
        console.error('Failed to fetch apps:', error);
        showEmptyState('Failed to load apps');
    }
}

async function createApp(appData) {
    const response = await fetch('/api/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appData)
    });
    const newApp = await response.json();
    apps.push(newApp);
    renderApps();
    return newApp;
}

async function updateApp(appId, appData) {
    const response = await fetch(`/api/apps/${appId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appData)
    });
    const updatedApp = await response.json();
    const index = apps.findIndex(a => a.id === appId);
    if (index !== -1) apps[index] = updatedApp;
    renderApps();
    return updatedApp;
}

async function deleteApp(appId) {
    await fetch(`/api/apps/${appId}`, { method: 'DELETE' });
    apps = apps.filter(a => a.id !== appId);
    renderApps();
}

async function startApp(appId) {
    // Set transient state so the UI shows "Starting..." and polls don't overwrite it
    transientStates[appId] = 'starting';
    renderApps();

    try {
        await fetch(`/api/apps/${appId}/start`, { method: 'POST' });
        // The next poll cycle will detect the app is running and clear the transient state
    } catch (error) {
        console.error('Failed to start app:', error);
        delete transientStates[appId];
    }

    // Give it a moment, then poll once to pick up the new state
    setTimeout(() => fetchApps(), 1500);
}

async function stopApp(appId) {
    transientStates[appId] = 'stopping';
    renderApps();

    try {
        await fetch(`/api/apps/${appId}/stop`, { method: 'POST' });
    } catch (error) {
        console.error('Failed to stop app:', error);
        delete transientStates[appId];
    }

    // Poll once to pick up the new state
    setTimeout(() => fetchApps(), 500);
}

// Render - smart update: only replace rows that actually changed
function renderApps() {
    if (apps.length === 0) {
        showEmptyState();
        return;
    }

    const newHtml = apps.map(app => createAppRow(app)).join('');

    // Full rebuild if structure changed (different number of apps, first load, or empty state showing)
    const existingCards = appsGrid.querySelectorAll('.app-card');
    if (existingCards.length !== apps.length || appsGrid.querySelector('.empty-state')) {
        appsGrid.innerHTML = newHtml;
        return;
    }

    // Patch individual cards that changed
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newHtml;
    const newCards = tempDiv.querySelectorAll('.app-card');

    for (let i = 0; i < existingCards.length; i++) {
        if (existingCards[i].outerHTML !== newCards[i].outerHTML) {
            existingCards[i].replaceWith(newCards[i].cloneNode(true));
        }
    }
}

// Event delegation: single listener on the grid, never re-attached
function findBtn(el, className) {
    return el.closest('.' + className);
}

appsGrid.addEventListener('click', e => {
    let btn;

    if ((btn = findBtn(e.target, 'btn-start'))) {
        e.stopPropagation();
        startApp(btn.dataset.id);
    } else if ((btn = findBtn(e.target, 'btn-stop'))) {
        e.stopPropagation();
        stopApp(btn.dataset.id);
    } else if ((btn = findBtn(e.target, 'btn-open'))) {
        e.stopPropagation();
        window.open(`http://localhost:${btn.dataset.port}`, '_blank');
    } else if ((btn = findBtn(e.target, 'btn-edit'))) {
        e.stopPropagation();
        openEditModal(btn.dataset.id);
    } else if ((btn = findBtn(e.target, 'btn-delete'))) {
        e.stopPropagation();
        openDeleteModal(btn.dataset.id);
    } else if ((btn = findBtn(e.target, 'btn-copy'))) {
        e.stopPropagation();
        const cmd = btn.dataset.cmd;
        navigator.clipboard.writeText(cmd).then(() => {
            const original = btn.innerHTML;
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied`;
            setTimeout(() => { btn.innerHTML = original; }, 1500);
        });
    }
});

appsGrid.addEventListener('dblclick', e => {
    const card = e.target.closest('.app-card');
    if (!card) return;
    const app = apps.find(a => a.id === card.dataset.id);
    if (app?.running && app.port) {
        window.open(`http://localhost:${app.port}`, '_blank');
    }
});

function createAppRow(app) {
    const runtime = app.runtime?.type || 'static';
    const isCliOnly = !app.port;
    const transient = transientStates[app.id];
    const isRunning = transient === 'starting' ? false : transient === 'stopping' ? true : app.running;
    const isTransitioning = !!transient;

    let statusClass = isRunning ? 'running' : '';
    if (isCliOnly) statusClass = 'cli';
    else if (transient === 'starting') statusClass = 'starting';
    else if (transient === 'stopping') statusClass = 'stopping';

    // For CLI-only entries, show the command as a monospace description
    const descriptionHtml = isCliOnly
        ? `<span class="app-description app-cli-cmd" title="Copy: ${esc(app.description)}">${esc(app.description)}</span>`
        : `<span class="app-description">${esc(app.description)}</span>`;

    // Port badge: hide for CLI-only, show normally otherwise
    const portBadge = isCliOnly
        ? `<span class="badge badge-runtime cli">cli</span>`
        : `<span class="badge badge-port">:${app.port}</span>`;

    return `
        <div class="app-card${isCliOnly ? ' cli-only' : ''}" data-id="${app.id}">
            <div class="app-status ${statusClass}" title="${isCliOnly ? 'CLI' : (transient || (isRunning ? 'Running' : 'Stopped'))}"></div>
            <div class="app-info">
                <span class="app-name">${esc(app.name)}</span>
                ${descriptionHtml}
            </div>
            <div class="app-meta">
                ${portBadge}
                <span class="badge badge-runtime ${runtime}">${runtime}</span>
            </div>
            <div class="app-actions">
                <button class="btn-icon btn-edit" data-id="${app.id}" title="Edit">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="btn-icon btn-delete" data-id="${app.id}" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
                ${isCliOnly ? `
                    <button class="btn btn-action btn-copy" data-cmd="${esc(app.runtime?.command || app.description)}" title="Copy command">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        Copy
                    </button>
                ` : isTransitioning ? `
                    <button class="btn btn-action" disabled>
                        ${transient === 'starting' ? 'Starting...' : 'Stopping...'}
                    </button>
                ` : isRunning ? `
                    <button class="btn btn-action btn-stop" data-id="${app.id}" title="Stop">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="6" width="12" height="12" rx="1"></rect>
                        </svg>
                        Stop
                    </button>
                    <button class="btn btn-action btn-open" data-port="${app.port}" title="Open in browser">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                        Open
                    </button>
                ` : `
                    <button class="btn btn-action btn-start btn-success" data-id="${app.id}" title="Start">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                        Start
                    </button>
                    <button class="btn btn-action btn-open" data-port="${app.port}" disabled title="Start app first">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                        Open
                    </button>
                `}
            </div>
        </div>
    `;
}

function showEmptyState(message = 'No apps yet') {
    appsGrid.innerHTML = `
        <div class="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="9" y1="21" x2="9" y2="9"></line>
            </svg>
            <h3>${esc(message)}</h3>
            <p>Click Add to register an app</p>
        </div>
    `;
}

// Modal
function openAddModal() {
    editingAppId = null;
    modalTitle.textContent = 'Add App';
    appForm.reset();
    document.getElementById('app-color').value = '#0a84ff';
    updateVenvVisibility();
    modal.classList.remove('hidden');
}

function openEditModal(appId) {
    const app = apps.find(a => a.id === appId);
    if (!app) return;

    editingAppId = appId;
    modalTitle.textContent = 'Edit App';

    document.getElementById('app-id').value = app.id;
    document.getElementById('app-name').value = app.name;
    document.getElementById('app-port').value = app.port;
    document.getElementById('app-color').value = app.color;
    document.getElementById('app-description').value = app.description;
    document.getElementById('app-path').value = app.path;
    document.getElementById('app-runtime-type').value = app.runtime?.type || 'static';
    document.getElementById('app-runtime-command').value = app.runtime?.command || '';
    document.getElementById('app-runtime-venv').value = app.runtime?.venv || '';

    updateVenvVisibility();
    modal.classList.remove('hidden');
}

function closeModal() {
    modal.classList.add('hidden');
    editingAppId = null;
}

function openDeleteModal(appId) {
    const app = apps.find(a => a.id === appId);
    if (!app) return;
    deletingAppId = appId;
    deleteMessage.textContent = `Remove "${app.name}" from launcher?`;
    deleteModal.classList.remove('hidden');
}

function closeDeleteModal() {
    deleteModal.classList.add('hidden');
    deletingAppId = null;
}

function updateVenvVisibility() {
    const type = document.getElementById('app-runtime-type').value;
    document.getElementById('venv-group').style.display = type === 'python' ? 'block' : 'none';
}

// Form
async function handleFormSubmit(e) {
    e.preventDefault();
    const formData = new FormData(appForm);
    const appData = {
        name: formData.get('name'),
        port: parseInt(formData.get('port'), 10),
        description: formData.get('description'),
        color: formData.get('color'),
        path: formData.get('path'),
        runtime: {
            type: formData.get('runtime-type'),
            command: formData.get('runtime-command'),
            venv: formData.get('runtime-venv') || null
        }
    };

    try {
        if (editingAppId) {
            await updateApp(editingAppId, appData);
        } else {
            await createApp(appData);
        }
        closeModal();
    } catch (error) {
        alert('Failed to save');
    }
}

async function handleDeleteConfirm() {
    if (!deletingAppId) return;
    try {
        await deleteApp(deletingAppId);
        closeDeleteModal();
    } catch (error) {
        alert('Failed to delete');
    }
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Events
document.getElementById('btn-add-app').addEventListener('click', openAddModal);
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('btn-cancel').addEventListener('click', closeModal);
modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
document.getElementById('app-runtime-type').addEventListener('change', updateVenvVisibility);
appForm.addEventListener('submit', handleFormSubmit);

document.getElementById('btn-cancel-delete').addEventListener('click', closeDeleteModal);
document.getElementById('btn-confirm-delete').addEventListener('click', handleDeleteConfirm);
deleteModal.querySelector('.modal-backdrop').addEventListener('click', closeDeleteModal);

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeModal();
        closeDeleteModal();
    }
});

// Periodic status refresh (every 5 seconds)
setInterval(() => {
    fetchApps();
}, 5000);

// Init
fetchApps();
