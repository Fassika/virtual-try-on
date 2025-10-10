import React, { useState } from 'react';
import { Camera, Upload, Sparkles, Shirt, PawPrint, ShoppingBag, ShoppingBagIcon, RefreshCw } from 'lucide-react';

// All components, hooks, and logic in one file.
// The main component must be named "App" and be the default export.
// Tailwind CSS is used for styling.

const ACCESSORY_TYPES = [
  'Earring',
  'Necklace',
  'Ring',
  'Hat',
  'Scarf',
  'Glasses'
];

const TOP_TYPES = [
  'blouse',
  't-shirt',
  'shirt',
  'hoodie',
  'sweater',
  'jacket'
];

const PANTS_TYPES = [
  'pants',
  'skirt',
  'shorts',
  'jeans',
  'trousers',
  'leggings'
];

const SHOES_TYPES = [
  'shoes',
  'sneakers',
  'boots',
  'sandals',
  'heels',
  'flats'
];

const DRESS_TYPES = [
  'dress',
  'overalls',
  'jumpsuit'
];

// Helper function to convert a File object to a base64 string
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

export default function App() {
  const [uploadedFaceImage, setUploadedFaceImage] = useState(null);
  const [faceImagePreview, setFaceImagePreview] = useState(null);
  const [mode, setMode] = useState('accessory'); // 'accessory' or 'outfit'

  // Accessory state
  const [uploadedAccessoryImage, setUploadedAccessoryImage] = useState(null);
  const [accessoryType, setAccessoryType] = useState(ACCESSORY_TYPES[0]);

  // Outfit state
  const [uploadedTopImage, setUploadedTopImage] = useState(null);
  const [topType, setTopType] = useState(TOP_TYPES[0]);
  const [uploadedPantsImage, setUploadedPantsImage] = useState(null);
  const [pantsType, setPantsType] = useState(PANTS_TYPES[0]);
  const [uploadedShoesImage, setUploadedShoesImage] = useState(null);
  const [shoesType, setShoesType] = useState(SHOES_TYPES[0]);
  const [uploadedDressImage, setUploadedDressImage] = useState(null);
  const [dressType, setDressType] = useState(DRESS_TYPES[0]);

  const [generatedImage, setGeneratedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updatePrompt, setUpdatePrompt] = useState('');

  // New state to hold the description of the uploaded image
  const [imageDescription, setImageDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Updated endpoints with /api/ prefix
  const WORKER_URL = "https://virtual-try-on-d1b.pages.dev";
  const TEXT_ANALYSIS_ENDPOINT = `${WORKER_URL}/api/analyze-image`;
  const IMAGE_GEN_ENDPOINT = `${WORKER_URL}/api/generate-image`;

  // --- BEGIN API CALL HANDLERS ---

  const analyzeImage = async (file) => {
    setIsAnalyzing(true);
    setError('');
    
    try {
      const imageData = await fileToBase64(file);
      const payload = {
        contents: [{
          parts: [
            { text: "Describe this image in a concise manner, focusing on the person's pose, the type of clothing they are wearing, and the background. Do not try to generate a new image." },
            {
              inlineData: {
                mimeType: file.type,
                data: imageData.split(',')[1]
              }
            }
          ]
        }],
        model: "gemini-2.5-flash"
      };

      // Call the proxy endpoint
      const response = await fetch(TEXT_ANALYSIS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const result = await response.json();
      const description = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (description) {
        setImageDescription(description);
      } else if (result.error) {
         setError(`Analysis failed: ${result.error}`);
      } else {
        setError('Image analysis failed: Could not retrieve description.');
      }
    } catch (e) {
      console.error("Analysis API call failed:", e);
      setError(`An analysis error occurred: ${e.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFaceImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setUploadedFaceImage(file);
      setFaceImagePreview(URL.createObjectURL(file));
      setGeneratedImage(null);
      analyzeImage(file); // Start the analysis immediately
    }
  };
  
  const generateImage = async () => {
  if (!uploadedFaceImage || isAnalyzing) {
    setError('Please upload an image and wait for analysis to complete.');
    return;
  }

  setLoading(true);
  setError('');
  setGeneratedImage(null);
  setUpdatePrompt('');

  try {
    // Base64 for face and clothing (accessory or outfit based on mode)
    const faceImageData = await fileToBase64(uploadedFaceImage);
    let clothingImageData = null;
    let clothingType = '';
    let mimeType = 'image/png'; // Default; detect from file

    if (mode === 'accessory') {
      if (!uploadedAccessoryImage) {
        setError('Please upload an accessory.');
        return;
      }
      clothingImageData = await fileToBase64(uploadedAccessoryImage);
      clothingType = accessoryType.toLowerCase();
      mimeType = uploadedAccessoryImage.type || 'image/png';
    } else {
      // Outfit: Use first available (top, pants, etc.) or combine if multiple
      let clothingFile = uploadedTopImage || uploadedPantsImage || uploadedShoesImage || uploadedDressImage;
      if (!clothingFile) {
        setError('Please upload at least one outfit item.');
        return;
      }
      clothingImageData = await fileToBase64(clothingFile);
      clothingType = topType || pantsType || shoesType || dressType; // Adjust based on used file
      mimeType = clothingFile.type || 'image/png';
    }

    const faceBase64 = faceImageData.split(',')[1]; // Pure base64 (no data: prefix)
    const clothingBase64 = clothingImageData.split(',')[1];

    // Prompt for Qwen editing (natural language for realistic try-on)
    const prompt = `Apply the ${clothingType} realistically to the person in the image, preserving pose, lighting, and background. High quality, natural blend.`;

    // HF Qwen payload format
    const payload = {
      inputs: prompt, // Main editing instruction
      parameters: {
        image: faceBase64, // Base image (person/face)
        mask_image: clothingBase64, // Overlay/mask (clothing for inpainting)
        num_inference_steps: 20, // Quality steps (higher = better, slower)
        guidance_scale: 7.5 // Prompt adherence (7-10 for realism)
      }
    };

    // Call the proxy endpoint
    const response = await fetch(IMAGE_GEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text(); // Get HF error details
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (result.image) {
      setGeneratedImage(result.image); // base64 data URL from proxy
    } else {
      setError('No image generated—check prompt or try again.');
    }

  } catch (e) {
    console.error("Generation API call failed:", e);
    setError(`An error occurred during image generation: ${e.message}`);
  } finally {
    setLoading(false);
  }
};

  


  const updateLook = async () => {
    if (!generatedImage || !updatePrompt) {
      setError('Please generate an image and enter an update prompt.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Assume similar payload but with generated image as base and update prompt
      const generatedImageData = generatedImage; // Already base64
      const generatedBase64 = generatedImageData.split(',')[1];

      const payload = {
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: 'image/png',
                data: generatedBase64
              }
            },
            { text: `Update this image based on: ${updatePrompt}. Keep the style and quality consistent.` }
          ]
        }],
        generationConfig: {
          response_mime_type: 'image/png'
        },
        model: 'gemini-2.5-flash-image-preview'
      };

      const response = await fetch(IMAGE_GEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const updatedPart = result?.candidates?.[0]?.content?.parts?.[0];

      if (updatedPart?.inline_data) {
        const updatedSrc = `data:${updatedPart.inline_data.mime_type};base64,${updatedPart.inline_data.data}`;
        setGeneratedImage(updatedSrc);
      } else {
        setError('Update failed—try a different prompt.');
      }

    } catch (e) {
      console.error("Update API call failed:", e);
      setError(`An error occurred during update: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Helper to render upload sections
  const renderUploadSection = (label, onChange, uploadedImage, icon, types, selectedType, onTypeChange) => (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex items-center space-x-4">
        <div className="relative w-24 h-24"> {/* Fixed size for clickable area */}
          {uploadedImage ? (
            <img
              src={URL.createObjectURL(uploadedImage)}
              alt={label}
              className="w-full h-full object-cover rounded-lg border-2 border-gray-300"
            />
          ) : (
            <div className="w-full h-full border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 cursor-pointer hover:bg-gray-100">
              <span className="text-gray-500 text-xs text-center">Click to upload</span>
            </div>
          )}
          <input
            type="file"
            onChange={onChange}
            accept="image/*"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="absolute top-0 right-0 bg-white rounded-full p-1 shadow-md">
            {icon}
          </div>
        </div>
        <select
          value={selectedType}
          onChange={onTypeChange}
          className="border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {types.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-500 to-indigo-600 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white rounded-3xl shadow-2xl p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Virtual Try-On</h1>
          <p className="text-white/80">Upload your photo and try on different accessories or outfits.</p>
        </div>

        {/* Upload Photo */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-2">Upload Your Photo</label>
          <div className="flex items-center space-x-4">
            {faceImagePreview && (
              <img
                src={faceImagePreview}
                alt="Uploaded Face"
                className="w-32 h-32 object-cover rounded-lg border-2 border-blue-300"
              />
            )}
            <input
              type="file"
              onChange={handleFaceImageUpload}
              accept="image/*"
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-500 file:text-white hover:file:bg-green-600"
            />
          </div>
          {isAnalyzing && <p className="text-sm text-blue-600 mt-2">Analyzing image...</p>}
          {imageDescription && <p className="text-sm text-gray-600 mt-2 italic">{imageDescription}</p>}
        </div>

        {/* Mode Toggle */}
        {uploadedFaceImage && (
          <div className="flex justify-center mb-8 space-x-4">
            <button
              onClick={() => setMode('accessory')}
              className={`px-6 py-2 rounded-full font-semibold transition-colors ${
                mode === 'accessory'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Accessories
            </button>
            <button
              onClick={() => setMode('outfit')}
              className={`px-6 py-2 rounded-full font-semibold transition-colors ${
                mode === 'outfit'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Outfit
            </button>
          </div>
        )}

        {/* Accessory or Outfit Sections */}
        {uploadedFaceImage && !isAnalyzing && (
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {mode === 'accessory' ? (
              <div className="space-y-4">
                {renderUploadSection(
                  'Accessory',
                  (e) => { setUploadedAccessoryImage(e.target.files[0] || null); },
                  uploadedAccessoryImage,
                  <Sparkles size={20} />,
                  ACCESSORY_TYPES,
                  accessoryType,
                  (e) => setAccessoryType(e.target.value)
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {renderUploadSection(
                  'Top',
                  (e) => { setUploadedTopImage(e.target.files[0] || null); },
                  uploadedTopImage,
                  <Shirt size={20} />,
                  TOP_TYPES,
                  topType,
                  (e) => setTopType(e.target.value)
                )}
                {renderUploadSection(
                  'Pants',
                  (e) => { setUploadedPantsImage(e.target.files[0] || null); },
                  uploadedPantsImage,
                  <PawPrint size={20} />,
                  PANTS_TYPES,
                  pantsType,
                  (e) => setPantsType(e.target.value)
                )}
                {renderUploadSection(
                  'Shoes',
                  (e) => { setUploadedShoesImage(e.target.files[0] || null); },
                  uploadedShoesImage,
                  <ShoppingBag size={20} />,
                  SHOES_TYPES,
                  shoesType,
                  (e) => setShoesType(e.target.value)
                )}
                {renderUploadSection(
                  'Dress',
                  (e) => { setUploadedDressImage(e.target.files[0] || null); },
                  uploadedDressImage,
                  <ShoppingBagIcon size={20} />,
                  DRESS_TYPES,
                  dressType,
                  (e) => setDressType(e.target.value)
                )}
              </div>
            )}
          </div>
        )}

        

        {/* Generation button and loading state */}
        {uploadedFaceImage && !isAnalyzing && (
          <div className="mb-8 text-center">
            <button
              onClick={generateImage}
              disabled={loading || (mode === 'accessory' && !uploadedAccessoryImage) || (mode === 'outfit' && (!uploadedTopImage && !uploadedPantsImage && !uploadedShoesImage && !uploadedDressImage))}
              className="bg-green-500 hover:bg-green-600 transition-colors text-white font-bold py-3 px-8 rounded-full shadow-lg inline-flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <>
                  <Sparkles size={24} />
                  <span>Try It On!</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Display results or error */}
        {error && (
          <div className="bg-red-100 text-red-700 p-4 rounded-lg font-medium mb-8 border border-red-300">
            {error}
          </div>
        )}

        {generatedImage && (
          <div className="mt-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Your New Look</h2>
            <div className="flex justify-center mb-8">
              <div className="border-4 border-blue-400 rounded-xl p-2 inline-block shadow-lg bg-white">
                <img src={generatedImage} alt="Generated" className="max-h-[500px] rounded-lg object-contain w-auto h-auto" />
              </div>
            </div>

            {/* New section for updating the look */}
            <div className="mt-8 p-6 bg-gray-50 rounded-2xl border border-gray-200 shadow-md">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Refine Your Look</h3>
              <textarea
                className="w-full h-24 p-4 rounded-lg border border-gray-300 mb-4 focus:ring-purple-500 focus:border-purple-500 resize-none text-gray-700"
                placeholder="e.g., 'make the dress blue', 'add a vintage filter', 'change the background to a beach'"
                value={updatePrompt}
                onChange={(e) => setUpdatePrompt(e.target.value)}
              />
              <div className="text-center">
                <button
                  onClick={updateLook}
                  disabled={loading || !updatePrompt}
                  className="bg-purple-500 hover:bg-purple-600 transition-colors text-white font-bold py-3 px-8 rounded-full shadow-lg inline-flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                >
                  {loading ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <>
                      <RefreshCw size={24} />
                      <span>Update Look</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
