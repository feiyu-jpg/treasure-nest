/* === 藏宝阁 - 藏品阁模块 === */

const COLLECT_PAGE_SIZE = 30;
let collectImages = [];
let collectPage = 0;
let collectHasMore = true;
let collectSearchMode = false;

function initCollections() {
  document.getElementById('btnAddCollect').addEventListener('click', showCollectForm);
  document.getElementById('collectSearch').addEventListener('input', () => refreshCollectList(true));
  document.getElementById('collectFilterCategory').addEventListener('change', () => refreshCollectList(true));
  document.getElementById('collectFilterStatus').addEventListener('change', () => refreshCollectList(true));

  const sel = document.getElementById('collectFilterCategory');
  sel.innerHTML = '<option value="">全部分类</option>' +
    COLLECT_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
}

async function refreshCollectList(reset = true) {
  if (reset) { collectPage = 0; collectHasMore = true; }

  const search = document.getElementById('collectSearch').value.toLowerCase();
  const cat = document.getElementById('collectFilterCategory').value;
  const status = document.getElementById('collectFilterStatus').value;
  const hasFilter = search || cat || status;
  collectSearchMode = hasFilter;

  let items;
  if (hasFilter) {
    // 搜索/筛选：全量匹配（不需要图片，文本匹配很快）
    const all = await dbGetAll('collections');
    items = all.filter(i => {
      if (cat && i.category !== cat) return false;
      if (status && i.status !== status) return false;
      if (search) {
        const haystack = [i.name, i.tags, i.notes, i.source].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
    collectHasMore = false; // 搜索结果不分页
  } else {
    // 浏览模式：分页加载
    items = await dbGetPage('collections', 'created_at', collectPage * COLLECT_PAGE_SIZE, COLLECT_PAGE_SIZE);
    collectHasMore = items.length === COLLECT_PAGE_SIZE;
  }

  const container = document.getElementById('collectList');
  if (reset) {
    if (items.length === 0) {
      container.innerHTML = '<div class="empty-hint">没有匹配的藏品</div>';
      return;
    }
    container.innerHTML = items.map(renderCollectListItem).join('');
  } else {
    // 追加模式
    container.innerHTML += items.map(renderCollectListItem).join('');
  }

  // 加载更多按钮
  if (collectHasMore && !hasFilter) {
    const existingBtn = document.getElementById('loadMoreCollect');
    if (!existingBtn) {
      container.insertAdjacentHTML('afterend',
        '<button class="btn-secondary" id="loadMoreCollect" style="margin-top:10px;">加载更多...</button>');
      document.getElementById('loadMoreCollect').addEventListener('click', async () => {
        collectPage++;
        await refreshCollectList(false);
      });
    }
  } else {
    const existingBtn = document.getElementById('loadMoreCollect');
    if (existingBtn) existingBtn.remove();
  }

  bindListItemClicks(container);
}

function renderCollectListItem(item) {
  // 列表不加载图片，用分类图标代替（点进详情才加载图片）
  const icon = getCategoryIcon(item.category);
  const price = item.price ? `¥${Number(item.price).toFixed(0)}` : '';
  const imgCount = item.images && item.images.length > 0 ? `📷${item.images.length}` : '';
  return `
    <div class="list-item" data-collect-id="${item.id}">
      <div class="list-item-thumb"><span>${icon}</span></div>
      <div class="list-item-body">
        <div class="list-item-title">${escapeHtml(item.name || '未命名藏品')}</div>
        <div class="list-item-meta">
          ${item.category ? `<span>${item.category}</span>` : ''}
          ${item.status ? `<span>${item.status}</span>` : ''}
          ${item.location ? `<span>📍${escapeHtml(item.location)}</span>` : ''}
          ${imgCount ? `<span>${imgCount}</span>` : ''}
        </div>
      </div>
      <div class="list-item-right">
        ${price ? `<div class="list-item-price">${price}</div>` : ''}
        <div class="list-item-date">${formatDate(item.created_at)}</div>
      </div>
    </div>`;
}

function getCategoryIcon(cat) {
  const map = { '手办':'👤', '积木':'🧱', '模型':'🚀', '书':'📖', '二次元周边':'🎌', '旅游纪念品':'🗺️', '玩具':'🎮', '其他':'📦' };
  return map[cat] || '📦';
}

// ===== 添加 / 编辑表单 =====
function showCollectForm(editId) {
  collectImages = [];
  let item = null;
  const title = editId ? '编辑藏品' : '添加藏品';

  const loadAndShow = async () => {
    if (editId) {
      item = await getCollection(editId);
      collectImages = item.images || [];
    }
    const imagesHtml = buildImageUploadHtml();
    const body = `
      <div class="form-group">
        <label>名称 *</label>
        <input type="text" id="cfName" value="${escapeHtml(item?.name || '')}" placeholder="藏品名称">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>分类</label>
          <select id="cfCategory">
            <option value="">选择分类</option>
            ${COLLECT_CATEGORIES.map(c => `<option value="${c}" ${item?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>状态</label>
          <select id="cfStatus">
            <option value="已收藏" ${item?.status === '已收藏' ? 'selected' : ''}>已收藏</option>
            <option value="想入手" ${item?.status === '想入手' ? 'selected' : ''}>想入手</option>
            <option value="已出掉" ${item?.status === '已出掉' ? 'selected' : ''}>已出掉</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>照片</label>
        ${imagesHtml}
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>入手日期</label>
          <input type="date" id="cfDate" value="${item?.purchase_date || ''}">
        </div>
        <div class="form-group">
          <label>价格 (¥)</label>
          <input type="number" id="cfPrice" value="${item?.price || ''}" placeholder="0.00" step="0.01">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>来源 / 渠道</label>
          <input type="text" id="cfSource" value="${escapeHtml(item?.source || '')}" placeholder="淘宝/实体店/礼物...">
        </div>
        <div class="form-group">
          <label>展示位置</label>
          <input type="text" id="cfLocation" value="${escapeHtml(item?.location || '')}" placeholder="书柜第二层/卧室展示架...">
        </div>
      </div>
      <div class="form-group">
        <label>标签（逗号分隔）</label>
        <input type="text" id="cfTags" value="${escapeHtml((item?.tags || ''))}" placeholder="限定, 初音未来, 绝版...">
      </div>
      <div class="form-group">
        <label>备注 / 故事</label>
        <textarea id="cfNotes" placeholder="这件藏品有什么故事？">${escapeHtml(item?.notes || '')}</textarea>
      </div>
    `;

    showModal(title, body, async () => {
      const data = {
        id: editId || undefined,
        name: document.getElementById('cfName').value.trim(),
        category: document.getElementById('cfCategory').value,
        status: document.getElementById('cfStatus').value,
        images: collectImages,
        purchase_date: document.getElementById('cfDate').value,
        price: document.getElementById('cfPrice').value ? parseFloat(document.getElementById('cfPrice').value) : null,
        source: document.getElementById('cfSource').value.trim(),
        location: document.getElementById('cfLocation').value.trim(),
        tags: document.getElementById('cfTags').value.trim(),
        notes: document.getElementById('cfNotes').value.trim(),
      };
      if (!data.name) { showToast('请输入藏品名称'); return; }
      await saveCollection(data);
      showToast(editId ? '藏品已更新 ✅' : '藏品已添加 ✅');
      refreshCollectList(true);
      refreshHome();
    });

    // 绑定图片上传
    bindImageUpload();
  };

  loadAndShow();
}

// ===== 图片上传 UI =====
function buildImageUploadHtml() {
  let html = '<div class="img-upload-area" id="imgUploadArea">';
  collectImages.forEach((img, idx) => {
    html += `
      <div class="img-preview-wrapper">
        <img class="img-preview" src="${img}" data-idx="${idx}">
        <button class="img-preview-delete" data-idx="${idx}">×</button>
      </div>`;
  });
  html += `
    <div class="img-upload-box" id="imgUploadBox">📷</div>
    <input type="file" id="imgFileInput" accept="image/*" capture="environment" multiple style="display:none">
  </div>`;
  return html;
}

function bindImageUpload() {
  const box = document.getElementById('imgUploadBox');
  const input = document.getElementById('imgFileInput');
  if (!box || !input) return;

  box.addEventListener('click', () => input.click());
  input.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      const base64 = await compressImage(file, 800);
      collectImages.push(base64);
    }
    refreshImageUploadArea();
  });

  // 删除图片
  document.querySelectorAll('.img-preview-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      collectImages.splice(idx, 1);
      refreshImageUploadArea();
    });
  });

  // 点击预览查看大图
  document.querySelectorAll('.img-preview').forEach(img => {
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      showFullscreen(img.src);
    });
  });
}

function refreshImageUploadArea() {
  const area = document.getElementById('imgUploadArea');
  if (!area) return;
  area.innerHTML = buildImageUploadHtml();
  bindImageUpload();
}

// ===== 藏品详情 =====
async function showCollectDetail(id) {
  const item = await getCollection(id);
  if (!item) return;

  const imagesHtml = item.images && item.images.length > 0
    ? `<div class="detail-images">${item.images.map(img => `<img src="${img}" class="clickable-img">`).join('')}</div>`
    : '';

  const body = `
    <div class="detail-view">
      ${imagesHtml}
      ${item.name ? `<h3>${escapeHtml(item.name)}</h3>` : ''}
      ${buildDetailField('分类', item.category)}
      ${buildDetailField('状态', item.status)}
      ${buildDetailField('入手日期', item.purchase_date)}
      ${buildDetailField('价格', item.price != null ? `¥${Number(item.price).toFixed(2)}` : '')}
      ${buildDetailField('来源', item.source)}
      ${buildDetailField('展示位置', item.location)}
      ${buildDetailField('标签', item.tags)}
      ${item.notes ? `<div class="detail-field-label">备注</div><div class="detail-notes">${escapeHtml(item.notes)}</div>` : ''}
      <div class="detail-field" style="margin-top:12px;color:var(--text-muted);font-size:11px;">
        创建于 ${formatDate(item.created_at)} · 更新于 ${formatDate(item.updated_at)}
      </div>
    </div>
  `;

  showModal(item.name || '藏品详情', body);

  // 修改按钮行：换成编辑 + 删除
  const btnRow = document.querySelector('#modalContainer .btn-row');
  if (btnRow) {
    btnRow.innerHTML = `
      <button class="btn-danger" id="modalDelete">删除</button>
      <button class="btn-cancel" id="modalCancel">关闭</button>
      <button class="btn-save" id="modalEdit">编辑</button>
    `;
    document.getElementById('modalCancel').addEventListener('click', closeModal);
    document.getElementById('modalEdit').addEventListener('click', () => {
      closeModal();
      showCollectForm(id);
    });
    document.getElementById('modalDelete').addEventListener('click', async () => {
      if (confirm(`确定删除「${item.name}」？此操作不可撤销。`)) {
        await deleteCollection(id);
        closeModal();
        refreshCollectList(true);
        refreshHome();
        showToast('藏品已删除');
      }
    });
  }

  // 图片点击全屏
  document.querySelectorAll('.clickable-img').forEach(img => {
    img.addEventListener('click', () => showFullscreen(img.src));
  });
}

function buildDetailField(label, value) {
  if (!value) return '';
  return `<div class="detail-field"><span class="detail-field-label">${label}</span><span class="detail-field-value">${escapeHtml(value)}</span></div>`;
}
