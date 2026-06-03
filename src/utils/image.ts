/*
 * Copyright (c) 2026 Lucas Vann (陆凯文)
 * Released under the MIT License. See LICENSE for details.
 */

// Read a File and compress it to a data: URL no larger than maxDim on the longest side.
// Returns the original file (as PNG/JPEG data URL) untouched if it's already small.
export async function fileToCompressedDataUrl(
  file: File,
  maxDim = 1024,
  quality = 0.85
): Promise<{ dataUrl: string; mime: string }> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = objectUrl
    })

    const { width, height } = img
    const longest = Math.max(width, height)
    const scale = longest > maxDim ? maxDim / longest : 1

    // No resize needed and file is already reasonably small: pass through
    if (scale === 1 && file.size < 512 * 1024) {
      const dataUrl = await readAsDataUrl(file)
      return { dataUrl, mime: file.type || 'image/png' }
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    // PNGs with transparency stay PNG; everything else goes to JPEG for size
    const useJpeg = !/png|webp/i.test(file.type)
    const mime = useJpeg ? 'image/jpeg' : 'image/png'
    const dataUrl = canvas.toDataURL(mime, quality)
    return { dataUrl, mime }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
