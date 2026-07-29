/* === 藏宝阁 - 主入口 & 导航 === */

// ===== 导航 =====
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.remove('hidden');
  const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');

  const titles = {
    home: '藏宝阁', collections: '藏品阁', docs: '文渊阁', search: '搜索'
  };
  document.getElementById('pageTitle').textContent = titles[page] || '藏宝阁';

  if (page === 'home') refreshHome();
  if (page === 'collections') refreshCollectList(true);
  if (page === 'docs') refreshDocList(true);
  if (page === 'search') {
    document.getElementById('globalSearch').value = '';
    document.getElementById('searchResultList').innerHTML = '<div class="empty-hint">输入关键词开始搜索</div>';
  }
}

// ===== 初始化 =====
async function init() {
  await openDB();

  // 导航事件
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.page));
  });

  // 首页统计卡片导航
  document.querySelectorAll('.stat-card[data-nav]').forEach(card => {
    card.addEventListener('click', () => navigate(card.dataset.nav));
  });

  // 快速操作
  document.getElementById('btnQuickCollect').addEventListener('click', () => {
    navigate('collections');
    setTimeout(() => showCollectForm(), 200);
  });
  document.getElementById('btnQuickDoc').addEventListener('click', () => {
    navigate('docs');
    setTimeout(() => showDocForm(), 200);
  });

  // 导出按钮
  document.getElementById('btnExport').addEventListener('click', async () => {
    await exportAllData();
    showToast('数据已导出 ✅');
  });

  // 模块初始化
  initCollections();
  initDocs();
  initSearch();

  // 加载首页
  navigate('home');
}

// ===== 首页 =====
async function refreshHome() {
  const collectCount = await dbCount('collections');
  const docCount = await dbCount('docs');
  const docStats = await getDocStats();

  document.getElementById('statCollections').textContent = collectCount;
  document.getElementById('statDocs').textContent = docCount;

  // 统计分类数（轻量查询）
  const catSet = new Set();
  const allCollects = await dbGetAll('collections');
  allCollects.forEach(c => { if (c.category) catSet.add(c.category); });
  document.getElementById('statCategories').textContent = catSet.size;
  document.getElementById('statWords').textContent = formatNumber(docStats.totalWords);

  // 最近添加（只取最新 5 条，不分页）
  const recentCollections = await dbGetPage('collections', 'created_at', 0, 3);
  const recentDocs = await dbGetPage('docs', 'updated_at', 0, 3);

  let recent = [];
  recentCollections.forEach(c => { recent.push({ type: 'collect', data: c, time: c.created_at }); });
  recentDocs.forEach(d => { recent.push({ type: 'doc', data: d, time: d.created_at }); });
  recent.sort((a, b) => b.time.localeCompare(a.time));
  recent = recent.slice(0, 5);

  const container = document.getElementById('recentList');
  if (recent.length === 0) {
    container.innerHTML = '<div class="empty-hint">还没有任何记录，开始添加吧 ✨</div>';
    return;
  }
  container.innerHTML = recent.map(r => {
    if (r.type === 'collect') return renderCollectListItem(r.data);
    return renderDocListItem(r.data);
  }).join('');
  bindListItemClicks(container);
}

// ===== 工具函数 =====
function formatNumber(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('show'), 2000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== 模态框 =====
function showModal(title, bodyHtml, onSave) {
  const overlay = document.getElementById('modalOverlay');
  const container = document.getElementById('modalContainer');
  container.innerHTML = `
    <h2>${title}</h2>
    <div class="modal-body">${bodyHtml}</div>
    <div class="btn-row">
      <button class="btn-cancel" id="modalCancel">取消</button>
      <button class="btn-save" id="modalSave">保存</button>
    </div>
  `;
  overlay.classList.remove('hidden');
  container.classList.remove('hidden');
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalSave').addEventListener('click', async () => {
    if (onSave) await onSave(container);
    closeModal();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  document.getElementById('modalContainer').classList.add('hidden');
}

// ===== 全屏图片 =====
function showFullscreen(src) {
  let el = document.querySelector('.fullscreen-img');
  if (!el) {
    el = document.createElement('div');
    el.className = 'fullscreen-img hidden';
    el.innerHTML = '<img>';
    el.addEventListener('click', () => el.classList.add('hidden'));
    document.body.appendChild(el);
  }
  el.querySelector('img').src = src;
  el.classList.remove('hidden');
}

// ===== 图片压缩（手机优化） =====
function compressImage(file, maxW = 600) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxW) { h = (h * maxW) / w; w = maxW; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ===== 绑定列表点击 =====
function bindListItemClicks(container) {
  container.querySelectorAll('.list-item[data-collect-id]').forEach(el => {
    el.addEventListener('click', () => showCollectDetail(Number(el.dataset.collectId)));
  });
  container.querySelectorAll('.list-item[data-doc-id]').forEach(el => {
    el.addEventListener('click', () => showDocDetail(Number(el.dataset.docId)));
  });
}

// 启动
document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    document.body.innerHTML = `<div style="color:#f5566a;padding:40px;text-align:center;">
      <h2>初始化失败</h2><p>${err.message || err}</p>
      <p style="font-size:12px;color:#888;">请尝试清除浏览器缓存后刷新，或换用 Chrome 浏览器</p>
    </div>`;
    console.error('Init error:', err);
  });
});
