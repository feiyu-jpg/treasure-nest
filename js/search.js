/* === 藏宝阁 - 全局搜索模块 === */

let searchTimeout = null;

function initSearch() {
  document.getElementById('globalSearch').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(doGlobalSearch, 300);
  });
}

async function doGlobalSearch() {
  const query = document.getElementById('globalSearch').value.toLowerCase().trim();
  const container = document.getElementById('searchResultList');

  if (!query) {
    container.innerHTML = '<div class="empty-hint">输入关键词开始搜索</div>';
    return;
  }

  const [collections, docs] = await Promise.all([getCollections(), getDocs()]);

  const results = [];

  // 搜索藏品
  collections.forEach(c => {
    const haystack = [c.name, c.category, c.tags, c.notes, c.source, c.location].filter(Boolean).join(' ').toLowerCase();
    if (haystack.includes(query)) {
      results.push({
        type: 'collect',
        data: c,
        score: haystack.split(query).length - 1
      });
    }
  });

  // 搜索文档
  docs.forEach(d => {
    const haystack = [d.title, d.category, d.tags, d.content].filter(Boolean).join(' ').toLowerCase();
    if (haystack.includes(query)) {
      results.push({
        type: 'doc',
        data: d,
        score: haystack.split(query).length - 1
      });
    }
  });

  results.sort((a, b) => b.score - a.score);

  if (results.length === 0) {
    container.innerHTML = '<div class="empty-hint">没有找到匹配的结果</div>';
    return;
  }

  container.innerHTML = `
    <div class="search-result-count" style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">
      找到 ${results.length} 条结果
    </div>
    ${results.map(r => {
      if (r.type === 'collect') return renderCollectListItem(r.data);
      return renderDocListItem(r.data);
    }).join('')}
  `;
  bindListItemClicks(container);
}
