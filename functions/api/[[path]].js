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
      // Stable Diffusion Inpainting via HF Inference API (free, API-ready for editing)
      apiEndpoint = 'https://api-inference.huggingface.co/models/stable-diffusion-v1-5/stable-diffusion-inpainting';
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
      // HF Stable Diffusion Inpainting payload
      const prompt = requestBody.prompt;
      const imageBase64 = requestBody.imageBase64; // Face/person
      const maskBase64 = requestBody.maskBase64; // Clothing as mask/overlay

      if (!prompt || !imageBase64 || !maskBase64) {
        return new Response(JSON.stringify({ error: "Missing prompt, imageBase64, or maskBase64." }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const payload = {
        inputs: prompt,
        parameters: {
          image: imageBase64,
          mask_image: maskBase64,
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
