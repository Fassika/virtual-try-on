
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
  const { GEMINI_API_KEY } = context.env; // Ensure GEMINI_API_KEY is set in your Pages project settings

  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "API key not configured in Cloudflare Pages environment variables." }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const url = new URL(request.url);
    const path = url.pathname.replace('/api', ''); // Removes '/api' prefix

    let targetModelName = '';
    const requestBody = await request.json(); // Parse the request body once

    // Determine the target model based on the path
    if (path === '/analyze-image') {
      targetModelName = 'gemini-2.5-flash';
    } else if (path === '/generate-image') {
      targetModelName = 'gemini-2.5-flash-image';
    } else {
      return new Response(JSON.stringify({ error: "Invalid API endpoint." }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Explicitly set the model in the requestBody for the Gemini API call
    // This overrides any model specified client-side if needed, ensuring the backend logic decides.
    // However, since client-side already specifies, this acts as a confirmation/safety.
    requestBody.model = targetModelName;

    // The Gemini API endpoint
    const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${targetModelName}:generateContent`;

    // Forward the request to the Gemini API
    const apiResponse = await fetch(`${apiEndpoint}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody) // Use the potentially modified requestBody
    });

    const apiResult = await apiResponse.json();

    // Check for specific error messages from Gemini API
    if (!apiResponse.ok && apiResult.error) {
        console.error(`Gemini API Error (${apiResponse.status}):`, apiResult.error.message || apiResult.error.status);
        // You can choose to expose more details or a generic error
        return new Response(JSON.stringify({
            error: `Gemini API Error (${apiResponse.status}): ${apiResult.error.message || 'Unknown error from Gemini.'}`,
            details: apiResult.error // Optionally include full error for debugging
        }), {
            status: apiResponse.status,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }

    return new Response(JSON.stringify(apiResult), {
      status: apiResponse.status, // Preserve the original status code from Gemini
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });

  } catch (e) {
    console.error("Pages Function error:", e);
    return new Response(JSON.stringify({ error: `Server error in Pages Function: ${e.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}