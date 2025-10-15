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
      // Gemini API for image analysis
      if (!GEMINI_API_KEY) {
        return new Response(JSON.stringify({ error: "Gemini API key not configured." }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const requestBody = await request.json();
      const apiEndpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

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
      // Stable Diffusion 2 Inpainting via HF
      const requestBody = await request.json();
      const prompt = requestBody.prompt;
      const imageBase64 = requestBody.imageBase64;
      const maskBase64 = requestBody.maskBase64;

      if (!prompt || !imageBase64 || !maskBase64) {
        return new Response(JSON.stringify({ error: "Missing prompt, imageBase64, or maskBase64." }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const imageBuffer = Buffer.from(imageBase64, 'base64');
      const maskBuffer = maskBase64 ? Buffer.from(maskBase64, 'base64') : null;

      const formData = new FormData();
      formData.append('inputs', prompt);
      formData.append('image', new Blob([imageBuffer], { type: 'image/png' }), 'image.png');
      if (maskBase64) {
        formData.append('mask_image', new Blob([maskBuffer], { type: 'image/png' }), 'mask.png');
      }
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
      const imageBufferResponse = await apiResponse.arrayBuffer();
      const base64Image = Buffer.from(imageBufferResponse).toString('base64');
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
