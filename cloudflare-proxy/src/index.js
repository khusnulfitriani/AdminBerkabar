let memoryCache = {
  data: null,
  timestamp: 0,
};

const CACHE_TTL_MS = 60 * 1000; // 1 minute

export default {
  async fetch(request, env, ctx) {
    const GAS_URL = 'https://script.google.com/macros/s/AKfycbxNG9FmIA_TmjIrZ0i6hsYYX83U1y7njKAP-MuPbuUan2PxmMDKKGAn6oOIrvnq0HQckA/exec';
    
    // Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    };

    const url = new URL(request.url);
    
    // GET Request (Fetch Data)
    if (request.method === 'GET') {
      const now = Date.now();
      
      // If we have fresh data in memory, return it instantly!
      if (memoryCache.data && (now - memoryCache.timestamp < CACHE_TTL_MS)) {
        // Trigger a background refresh (Stale-While-Revalidate)
        ctx.waitUntil(
          fetch(`${GAS_URL}?action=getAll&t=${now}`)
            .then(res => res.text())
            .then(data => {
              memoryCache.data = data;
              memoryCache.timestamp = Date.now();
            })
            .catch(err => console.error('Background fetch failed', err))
        );
        
        return new Response(memoryCache.data, { headers: corsHeaders });
      }
      
      // Otherwise, fetch from GAS directly (Cold Start)
      try {
        const response = await fetch(`${GAS_URL}?action=getAll&t=${now}`);
        const data = await response.text(); 
        
        // Save to memory cache
        memoryCache.data = data;
        memoryCache.timestamp = Date.now();
        
        return new Response(data, { headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // POST Request (Update Data)
    if (request.method === 'POST') {
      try {
        const body = await request.text();
        const response = await fetch(GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: body
        });
        
        const data = await response.text();
        
        // Invalidate the cache so the next GET fetches fresh data!
        memoryCache.data = null;
        memoryCache.timestamp = 0;
        
        // Also trigger a background fetch immediately to pre-warm the cache
        ctx.waitUntil(
          fetch(`${GAS_URL}?action=getAll&t=${Date.now()}`)
            .then(res => res.text())
            .then(newData => {
              memoryCache.data = newData;
              memoryCache.timestamp = Date.now();
            })
            .catch(err => console.error('Pre-warm fetch failed', err))
        );

        return new Response(data, { headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    return new Response('Not found', { status: 404 });
  },
};
