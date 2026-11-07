(function (root) {
  "use strict";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true});
  const format = encoder.encode("SNOWOPEN");
  const textStart = format.length + 1;
  const packetSize = 125;
  const maxCharacters = 20;
  const maxBytes = maxCharacters * 4;

  function pack(message) {
    if (!message.trim() || Array.from(message).length > maxCharacters) {
      throw new Error("请输入 1–20 个字。");
    }
    const text = encoder.encode(message);
    const packet = crypto.getRandomValues(new Uint8Array(packetSize));
    packet.set(format);
    packet[format.length] = text.length;
    packet.set(text, textStart);
    return packet;
  }

  function unpack(packet) {
    if (!format.every((byte, i) => byte === packet[i])) {
      throw new Error("检测到旧版雪花格式，请用旧版页面和原口令读取。");
    }
    const length = packet[format.length];
    if (packet.length !== packetSize || length < 1 || length > maxBytes) {
      throw new Error("读取失败，请换一张清晰的截图。");
    }
    return decoder.decode(packet.subarray(textStart, textStart + length));
  }

  root.SnowMessage = {pack, unpack};
})(globalThis);
