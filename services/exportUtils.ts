import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { DocumentData, ScannedPage } from "../types";

// Helper: Convert base64 data URL to specific format
const convertToFormat = async (dataUrl: string, format: 'jpeg' | 'png' | 'webp'): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    // Allow cross-origin if needed, though usually local data
    img.crossOrigin = "anonymous"; 
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(img, 0, 0);
      
      // Determine quality: 0.92 for jpeg/webp, undefined for png (lossless)
      const quality = format === 'png' ? undefined : 0.92;
      resolve(canvas.toDataURL(`image/${format}`, quality));
    };
    img.src = dataUrl;
  });
};

export const exportToPDF = async (doc: DocumentData) => {
  // A4 size in mm: 210 x 297
  const pdf = new jsPDF({
    orientation: "p",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const maxWidth = pageWidth - (margin * 2);
  const maxHeight = pageHeight - (margin * 2);

  for (let i = 0; i < doc.pages.length; i++) {
    if (i > 0) pdf.addPage();
    
    const page = doc.pages[i];
    const imgData = page.processedDataUrl;
    
    // Create an image element to get dimensions
    const imgProps = await new Promise<{width: number, height: number}>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.src = imgData;
    });

    // Calculate aspect ratio to fit within margins
    const imgRatio = imgProps.width / imgProps.height;
    const pageRatio = maxWidth / maxHeight;
    
    let finalWidth, finalHeight;
    
    if (imgRatio > pageRatio) {
        // Width constrained
        finalWidth = maxWidth;
        finalHeight = maxWidth / imgRatio;
    } else {
        // Height constrained
        finalHeight = maxHeight;
        finalWidth = maxHeight * imgRatio;
    }

    // Center the image
    const x = (pageWidth - finalWidth) / 2;
    const y = (pageHeight - finalHeight) / 2;

    pdf.addImage(imgData, 'JPEG', x, y, finalWidth, finalHeight);
    
    // Add page number footer
    pdf.setFontSize(10);
    pdf.setTextColor(150);
    pdf.text(`Page ${i + 1} of ${doc.pages.length} - ${doc.title}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
  }

  pdf.save(`${doc.title.replace(/\s+/g, '_')}.pdf`);
};

export const downloadSinglePage = async (page: ScannedPage, title: string, format: 'jpeg' | 'png' | 'webp') => {
  let data = page.processedDataUrl;
  
  // Convert if the requested format doesn't match the source (usually jpeg)
  const currentFormat = data.match(/image\/(\w+)/)?.[1] || 'jpeg';
  if (format !== currentFormat) {
    data = await convertToFormat(data, format);
  }

  const link = document.createElement('a');
  link.href = data;
  link.download = `${title.replace(/\s+/g, '_')}.${format}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportToZIP = async (doc: DocumentData, format: 'jpeg' | 'png' | 'webp' = 'jpeg') => {
  const zip = new JSZip();
  const folder = zip.folder(doc.title.replace(/\s+/g, '_')) || zip;

  // Add Images
  // We use Promise.all to handle potential async canvas conversions
  await Promise.all(doc.pages.map(async (page, index) => {
    let data = page.processedDataUrl;
    
    // Convert format if necessary
    const currentFormat = data.match(/image\/(\w+)/)?.[1] || 'jpeg';
    if (format !== currentFormat) {
       data = await convertToFormat(data, format);
    }
    
    // Remove header for JSZip
    const base64 = data.split(',')[1];
    folder.file(`page_${index + 1}.${format}`, base64, { base64: true });
  }));

  // Add Metadata Text File
  let metaContent = `Title: ${doc.title}\nDate: ${new Date(doc.createdAt).toLocaleString()}\nCategory: ${doc.category}\n\n`;
  if (doc.aiSummary) metaContent += `--- AI Summary ---\n${doc.aiSummary}\n\n`;
  if (doc.translation) metaContent += `--- Translation (${doc.translation.targetLang}) ---\n${doc.translation.text}\n`;
  
  folder.file("info.txt", metaContent);

  const content = await zip.generateAsync({ type: "blob" });
  
  // Trigger Download
  const link = document.createElement('a');
  link.href = URL.createObjectURL(content);
  link.download = `${doc.title.replace(/\s+/g, '_')}_images.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportToTXT = (doc: DocumentData) => {
  let content = `${doc.title}\n${new Date(doc.createdAt).toLocaleDateString()}\n========================\n\n`;
  
  if (doc.aiSummary) {
    content += `[ AI Summary ]\n${doc.aiSummary}\n\n`;
  } else {
    content += `[ AI Summary ]\nNo summary available.\n\n`;
  }

  if (doc.translation) {
    content += `[ Translation - ${doc.translation.targetLang} ]\n${doc.translation.text}\n\n`;
  }

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${doc.title.replace(/\s+/g, '_')}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};