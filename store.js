/* 기기 안 저장 (IndexedDB). 안 되는 환경이면 localStorage 로 대신한다. */
(function (root) {
  'use strict';
  const DB_NAME = 'speak-review', VER = 1;
  let db = null, fallback = false;

  function open() {
    return new Promise(resolve => {
      try {
        const req = indexedDB.open(DB_NAME, VER);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains('sentences')) d.createObjectStore('sentences', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
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

  // localStorage 대신 쓰기
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('speak:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('speak:' + k, JSON.stringify(v)); } catch (e) { /* 저장 공간 없음 */ } },
  };

  const Store = {
    async init() {
      await open();
      // 저장 공간이 부족해도 이 앱 기록은 지우지 말라고 브라우저에 요청
      try { if (navigator.storage && navigator.storage.persist) Store.persisted = await navigator.storage.persist(); } catch (e) { /* 무시 */ }
    },
    persisted: false,
    async allSentences() {
      if (fallback) return LS.get('sentences', []);
      return tx('sentences', 'readonly', s => s.getAll());
    },
    async putSentences(list) {
      if (!list.length) return;
      if (fallback) {
        const all = new Map(LS.get('sentences', []).map(r => [r.id, r]));
        list.forEach(r => all.set(r.id, r));
        return LS.set('sentences', [...all.values()]);
      }
      return tx('sentences', 'readwrite', s => { list.forEach(r => s.put(r)); });
    },
    async deleteSentence(id) {
      if (fallback) return LS.set('sentences', LS.get('sentences', []).filter(r => r.id !== id));
      return tx('sentences', 'readwrite', s => { s.delete(id); });
    },
    async replaceAll(sentences, meta) {
      if (fallback) {
        LS.set('sentences', sentences);
        Object.keys(meta).forEach(k => LS.set('meta:' + k, meta[k]));
        return;
      }
      await tx('sentences', 'readwrite', s => { s.clear(); sentences.forEach(r => s.put(r)); });
      await tx('meta', 'readwrite', s => { s.clear(); Object.keys(meta).forEach(k => s.put(meta[k], k)); });
    },
    async getMeta(key, dflt) {
      if (fallback) return LS.get('meta:' + key, dflt);
      const v = await tx('meta', 'readonly', s => s.get(key));
      return v === undefined ? dflt : v;
    },
    async allMeta() {
      if (fallback) {
        const out = {};
        try { Object.keys(localStorage).filter(k => k.startsWith('speak:meta:')).forEach(k => { out[k.slice(11)] = JSON.parse(localStorage.getItem(k)); }); } catch (e) { /* 무시 */ }
        return out;
      }
      return new Promise((resolve, reject) => {
        const out = {};
        const t = db.transaction('meta', 'readonly');
        const req = t.objectStore('meta').openCursor();
        req.onsuccess = () => { const c = req.result; if (c) { out[c.key] = c.value; c.continue(); } };
        t.oncomplete = () => resolve(out);
        t.onerror = () => reject(t.error);
      });
    },
    async setMeta(key, val) {
      if (fallback) return LS.set('meta:' + key, val);
      return tx('meta', 'readwrite', s => { s.put(val, key); });
    },
  };
  root.Store = Store;
})(window);
