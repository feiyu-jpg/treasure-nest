/* === 藏宝阁 - IndexedDB 数据层 === */

const DB_NAME = 'treasureNestDB';
const DB_VERSION = 1;

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // 藏品表
      if (!db.objectStoreNames.contains('collections')) {
        const collectStore = db.createObjectStore('collections', { keyPath: 'id', autoIncrement: true });
        collectStore.createIndex('category', 'category', { unique: false });
        collectStore.createIndex('status', 'status', { unique: false });
        collectStore.createIndex('created_at', 'created_at', { unique: false });
        collectStore.createIndex('updated_at', 'updated_at', { unique: false });
      }
      // 文档表
      if (!db.objectStoreNames.contains('docs')) {
        const docStore = db.createObjectStore('docs', { keyPath: 'id', autoIncrement: true });
        docStore.createIndex('category', 'category', { unique: false });
        docStore.createIndex('created_at', 'created_at', { unique: false });
        docStore.createIndex('updated_at', 'updated_at', { unique: false });
        docStore.createIndex('word_count', 'word_count', { unique: false });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

// ===== 通用操作 =====
function dbPut(storeName, item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = item.id ? store.put(item) : store.add(item);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function dbGetAll(storeName, indexName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = indexName ? tx.objectStore(storeName).index(indexName) : tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function dbGet(storeName, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function dbDelete(storeName, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

function dbCount(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

// ===== 藏品操作 =====
const COLLECT_CATEGORIES = ['手办', '积木', '模型', '书', '二次元周边', '旅游纪念品', '玩具', '其他'];

async function saveCollection(item) {
  const now = new Date().toISOString();
  if (!item.id) item.created_at = now;
  item.updated_at = now;
  return dbPut('collections', item);
}

async function getCollections() {
  const all = await dbGetAll('collections');
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function getCollection(id) {
  return dbGet('collections', id);
}

async function deleteCollection(id) {
  return dbDelete('collections', id);
}

async function getCollectionStats() {
  const all = await dbGetAll('collections');
  const categories = new Set();
  let totalValue = 0;
  all.forEach(c => {
    if (c.category) categories.add(c.category);
    if (c.price) totalValue += parseFloat(c.price) || 0;
  });
  return { count: all.length, categories: categories.size, totalValue };
}

// ===== 文档操作 =====
const DOC_CATEGORIES = ['复盘', '写作素材', '随笔', '技术笔记', '情感记录', '生活', '工作', '其他'];

async function saveDoc(item) {
  const now = new Date().toISOString();
  if (!item.id) item.created_at = now;
  item.updated_at = now;
  item.word_count = (item.content || '').replace(/\s/g, '').length;
  return dbPut('docs', item);
}

async function getDocs() {
  const all = await dbGetAll('docs');
  return all.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

async function getDoc(id) {
  return dbGet('docs', id);
}

async function deleteDoc(id) {
  return dbDelete('docs', id);
}

async function getDocStats() {
  const all = await dbGetAll('docs');
  let totalWords = 0;
  all.forEach(d => { totalWords += d.word_count || 0; });
  return { count: all.length, totalWords };
}

// ===== 导出导入 =====
async function exportAllData() {
  const collections = await dbGetAll('collections');
  const docs = await dbGetAll('docs');
  const data = {
    version: 1,
    exported_at: new Date().toISOString(),
    collections,
    docs
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `藏宝阁备份_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return data;
}

async function importAllData(jsonString) {
  const data = JSON.parse(jsonString);
  if (!data.version || !data.collections || !data.docs) {
    throw new Error('无效的备份文件格式');
  }
  // 清空现有数据
  await clearAll('collections');
  await clearAll('docs');
  // 导入
  for (const item of data.collections) {
    // 移除旧 id，让数据库自增
    const { id, ...rest } = item;
    await dbPut('collections', rest);
  }
  for (const item of data.docs) {
    const { id, ...rest } = item;
    await dbPut('docs', rest);
  }
}

function clearAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).clear();
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}
