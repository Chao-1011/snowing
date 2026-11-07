"use strict";
importScripts("./screenshot-codec.js");
self.onmessage = ({data: {rgba, width, height}}) => {
  try {
    self.postMessage(ScreenshotCodec.recover(new Uint8ClampedArray(rgba), width, height));
  } catch {
    self.postMessage({error: "无法分析这张图片，请换一张较小的截图。"});
  }
};
