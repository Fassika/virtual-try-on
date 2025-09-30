addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

// The base URL for the Gemini API
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

/**
 * Handles incoming requests and proxies them to the Gemini API.
 * The API key is securely retrieved from the environment variables.
 * @param {Request} request
 */
async function handleRequest(request) {
  // 1. Preflight check for CORS
  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }

  // Ensure the API key is set in the environment
  const apiKey = GEMINI_API_KEY; // This variable is automatically provided by Cloudflare Secrets
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key is not configured on the server." }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  try {
    const url = new URL(request.url);
    const path = url.pathname;
    let apiEndpoint = '';
    let modelName = '';
    let isAnalyze = false;

    // Determine the model and API endpoint based on the URL path
    if (path === '/analyze-image') {
      // Used for analysis (gemini-2.5-flash-preview-05-20:generateContent)
      modelName = 'gemini-2.5-flash-preview-05-20';
      apiEndpoint = `${GEMINI_API_BASE}${modelName}:generateContent`;
      isAnalyze = true;
    } else if (path === '/generate-image') {
      // Used for image editing (gemini-2.5-flash-image-preview:generateContent)
      modelName = 'gemini-2.5-flash-image-preview';
      apiEndpoint = `${GEMINI_API_BASE}${modelName}:generateContent`;
    } else {
      // Handle unmatched routes
      return new Response(JSON.stringify({ error: "Invalid worker route." }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // Clone the request body to read it
    const requestBody = await request.json();
    
    // Perform the fetch call to the Google API
    const apiResponse = await fetch(`${apiEndpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const apiResult = await apiResponse.json();

    // 2. Return the API response to the client
    return new Response(JSON.stringify(apiResult), {
      status: apiResponse.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });

  } catch (e) {
    console.error("Worker error:", e);
    return new Response(JSON.stringify({ error: `Server error: ${e.message}` }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}

/**
 * Handles CORS preflight requests.
 * @param {Request} request
 */
function handleOptions(request) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  return new Response(null, { headers: headers });
}
