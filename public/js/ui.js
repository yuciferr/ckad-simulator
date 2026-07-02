import { state } from './state.js';
import { $, $$, capitalize } from './utils.js';
export function showScreen(name) {
    $$('.screen').forEach((s) => s.classList.remove('active'));
    $(`#${name}`).classList.add('active');
    state.currentScreen = name;
    document.body.classList.toggle('landing-open', name === 'landing');
}
export function initResizer(onResize) {
    const resizer = $('#resizer');
    const panelLeft = $('#panelLeft');
    let startX, startWidth;
    resizer.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        startWidth = panelLeft.offsetWidth;
        resizer.classList.add('active');
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', stopResize);
        e.preventDefault();
    });
    function onMouseMove(e) {
        const newWidth = startWidth + (e.clientX - startX);
        const min = 250;
        const max = window.innerWidth - 400;
        panelLeft.style.width = Math.max(min, Math.min(max, newWidth)) + 'px';
        onResize();
    }
    function stopResize() {
        resizer.classList.remove('active');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', stopResize);
        onResize();
    }
}
export function initPanelTabs() {
    $$('.panel-left .panel-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            $$('.panel-left .panel-tab').forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            $$('.panel-left .tab-content').forEach((tc) => {
                tc.classList.toggle('active', tc.id === `tab${capitalize(target)}`);
            });
        });
    });
}
export function toggleDropdown(id) {
    $(`#${id}`).classList.toggle('open');
}
export function hideModal() {
    $('#modalOverlay').classList.remove('open');
}
export function showModal(title, body) {
    $('#modalTitle').textContent = title;
    $('#modalBody').textContent = body;
    $('#modalOverlay').classList.add('open');
}
export function closeDropdowns() {
    $$('.dropdown-menu').forEach((d) => d.classList.remove('open'));
}
export function updateDropdownHighlight(dropdownId) {
    $(`#${dropdownId}`)
        .querySelectorAll('.dropdown-item')
        .forEach((item, i) => {
        item.classList.toggle('active', i === state.currentQuestion);
    });
}
