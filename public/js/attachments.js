const allowed = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
const dataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read this file."));
    reader.readAsDataURL(file);
  });
export async function readAttachment(file) {
  if (!allowed.has(file.type))
    throw new Error("Choose a PNG, JPEG, WebP, HEIC, HEIF, or PDF.");
  if (file.size > 15 * 1024 * 1024)
    throw new Error("Choose a file smaller than 15 MB.");
  let prepared = file;
  // Compress large browser-decodable images to fit the legacy document format,
  // which retains both API data and its display preview for old clients.
  if (file.type.startsWith("image/") && file.size > 280_000) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.7, 0.55]) {
        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        );
        if (blob && blob.size < prepared.size) prepared = blob;
        if (prepared.size <= 280_000) break;
      }
    } catch {
      /* HEIC/HEIF may be supported by Gemini but not the browser decoder. */
    } finally {
      bitmap?.close();
    }
  }
  if (prepared.size > 2_800_000)
    throw new Error(
      "This file is too large to send through the app. Use a smaller PDF or image (under 2.8 MB after compression).",
    );
  return {
    name: file.name,
    mimeType: prepared.type,
    data: await dataUrl(prepared),
    compressed: prepared !== file,
  };
}
