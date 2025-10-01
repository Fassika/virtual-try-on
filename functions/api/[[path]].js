export async function onRequest(context) {
  // CORS preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const { request } = context;
  const { GEMINI_API_KEY } = context.env;

  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "API key not configured." }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const url = new URL(request.url);
    const path = url.pathname.replace('/api', '');
    let modelName = '';
    let apiEndpoint = '';

    if (path === '/analyze-image') {
      modelName = 'gemini-2.5-flash';
      apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    } else if (path === '/generate-image') {
      modelName = 'gemini-2.5-pro';
      apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    } else {
      return new Response(JSON.stringify({ error: "Invalid endpoint." }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const requestBody = await request.json();

    const apiResponse = await fetch(`${apiEndpoint}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const apiResult = await apiResponse.json();

    return new Response(JSON.stringify(apiResult), {
      status: apiResponse.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });

  } catch (e) {
    console.error("Function error:", e);
    return new Response(JSON.stringify({ error: `Server error: ${e.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}