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

  // !!! IMPORTANT: REPLACE THIS URL WITH YOUR CLOUDFLARE WORKER URL !!!
  // Example: "https://virtual-try-on-proxy.YOUR_USERNAME.workers.dev"
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

      const faceBase64 = faceImageData.split(',')[1];
      const clothingBase64 = clothingImageData.split(',')[1];

      // Prompt for runwayml/stable-diffusion-inpainting editing
      const prompt = `Create a realistic photo of the person from the first image wearing the ${clothingType} from the second image. Keep the person's pose, lighting, and background the same. High quality, natural blend, full body if possible.`;

      const payload = {
        inputs: prompt,
        parameters: {
          image: faceBase64,
          mask_image: clothingBase64,
          num_inference_steps: 20,
          guidance_scale: 7.5
        }
      };

      // Call the proxy endpoint
      const response = await fetch(IMAGE_GEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const generatedPart = result?.candidates?.[0]?.content?.parts?.[0];

      if (generatedPart?.inline_data) {
        // Construct image URL from base64
        const imageSrc = `data:${generatedPart.inline_data.mime_type};base64,${generatedPart.inline_data.data}`;
        setGeneratedImage(imageSrc);
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
        inputs: updatePrompt,
        parameters: {
          image: generatedBase64,
          mask_image: '',
          num_inference_steps: 20,
          guidance_scale: 7.5
        }
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
    const renderUploadSection = (title, uploadHandler, uploadState, uploadIcon, dropdownOptions, dropdownValue, dropdownHandler) => (
    <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-4">
      <label htmlFor={`${title.toLowerCase().replace(/\s/g, '-')}-upload`} className="cursor-pointer bg-green-500 hover:bg-green-600 transition-colors text-white font-semibold py-2 px-6 rounded-full inline-flex items-center space-x-2 shadow-lg">
        {uploadIcon}
        <span>{uploadState ? `Change ${title}` : `Upload ${title}`}</span>
      </label>
      <input
        id={`${title.toLowerCase().replace(/\s/g, '-')}-upload`}
        type="file"
        accept="image/png, image/jpeg"
        className="hidden"
        onChange={uploadHandler}
      />
      <select
        value={dropdownValue}
        onChange={dropdownHandler}
        className="py-2 px-4 rounded-full bg-white border border-gray-300 text-gray-700 font-medium"
      >
        {dropdownOptions.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      {uploadState && (
        <div className="mt-4 border-4 border-dashed border-gray-300 rounded-xl p-2 inline-block">
          <img src={URL.createObjectURL(uploadState)} alt={title} className="max-h-32 rounded-lg object-contain" />
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-gray-100 min-h-screen font-sans antialiased text-gray-800 flex flex-col items-center py-12 px-4">
      <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-2xl text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold text-blue-600 mb-2">Virtual Try-On</h1>
        <p className="text-gray-500 mb-8 text-lg">Upload your photo and try on different accessories or outfits.</p>

        {/* Face Image upload and preview section */}
        <div className="mb-8">
          <label htmlFor="face-image-upload" className="cursor-pointer bg-blue-500 hover:bg-blue-600 transition-colors text-white font-semibold py-3 px-6 rounded-full inline-flex items-center space-x-2 shadow-lg">
            <Camera size={20} />
            <span>{uploadedFaceImage ? 'Change Photo' : 'Upload Your Photo'}</span>
          </label>
          <input
            id="face-image-upload"
            type="file"
            accept="image/png, image/jpeg"
            className="hidden"
            onChange={handleFaceImageUpload}
          />
          {isAnalyzing && (
            <div className="mt-4 text-sm text-gray-500 flex items-center justify-center space-x-2">
              <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Analyzing photo...</span>
            </div>
          )}
          {faceImagePreview && (
            <div className="mt-6 border-4 border-dashed border-gray-300 rounded-xl p-2 inline-block">
              <img src={faceImagePreview} alt="Uploaded Face" className="max-h-64 rounded-lg object-contain" />
            </div>
          )}
        </div>

        {/* Mode selection */}
        {uploadedFaceImage && !isAnalyzing && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">Choose an Option</h2>
            <div className="flex flex-wrap justify-center gap-4">
              <button
                onClick={() => setMode('accessory')}
                className={`py-2 px-4 rounded-full font-medium transition-all transform hover:scale-105
                  ${mode === 'accessory' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Choose an Accessory
              </button>
              <button
                onClick={() => setMode('outfit')}
                className={`py-2 px-4 rounded-full font-medium transition-all transform hover:scale-105
                  ${mode === 'outfit' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Choose an Outfit
              </button>
            </div>
          </div>
        )}

        {/* Accessory upload section */}
        {uploadedFaceImage && !isAnalyzing && mode === 'accessory' && (
          <div className="mb-8 p-6 bg-gray-50 rounded-2xl border border-gray-200">
            <h3 className="text-lg font-semibold mb-4">Upload Your Accessory</h3>
            <div className="flex flex-col md:flex-row items-center justify-center gap-4">
              <select
                value={accessoryType}
                onChange={(e) => setAccessoryType(e.target.value)}
                className="py-2 px-4 rounded-full bg-white border border-gray-300 text-gray-700 font-medium"
              >
                {ACCESSORY_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <label htmlFor="accessory-image-upload" className="cursor-pointer bg-green-500 hover:bg-green-600 transition-colors text-white font-semibold py-2 px-6 rounded-full inline-flex items-center space-x-2 shadow-lg">
                <Upload size={20} />
                <span>{uploadedAccessoryImage ? 'Change Accessory' : 'Upload Accessory'}</span>
              </label>
              <input
                id="accessory-image-upload"
                type="file"
                accept="image/png, image/jpeg"
                className="hidden"
                onChange={(e) => { setUploadedAccessoryImage(e.target.files[0] || null); }}
              />
            </div>
            {uploadedAccessoryImage && (
              <div className="mt-4 border-4 border-dashed border-gray-300 rounded-xl p-2 inline-block">
                <img src={URL.createObjectURL(uploadedAccessoryImage)} alt="Uploaded Accessory" className="max-h-32 rounded-lg object-contain" />
              </div>
            )}
          </div>
        )}

        {/* Outfit upload section */}
        {uploadedFaceImage && !isAnalyzing && mode === 'outfit' && (
          <div className="mb-8 p-6 bg-gray-50 rounded-2xl border border-gray-200">
            <h3 className="text-lg font-semibold mb-4">Upload Your Outfit</h3>
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
          </div>
        )}

        {/* Generation button and loading state */}
        {uploadedFaceImage && !isAnalyzing && (
          <div className="mb-8">
            <button
              onClick={generateImage}
              disabled={loading || (mode === 'accessory' && !uploadedAccessoryImage) || (mode === 'outfit' && (!uploadedTopImage && !uploadedPantsImage && !uploadedShoesImage && !uploadedDressImage))}
              className="bg-green-500 hover:bg-green-600 transition-colors text-white font-bold py-3 px-8 rounded-full shadow-lg inline-flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <>
                  <Sparkles size={20} />
                  <span>Try It On!</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Display results or error */}
        {error && (
          <div className="bg-red-100 text-red-700 p-4 rounded-lg font-medium mb-8">
            {error}
          </div>
        )}

        {generatedImage && (
          <div className="mt-8">
            <h2 className="text-xl font-bold mb-4">Your New Look</h2>
            <div className="border-4 border-blue-200 rounded-xl p-2 inline-block">
              <img src={generatedImage} alt="Generated" className="max-h-[500px] rounded-lg object-contain" />
            </div>

            {/* New section for updating the look */}
            <div className="mt-8 p-6 bg-gray-50 rounded-2xl border border-gray-200">
              <h3 className="text-lg font-semibold mb-4">Update Your Look</h3>
              <textarea
                className="w-full h-24 p-4 rounded-lg border border-gray-300 mb-4 focus:ring-blue-500 focus:border-blue-500 resize-none"
                placeholder="e.g., 'remove the glasses', 'change the jacket to red', 'add a hat'"
                value={updatePrompt}
                onChange={(e) => setUpdatePrompt(e.target.value)}
              />
              <button
                onClick={updateLook}
                disabled={loading || !updatePrompt}
                className="bg-purple-500 hover:bg-purple-600 transition-colors text-white font-bold py-3 px-8 rounded-full shadow-lg inline-flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 A7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <>
                    <RefreshCw size={20} />
                    <span>Update New Look</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
