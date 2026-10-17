/* Persistence: localStorage autosave and JSON file export/import. */
(function (PG) {
  'use strict';
  const KEY = 'ballot-and-gavel-autosave';

  function autosave(state) {
    try { localStorage.setItem(KEY, PG.save.serialize(state)); return true; } catch (e) { console.warn('Autosave failed', e); return false; }
  }
  function load() {
    try {
      const t = localStorage.getItem(KEY);
      return t ? PG.save.deserialize(t) : null;
    } catch (e) { console.warn('Could not load autosave:', e.message); return null; }
  }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  function exportFile(state) {
    const text = PG.save.serialize(state);
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    const p = state.player;
    a.href = URL.createObjectURL(blob);
    a.download = 'ballot-gavel-' + p.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-' + state.date.year + '-' + state.date.month + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function importFile(cb) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const f = input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try { cb(null, PG.save.deserialize(String(reader.result))); } catch (e) { cb(e); }
      };
      reader.readAsText(f);
    };
    input.click();
  }

  PG.storage = { KEY, autosave, load, clear, exportFile, importFile };
})(globalThis.PG = globalThis.PG || {});
