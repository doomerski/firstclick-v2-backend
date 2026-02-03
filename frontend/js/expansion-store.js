/* global api */
const expansionStore = (() => {
  const STORAGE_KEY = 'expansion_proposals_cache_v1';

  function readCache() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error('Expansion cache read failed:', error);
      return [];
    }
  }

  function writeCache(proposals) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(proposals));
    } catch (error) {
      console.error('Expansion cache write failed:', error);
    }
  }

  function addToCache(proposal) {
    const cache = readCache();
    cache.unshift(proposal);
    writeCache(cache);
    return cache;
  }

  async function submitProposal(formData) {
    const response = await api.post('/expansion/proposals', formData);
    const enriched = {
      ...formData,
      id: response.proposal_id || formData.id || `local-${Date.now()}`,
      status: formData.status || 'pending_review',
      created_at: formData.created_at || new Date().toISOString()
    };
    addToCache(enriched);
    return response;
  }

  function getCachedProposals() {
    return readCache();
  }

  function mergeProposals(apiProposals) {
    const cached = readCache();
    const merged = [...apiProposals];
    cached.forEach(cachedProposal => {
      const exists = merged.some(p => (p.id && cachedProposal.id && p.id === cachedProposal.id));
      if (!exists) {
        merged.push(cachedProposal);
      }
    });
    return merged;
  }

  return {
    submitProposal,
    getCachedProposals,
    mergeProposals
  };
})();
