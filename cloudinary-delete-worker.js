/**
 * Jeswika Jewels — Cloudinary Delete Worker
 * ------------------------------------------
 * Cloudinary does NOT support deleting assets via an unsigned request
 * (only uploads can be unsigned). Deleting requires a *signed* request
 * using your Cloudinary API key + secret, which must never be exposed
 * in the browser. This Worker holds that secret and exposes a small
 * endpoint the admin panel can call instead.
 *
 * Deploy:
 *   1. npm install -g wrangler   (if you don't have it)
 *   2. cd cf-worker
 *   3. wrangler secret put CLOUDINARY_API_KEY
 *   4. wrangler secret put CLOUDINARY_API_SECRET
 *   5. wrangler secret put ADMIN_SHARED_SECRET   (any random string you invent)
 *   6. wrangler deploy
 *   7. Copy the resulting workers.dev URL into DELETE_IMAGE_URL in index.html,
 *      and put the same ADMIN_SHARED_SECRET value into the admin panel
 *      (see the X-Admin-Secret header below).
 *
 * Request shape (POST, JSON body):
 *   { "productId": 21 }
 *
 * Why tag-based, not public_id-based: every photo upload in index.html now
 * gets a unique, timestamped public_id (product_<id>_<slot>_<timestamp>) —
 * this is what makes "replace photo" reliably work without depending on
 * Cloudinary's "Overwrite" preset setting. That means this Worker can't
 * just guess the exact public_id to delete anymore. Instead, every upload
 * is also tagged with `product_<id>`, and this Worker deletes everything
 * under that tag in one call — every version ever uploaded for that
 * product, regardless of how many times its photos were replaced.
 *
 * NOTE on auth: ADMIN_SHARED_SECRET is a pragmatic stopgap, not real auth —
 * anyone with devtools open on the admin panel can read it from the request.
 * That's an acceptable tradeoff pre-launch (mirrors the existing posture
 * documented for UTR/manual-payment verification), but if this site gets
 * real traffic, swap this for verifying the user's Firebase ID token instead.
 */

const CLOUD_NAME = 'ddgpbmhqa';

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    if (request.headers.get('X-Admin-Secret') !== env.ADMIN_SHARED_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const productId = body.productId;
    if (productId === undefined || productId === null) {
      return json({ error: 'productId is required' }, 400);
    }

    try {
      const result = await deleteByTag(`product_${productId}`, env);
      return json({ productId, result });
    } catch (e) {
      return json({ productId, error: String(e) }, 500);
    }
  },
};

async function deleteByTag(tag, env) {
  const timestamp = Math.floor(Date.now() / 1000);
  // Cloudinary signature = sha1("param1=value1&param2=value2..." + api_secret),
  // params sorted alphabetically by key (tag, then timestamp).
  const paramsToSign = `tag=${tag}&timestamp=${timestamp}`;
  const signature = await sha1Hex(paramsToSign + env.CLOUDINARY_API_SECRET);

  const formData = new FormData();
  formData.append('timestamp', String(timestamp));
  formData.append('api_key', env.CLOUDINARY_API_KEY);
  formData.append('signature', signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/tags/${encodeURIComponent(tag)}`,
    { method: 'DELETE', body: formData }
  );
  return await res.json();
}

async function sha1Hex(str) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': 'https://jeswikajewels.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
  };
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
