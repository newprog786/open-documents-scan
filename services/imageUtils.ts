import { FilterType } from '../types';

export const processImage = async (
  dataUrl: string,
  filter: FilterType,
  rotation: number,
  highlightsLayer?: string
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);

      // Handle Rotation Dimensions
      if (rotation === 90 || rotation === 270) {
        canvas.width = img.height;
        canvas.height = img.width;
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }

      // 1. Draw Rotated Base Image
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();

      // 2. Apply Filters
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      if (filter === FilterType.GRAYSCALE || filter === FilterType.MAGIC_ENHANCE || filter === FilterType.BW) {
        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          data[i] = avg;     // R
          data[i + 1] = avg; // G
          data[i + 2] = avg; // B
        }
      }

      if (filter === FilterType.MAGIC_ENHANCE) {
        // Simple adaptive thresholding simulation (Contrast stretch)
        for (let i = 0; i < data.length; i += 4) {
          let v = data[i];
          v = v < 128 ? v * 0.8 : v * 1.2;
          if (v > 255) v = 255;
          if (v < 0) v = 0;
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
        }
      }

      if (filter === FilterType.BW) {
        // Strict Binarization
        for (let i = 0; i < data.length; i += 4) {
          const v = data[i] > 128 ? 255 : 0;
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
        }
      }

      ctx.putImageData(imageData, 0, 0);

      // 3. Overlay Highlights (if present)
      // We assume highlightsLayer is already in the correct orientation for the final canvas
      if (highlightsLayer) {
        const hlImg = new Image();
        hlImg.crossOrigin = "anonymous";
        hlImg.onload = () => {
          ctx.drawImage(hlImg, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        hlImg.onerror = () => {
           // Fallback if highlight load fails
           resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        hlImg.src = highlightsLayer;
      } else {
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      }
    };
    img.src = dataUrl;
  });
};

export const generateId = () => Math.random().toString(36).substr(2, 9);
export const formatDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });