"use strict";
const form = document.querySelector("form");
const message = document.getElementById("message");
const canvas = document.getElementById("snow");
const download = document.getElementById("download");
const statusText = document.getElementById("status");
const button = form.querySelector("button");
let outputUrl;

form.addEventListener("submit", async event => {
  event.preventDefault();
  button.disabled = true;
  statusText.hidden = true;
  canvas.hidden = download.hidden = true;
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl = undefined;
  try {
    const payload = SnowMessage.pack(message.value);
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const {size, render} = ScreenshotCodec;
    const pixels = render(payload, seed);
    canvas.getContext("2d").putImageData(new ImageData(pixels, size, size), 0, 0);
    const png = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("生成 PNG 失败，请重试。");
    outputUrl = URL.createObjectURL(png);
    download.href = outputUrl;
    canvas.hidden = download.hidden = false;
  } catch (error) {
    statusText.textContent = error.message;
    statusText.hidden = false;
  } finally {
    button.disabled = false;
  }
});
