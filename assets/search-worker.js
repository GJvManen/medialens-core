self.onmessage = (event) => {
  const { q = '', sources = [], limit = 120 } = event.data || {};
  const terms = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  const results = [];
  for (const s of sources) {
    const hay = `${s.title||''} ${s.country||''} ${s.type||''} ${(s.tags||[]).join(' ')} ${(s.language||[]).join(' ')}`.toLowerCase();
    if (!terms.length || terms.every(t => hay.includes(t))) results.push(s);
    if (results.length >= limit) break;
  }
  self.postMessage({ results });
};
