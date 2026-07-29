/* === 藏宝阁 - 文渊阁模块 === */

const DOC_PAGE_SIZE = 30;
let docPage = 0;
let docHasMore = true;

function initDocs() {
  document.getElementById('btnAddDoc').addEventListener('click', showDocForm);
  document.getElementById('docSearch').addEventListener('input', () => refreshDocList(true));
  document.getElementById('docFilterCategory').addEventListener('change', () => refreshDocList(true));
  document.getElementById('docSortBy').addEventListener('change', () => refreshDocList(true));

  const sel = document.getElementById('docFilterCategory');
  sel.innerHTML = '<option value="">全部分类</option>' +
    DOC_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
}

async function refreshDocList(reset = true) {
  if (reset) { docPage = 0; docHasMore = true; }

  const search = document.getElementById('docSearch').value.toLowerCase();
  const cat = document.getElementById('docFilterCategory').value;
  const sortBy = document.getElementById('docSortBy').value;
  const hasFilter = search || cat;
  const hasCustomSort = sortBy !== 'updated_at';

  let items;
  if (hasFilter || hasCustomSort) {
    // 搜索/筛选/自定义排序：全量加载（纯文本，很快）
    const all = await dbGetAll('docs');
    items = all.filter(i => {
      if (cat && i.category !== cat) return false;
      if (search) {
        const haystack = [i.title, i.content, i.tags].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
    if (sortBy === 'created_at') items.sort((a, b) => b.created_at.localeCompare(a.created_at));
    else if (sortBy === 'word_count') items.sort((a, b) => (b.word_count || 0) - (a.word_count || 0));
    else if (sortBy === 'title') items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    docHasMore = false;
  } else {
    // 浏览模式：分页
    items = await dbGetPage('docs', 'updated_at', docPage * DOC_PAGE_SIZE, DOC_PAGE_SIZE);
    docHasMore = items.length === DOC_PAGE_SIZE;
  }

  const container = document.getElementById('docList');
  if (reset) {
    if (items.length === 0) {
      container.innerHTML = '<div class="empty-hint">没有匹配的文档</div>';
      return;
    }
    container.innerHTML = items.map(renderDocListItem).join('');
  } else {
    container.innerHTML += items.map(renderDocListItem).join('');
  }

  if (docHasMore && !hasFilter && !hasCustomSort) {
    const existingBtn = document.getElementById('loadMoreDocs');
    if (!existingBtn) {
      container.insertAdjacentHTML('afterend',
        '<button class="btn-secondary" id="loadMoreDocs" style="margin-top:10px;">加载更多...</button>');
      document.getElementById('loadMoreDocs').addEventListener('click', async () => {
        docPage++;
        await refreshDocList(false);
      });
    }
  } else {
    const existingBtn = document.getElementById('loadMoreDocs');
    if (existingBtn) existingBtn.remove();
  }

  bindListItemClicks(container);
}

function renderDocListItem(item) {
  const preview = (item.content || '').replace(/#{1,6}\s?/g, '').replace(/\*\*/g, '').replace(/[\[\]()]/g, '').slice(0, 60);
  const wc = item.word_count ? `<span class="list-item-wordcount">${formatNumber(item.word_count)} 字</span>` : '';
  return `
    <div class="list-item doc-item" data-doc-id="${item.id}">
      <div class="list-item-thumb">${getDocCategoryIcon(item.category)}</div>
      <div class="list-item-body">
        <div class="list-item-title">${escapeHtml(item.title || '未命名文档')}</div>
        <div class="list-item-preview">${escapeHtml(preview)}</div>
        <div class="list-item-meta">
          ${item.category ? `<span>${item.category}</span>` : ''}
          ${item.tags ? item.tags.split(',').slice(0,3).map(t => `<span>#${escapeHtml(t.trim())}</span>`).join('') : ''}
        </div>
      </div>
      <div class="list-item-right">
        <div class="list-item-date">${formatDate(item.updated_at)}</div>
        ${wc}
      </div>
    </div>`;
}

function getDocCategoryIcon(cat) {
  const map = { '复盘':'🔄', '写作素材':'✍️', '随笔':'🖊️', '技术笔记':'💻', '情感记录':'💭', '生活':'🌿', '工作':'💼', '其他':'📄' };
  return map[cat] || '📄';
}

// ===== 文档编辑表单 =====
function showDocForm(editId) {
  const loadAndShow = async () => {
    let item = null;
    if (editId) item = await getDoc(editId);

    const body = `
      <div class="form-group">
        <label>标题 *</label>
        <input type="text" id="dfTitle" value="${escapeHtml(item?.title || '')}" placeholder="文档标题">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>分类</label>
          <select id="dfCategory">
            <option value="">选择分类</option>
            ${DOC_CATEGORIES.map(c => `<option value="${c}" ${item?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>标签（逗号分隔）</label>
          <input type="text" id="dfTags" value="${escapeHtml(item?.tags || '')}" placeholder="自我探索, 成长...">
        </div>
      </div>
      <div class="form-group">
        <label>内容（支持 Markdown）</label>
        <textarea id="dfContent" placeholder="在这里写下你的文字...&#10;&#10;支持 Markdown 语法：&#10;# 标题  ## 二级标题&#10;**加粗**  *斜体*&#10;- 列表项">${escapeHtml(item?.content || '')}</textarea>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:-8px;margin-bottom:8px;">
        💡 支持 Markdown：**加粗** / # 标题 / - 列表 / [链接](url)
      </div>
    `;

    const title = editId ? '编辑文档' : '新建文档';
    showModal(title, body, async () => {
      const data = {
        id: editId || undefined,
        title: document.getElementById('dfTitle').value.trim(),
        category: document.getElementById('dfCategory').value,
        tags: document.getElementById('dfTags').value.trim(),
        content: document.getElementById('dfContent').value,
      };
      if (!data.title) { showToast('请输入文档标题'); return; }
      await saveDoc(data);
      showToast(editId ? '文档已更新 ✅' : '文档已保存 ✅');
      refreshDocList(true);
      refreshHome();
    });
  };

  loadAndShow();
}

// ===== 文档详情（渲染 Markdown） =====
async function showDocDetail(id) {
  const item = await getDoc(id);
  if (!item) return;

  const rendered = renderMarkdown(item.content || '');
  const body = `
    <div class="detail-view">
      <h3 style="margin-bottom:4px;">${escapeHtml(item.title)}</h3>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">
        ${item.category ? `<span style="margin-right:8px;">${getDocCategoryIcon(item.category)} ${item.category}</span>` : ''}
        ${item.word_count ? `<span>${formatNumber(item.word_count)} 字</span>` : ''}
        ${item.tags ? `<span style="margin-left:8px;">🏷️ ${escapeHtml(item.tags)}</span>` : ''}
      </div>
      <div class="markdown-body">${rendered}</div>
      <div style="margin-top:16px;font-size:11px;color:var(--text-muted);">
        创建于 ${formatDate(item.created_at)} · 更新于 ${formatDate(item.updated_at)}
      </div>
    </div>
  `;

  showModal(item.title, body);

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
      showDocForm(id);
    });
    document.getElementById('modalDelete').addEventListener('click', async () => {
      if (confirm(`确定删除「${item.title}」？此操作不可撤销。`)) {
        await deleteDoc(id);
        closeModal();
        refreshDocList(true);
        refreshHome();
        showToast('文档已删除');
      }
    });
  }
}

// ===== 简易 Markdown 渲染 =====
function renderMarkdown(md) {
  if (!md) return '';
  let html = escapeHtml(md);

  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="md-code"><code>$2</code></pre>');
  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  // 标题
  html = html.replace(/^### (.+)$/gm, '<h4 class="md-h4">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  // 粗体 / 斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // 图片
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="md-img">');
  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  // 水平线
  html = html.replace(/^---$/gm, '<hr class="md-hr">');
  // 无序列表
  html = html.replace(/^- (.+)$/gm, '<li class="md-li">$1</li>');
  // 有序列表
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="md-li">$1</li>');
  // 引用
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="md-quote">$1</blockquote>');
  // 换行
  html = html.replace(/\n\n/g, '</p><p class="md-p">');
  html = html.replace(/\n/g, '<br>');
  html = '<p class="md-p">' + html + '</p>';

  return html;
}
