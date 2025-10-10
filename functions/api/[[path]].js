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
  const { GEMINI_API_KEY, HF_API_TOKEN } = context.env; // Both keys available

  if (!HF_API_TOKEN && request.url.includes('/generate-image')) {
    return new Response(JSON.stringify({ error: "HF API token not configured." }), {
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
      // Keep Gemini for analysis (fast text output)
      if (!GEMINI_API_KEY) {
        return new Response(JSON.stringify({ error: "Gemini API key not configured." }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
      modelName = 'gemini-2.5-flash';
      apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    } else if (path === '/generate-image') {
      // Qwen via HF Inference API
      apiEndpoint = 'https://api-inference.huggingface.co/models/Qwen/Qwen-Image-Edit-2509';
    } else {
      return new Response(JSON.stringify({ error: "Invalid endpoint." }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const requestBody = await request.json();

    if (path === '/analyze-image') {
      // Gemini payload (unchanged)
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
    } else if (path === '/generate-image') {
      // HF Qwen payload: Concat face + clothing base64, send as image + prompt
      const faceBase64 = requestBody.faceBase64;
      const clothingBase64 = requestBody.clothingBase64;
      const prompt = requestBody.prompt;

      if (!faceBase64 || !clothingBase64 || !prompt) {
        return new Response(JSON.stringify({ error: "Missing faceBase64, clothingBase64, or prompt." }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      // Simple concat: Assume 512x512; pad/resize if needed (client-side in App.jsx for now)
      const payload = {
        inputs: prompt,
        parameters: {
          image: faceBase64,  // Base image (face)
          mask_image: clothingBase64,  // Mask for edit (clothing overlay)
          num_inference_steps: 20,
          guidance_scale: 7.5
        }
      };

      const apiResponse = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        return new Response(JSON.stringify({ error: `HF API error: ${apiResponse.status} - ${errorText}` }), {
          status: apiResponse.status,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      // Response is binary PNG; convert to base64
      const imageBuffer = await apiResponse.arrayBuffer();
      const base64Image = Buffer.from(imageBuffer).toString('base64');
      const result = { image: `data:image/png;base64,${base64Image}` };

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

  } catch (e) {
    console.error("Function error:", e);
    return new Response(JSON.stringify({ error: `Server error: ${e.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
