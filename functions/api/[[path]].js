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
  const { GEMINI_API_KEY, HF_API_TOKEN } = context.env;

  if (!HF_API_TOKEN && request.url.includes('/generate-image')) {
    return new Response(JSON.stringify({ error: "HF API token not configured." }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const url = new URL(request.url);
    const path = url.pathname.replace('/api', '');

    if (path === '/analyze-image') {
      // Keep Gemini for analysis
      if (!GEMINI_API_KEY) {
        return new Response(JSON.stringify({ error: "Gemini API key not configured." }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const requestBody = await request.json();
      const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

      const apiResponse = await fetch(apiEndpoint, {
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
      // Stable Diffusion 2 Inpainting via HF (reliable alternative)
      const requestBody = await request.json();
      const prompt = requestBody.prompt;
      const imageBase64 = requestBody.imageBase64.replace(/^data:image\/[a-z]+;base64,/, ''); // Strip prefix
      const maskBase64 = requestBody.maskBase64.replace(/^data:image\/[a-z]+;base64,/, ''); // Strip for mask

      if (!prompt || !imageBase64 || !maskBase64) {
        return new Response(JSON.stringify({ error: "Missing prompt, imageBase64, or maskBase64." }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const formData = new FormData();
      formData.append('inputs', prompt);
      formData.append('image', new Blob([Buffer.from(imageBase64, 'base64')], { type: 'image/png' }), 'image.png');
      formData.append('mask_image', new Blob([Buffer.from(maskBase64, 'base64')], { type: 'image/png' }), 'mask.png');
  formData.append('parameters', JSON.stringify({
    num_inference_steps: requestBody.num_inference_steps || 20,
    guidance_scale: requestBody.guidance_scale || 7.5,
    strength: requestBody.strength || 0.7
  }));

      const apiResponse = await fetch('https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-inpainting', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${HF_API_TOKEN}` },
        body: formData
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error('HF API Error:', errorText);
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
    } else {
      return new Response(JSON.stringify({ error: "Invalid endpoint." }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
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
