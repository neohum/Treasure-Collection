/**
 * 사진 축소: 최대 800px, JPEG 0.7. 브라우저 전용(canvas). 크롬북 저장 공간과 IndexedDB 용량을
 * 아끼고, 교사가 배부한 원본(수 MB)을 그대로 쌓지 않기 위해서다.
 */
export const IMAGE_MAX_DIM = 800;
export const IMAGE_JPEG_QUALITY = 0.7;

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // 일부 형식(HEIC 등)은 createImageBitmap이 거부한다 → <img>로 재시도
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("이미지를 읽을 수 없습니다"));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function shrinkImage(file: Blob, maxDim = IMAGE_MAX_DIM, quality = IMAGE_JPEG_QUALITY): Promise<Blob> {
  const source = await decode(file);
  let { width, height } = source;
  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas를 사용할 수 없습니다");
  ctx.fillStyle = "#ffffff"; // 투명 PNG → JPEG 변환 시 검은 배경 방지
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ("close" in source) source.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("이미지 변환 실패"))), "image/jpeg", quality);
  });
}
