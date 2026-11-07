"use strict";
const fileInput = document.getElementById("file");
const picker = document.getElementById("picker");
const pickIcon = document.getElementById("pick-icon");
const preview = document.getElementById("preview");
const decodeButton = document.getElementById("decode");
const result = document.getElementById("result");
let selectedFile;
let previewUrl;

async function scan(file) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("请使用 PNG、JPEG 或 WebP 图片。"); }
  const source = document.createElement("canvas");
  const scale = Math.min(1, 3840 / Math.max(bitmap.width, bitmap.height));
  source.width = Math.max(1, Math.round(bitmap.width * scale));
  source.height = Math.max(1, Math.round(bitmap.height * scale));
  if (Math.min(source.width, source.height) < 176) {
    bitmap.close();
    throw new Error("请重新截图，让雪花的边长至少有 256 像素。");
  }
  const context = source.getContext("2d", {willReadFrequently: true, alpha: false});
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, source.width, source.height);
  bitmap.close();
  const {data} = context.getImageData(0, 0, source.width, source.height);
  return new Promise((resolve, reject) => {
    const worker = new Worker("./screenshot-worker.js");
    worker.onmessage = ({data: decoded}) => {
      worker.terminate();
      if (decoded.error) reject(new Error(decoded.error));
      else resolve(decoded);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("读取模块加载失败，请刷新页面再试。"));
    };
    worker.postMessage({rgba: data.buffer, width: source.width, height: source.height}, [data.buffer]);
  });
}

function selectFile(file) {
  if (!file || picker.disabled) return;
  selectedFile = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  preview.hidden = false;
  pickIcon.hidden = true;
  result.textContent = "";
  decodeButton.disabled = false;
}

async function read() {
  if (!selectedFile || decodeButton.disabled) return;
  picker.disabled = decodeButton.disabled = true;
  decodeButton.setAttribute("aria-busy", "true");
  result.textContent = "";
  try {
    const found = await scan(selectedFile);
    result.textContent = found.payload ? SnowMessage.unpack(found.payload) : "无缘无份";
  } catch {
    result.textContent = "无缘无份";
  } finally {
    picker.disabled = decodeButton.disabled = false;
    decodeButton.removeAttribute("aria-busy");
  }
}

picker.addEventListener("click", () => fileInput.click());
decodeButton.addEventListener("click", read);
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  fileInput.value = "";
  selectFile(file);
});
document.addEventListener("dragover", event => {
  if (event.dataTransfer.types.includes("Files")) event.preventDefault();
});
document.addEventListener("drop", event => {
  const file = event.dataTransfer.files[0];
  if (!file) return;
  event.preventDefault();
  selectFile(file);
});
document.addEventListener("paste", event => {
  const image = Array.from(event.clipboardData?.files ?? []).find(file => file.type.startsWith("image/"));
  if (!image) return;
  event.preventDefault();
  selectFile(image);
});
