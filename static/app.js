/**
 * Web App Launcher - Frontend Logic (Compact macOS style)
 */

let apps = [];
let editingAppId = null;
let deletingAppId = null;

const appsGrid = document.getElementById('apps-grid');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const appForm = document.getElementById('app-form');
const deleteModal = document.getElementById('delete-modal');
const deleteMessage = document.getElementById('delete-message');

// API
async function fetchApps() {
    try {
        const response = await fetch('/api/apps');
        apps = await response.json();
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

// Render
function renderApps() {
    if (apps.length === 0) {
        showEmptyState();
        return;
    }

    appsGrid.innerHTML = apps.map(app => createAppRow(app)).join('');
    
    // Event listeners
    appsGrid.querySelectorAll('.btn-launch').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            window.open(`http://localhost:${btn.dataset.port}`, '_blank');
        });
    });

    appsGrid.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            openEditModal(btn.dataset.id);
        });
    });

    appsGrid.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            openDeleteModal(btn.dataset.id);
        });
    });

    // Click row to launch
    appsGrid.querySelectorAll('.app-card').forEach(card => {
        card.addEventListener('dblclick', () => {
            const port = card.dataset.port;
            window.open(`http://localhost:${port}`, '_blank');
        });
    });
}

function createAppRow(app) {
    const runtime = app.runtime?.type || 'static';
    
    return `
        <div class="app-card" data-port="${app.port}">
            <div class="app-color-dot" style="background: ${app.color}"></div>
            <div class="app-info">
                <span class="app-name">${esc(app.name)}</span>
                <span class="app-description">${esc(app.description)}</span>
            </div>
            <div class="app-meta">
                <span class="badge badge-port">:${app.port}</span>
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
                <button class="btn btn-launch" data-port="${app.port}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    Open
                </button>
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

// Init
fetchApps();
