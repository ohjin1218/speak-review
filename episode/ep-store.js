/* 에피소드 저장 (IndexedDB, 문장 복습 기록과 따로). 안 되면 localStorage */
(function (root) {
  'use strict';
  const DB = 'speak-episodes', VER = 1;
  let db = null, fallback = false;
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('ep:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ep:' + k, JSON.stringify(v)); } catch (e) { /* 공간 없음 */ } },
  };
  function open() {
    return new Promise(resolve => {
      try {
        const req = indexedDB.open(DB, VER);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains('episodes')) d.createObjectStore('episodes', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        };
        req.onsuccess = () => { db = req.result; resolve(); };
        req.onerror = () => { fallback = true; resolve(); };
      } catch (e) { fallback = true; resolve(); }
    });
  }
  const tx = (store, mode, fn) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
    t.onerror = () => reject(t.error);
  });
  let ready = null;
  const EpStore = {
    init() { return ready || (ready = open()); },
    async all() {
      await EpStore.init();
      if (fallback) return LS.get('episodes', []);
      return tx('episodes', 'readonly', s => s.getAll());
    },
    async put(list) {
      await EpStore.init();
      list = [].concat(list);
      if (fallback) {
        const m = new Map(LS.get('episodes', []).map(e => [e.id, e]));
        list.forEach(e => m.set(e.id, e));
        return LS.set('episodes', [...m.values()]);
      }
      return tx('episodes', 'readwrite', s => { list.forEach(e => s.put(e)); });
    },
    async remove(id) {
      await EpStore.init();
      if (fallback) return LS.set('episodes', LS.get('episodes', []).filter(e => e.id !== id));
      return tx('episodes', 'readwrite', s => { s.delete(id); });
    },
    async replaceAll(list) {
      await EpStore.init();
      if (fallback) return LS.set('episodes', list);
      return tx('episodes', 'readwrite', s => { s.clear(); list.forEach(e => s.put(e)); });
    },
    async get(k, d) {
      await EpStore.init();
      if (fallback) return LS.get('kv:' + k, d);
      const v = await tx('kv', 'readonly', s => s.get(k));
      return v === undefined ? d : v;
    },
    async set(k, v) {
      await EpStore.init();
      if (fallback) return LS.set('kv:' + k, v);
      return tx('kv', 'readwrite', s => { s.put(v, k); });
    },
  };
  root.EpStore = EpStore;
})(window);
