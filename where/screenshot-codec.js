/* Screenshot format v1. Geometry and seeds are part of the file format. */
(function (root) {
  "use strict";
  const grid = 128;
  const chip = 4;
  const size = grid * chip;
  const packetBytes = 129;
  const tail = 6;
  const steps = packetBytes * 8 + tail;
  const repetitions = 7;
  const markerSize = 20;
  const markerSpacing = 5;
  const carrierAmplitude = 21;
  const corners = [
    {x: 2, y: 2, rows: ["++--", "-+-+", "+--+", "--++"]},
    {x: 106, y: 2, rows: ["-++-", "++--", "--++", "+--+"]},
    {x: 2, y: 106, rows: ["+-++", "-+--", "++--", "--++"]},
    {x: 106, y: 106, rows: ["--+-", "-+++", "+---", "++-+"]},
  ];

  function randomSequence(seed) {
    return () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
  }

  const sign = (symbol) => symbol === "+" ? 1 : -1;
  const cell = (x, y) => y * grid + x;
  const markerField = new Float32Array(grid * grid);
  const reserved = new Uint8Array(grid * grid);
  for (const {x, y, rows} of corners) {
    for (let j = 0; j < markerSize; j++) {
      for (let i = 0; i < markerSize; i++) {
        const sx = Math.max(0, Math.min(3, (i - 2) / markerSpacing));
        const sy = Math.max(0, Math.min(3, (j - 2) / markerSpacing));
        const x0 = Math.min(2, Math.floor(sx));
        const y0 = Math.min(2, Math.floor(sy));
        const fx = sx - x0;
        const fy = sy - y0;
        const top = sign(rows[y0][x0]) * (1 - fx) + sign(rows[y0][x0 + 1]) * fx;
        const bottom = sign(rows[y0 + 1][x0]) * (1 - fx) + sign(rows[y0 + 1][x0 + 1]) * fx;
        const fade = Math.min(1, (1 + Math.min(i, j, markerSize - 1 - i, markerSize - 1 - j)) / 3);
        markerField[cell(x + i, y + j)] = 14 * fade * (top * (1 - fy) + bottom * fy);
        reserved[cell(x + i, y + j)] = 1;
      }
    }
  }

  const shuffle = randomSequence(0xa7cb2919);
  const slots = Array.from(reserved.keys()).filter(i => !reserved[i]);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(shuffle() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const codedLength = steps * 2;
  const dataSlots = slots.slice(0, codedLength * repetitions);
  const pilotSlots = slots.slice(dataSlots.length);
  const signs = Int8Array.from(slots, () => shuffle() < 0.5 ? -1 : 1);

  function parity(value) {
    value ^= value >>> 4;
    return (0x6996 >>> (value & 15)) & 1;
  }

  // K=7, rate 1/2. Input shifts into the low bit of the register.
  const symbols = Array.from({length: 128}, (_, register) => [
    parity(register & 0o171) ? 1 : -1,
    parity(register & 0o133) ? 1 : -1,
  ]);

  function encodeBits(packet) {
    const result = new Int8Array(codedLength);
    let state = 0;
    for (let i = 0; i < steps; i++) {
      const bit = i < packetBytes * 8 ? (packet[i >>> 3] >>> (7 - (i & 7))) & 1 : 0;
      state = ((state << 1) | bit) & 127;
      result.set(symbols[state], 2 * i);
    }
    return result;
  }

  function decodeBits(soft) {
    let previous = new Float32Array(64).fill(-Infinity);
    let next = new Float32Array(64);
    previous[0] = 0;
    const traceback = new Uint8Array(steps * 64);
    for (let i = 0; i < steps; i++) {
      const a = soft[2 * i];
      const b = soft[2 * i + 1];
      for (let state = 0; state < 64; state++) {
        const low = symbols[state];
        const high = symbols[state + 64];
        const from = state >>> 1;
        const left = previous[from] + a * low[0] + b * low[1];
        const right = previous[from + 32] + a * high[0] + b * high[1];
        next[state] = Math.max(left, right);
        traceback[i * 64 + state] = right > left ? 1 : 0;
      }
      [previous, next] = [next, previous];
    }
    const packet = new Uint8Array(packetBytes);
    let state = 0;
    for (let i = steps - 1; i >= 0; i--) {
      if (i < packetBytes * 8) packet[i >>> 3] |= (state & 1) << (7 - (i & 7));
      state = (state >>> 1) | (traceback[i * 64 + state] << 5);
    }
    return packet;
  }

  function checksum(bytes) {
    let crc = -1;
    for (const byte of bytes) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ -1) >>> 0;
  }

  function texturedMarkers(seed) {
    const offsets = markerField.slice();
    const random = randomSequence((seed ^ 0x6ca2ec79) || 1);
    const tiles = new Int8Array(markerSpacing * markerSpacing);
    for (const {x, y} of corners) {
      for (let top = 0; top < markerSize; top += markerSpacing) {
        for (let left = 0; left < markerSize; left += markerSpacing) {
          // Balance the bright and dark chips locally so their grain does not bury the marker.
          const darkCount = Math.floor(tiles.length / 2) + (random() < 0.5 ? 0 : 1);
          for (let i = 0; i < tiles.length; i++) tiles[i] = i < darkCount ? -1 : 1;
          for (let i = tiles.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
          }
          for (let i = 0; i < tiles.length; i++) {
            const index = cell(x + left + i % markerSpacing, y + top + Math.floor(i / markerSpacing));
            offsets[index] += carrierAmplitude * tiles[i];
          }
        }
      }
    }
    return offsets;
  }

  function render(payload, seed) {
    if (payload && payload.length !== packetBytes - 4) throw new Error("Invalid payload length");
    const packet = new Uint8Array(packetBytes);
    if (payload) packet.set(payload);
    const crc = checksum(packet.subarray(0, -4));
    new DataView(packet.buffer).setUint32(packetBytes - 4, payload ? crc : crc ^ 1);
    const bits = encodeBits(packet);
    const offsets = texturedMarkers(seed);
    for (let i = 0; i < dataSlots.length; i++) {
      offsets[dataSlots[i]] = carrierAmplitude * bits[i % codedLength] * signs[i];
    }
    for (let i = 0; i < pilotSlots.length; i++) {
      offsets[pilotSlots[i]] = 27 * signs[dataSlots.length + i];
    }
    const noise = randomSequence(seed || 1);
    const output = new Uint8ClampedArray(size * size * 4);
    const grain = new Float32Array(chip * chip);
    for (let y = 0; y < grid; y++) {
      for (let x = 0; x < grid; x++) {
        let sum = 0;
        for (let i = 0; i < grain.length; i++) {
          grain[i] = (noise() - 0.5) * 165;
          sum += grain[i];
        }
        const mean = 127.5 + offsets[cell(x, y)] - sum / grain.length;
        for (let i = 0; i < grain.length; i++) {
          const p = 4 * ((y * chip + (i >>> 2)) * size + x * chip + (i & 3));
          output[p] = output[p + 1] = output[p + 2] = mean + grain[i];
          output[p + 3] = 255;
        }
      }
    }
    return output;
  }

  function integralImage(rgba, width, height) {
    const stride = width + 1;
    const table = new Uint32Array(stride * (height + 1));
    for (let y = 1, p = 0; y <= height; y++) {
      let sum = 0;
      const row = y * stride;
      for (let x = 1; x <= width; x++, p += 4) {
        sum += (rgba[p] + 2 * rgba[p + 1] + rgba[p + 2]) >>> 2;
        table[row + x] = table[row - stride + x] + sum;
      }
    }
    return {table, stride, width, height};
  }

  function samples(sparse) {
    return corners.flatMap(({x, y, rows}) => {
      const points = rows.flatMap((row, j) => Array.from(row, (value, i) => ({
        x: x + 2.5 + i * markerSpacing, y: y + 2.5 + j * markerSpacing, value: sign(value),
      })));
      if (!sparse) return points;
      // Check a dispersed subset before scoring the complete marker.
      return [0, 3, 5, 6, 9, 10, 12, 15].map(i => points[i]);
    });
  }

  const sparseSamples = samples(true);
  const denseSamples = samples(false);

  function markerKernel(points, width, stride) {
    const unit = width / grid;
    const radius = Math.max(1, Math.round(unit * 2.15));
    const offsets = new Int32Array(points.length);
    const weights = new Float32Array(points.length);
    for (let i = 0; i < points.length; i++) {
      const center = Math.round(points[i].x * unit) + Math.round(points[i].y * unit) * stride;
      offsets[i] = center - radius * (1 + stride);
      weights[i] = points[i].value;
    }
    return {offsets, weights, dx: 2 * radius, dy: 2 * radius * stride, area: 4 * radius * radius};
  }

  function markerScore(table, start, kernel, requireEach) {
    const {offsets, weights, dx, dy, area} = kernel;
    const count = offsets.length / 4;
    let dot = 0;
    let squares = 0;
    let energy = 0;
    for (let c = 0; c < 4; c++) {
      let sum = 0, power = 0, product = 0, polarity = 0;
      for (let i = c * count; i < (c + 1) * count; i++) {
        const p = start + offsets[i];
        const value = table[p + dx + dy] - table[p + dx] - table[p + dy] + table[p];
        sum += value;
        power += value * value;
        product += weights[i] * value;
        polarity += weights[i];
      }
      const correlation = product - sum * polarity / count;
      if (requireEach && correlation < 3 * count * area) return 0;
      dot += correlation;
      squares += power - sum * sum / count;
      energy += count - polarity * polarity / count;
    }
    return dot > 4 * offsets.length * area && squares > 0
      ? dot / Math.sqrt(squares * energy)
      : 0;
  }

  function locate(integral) {
    const {table, stride, width, height} = integral;
    const limit = Math.min(width, height);
    const shortlist = [];
    function retain(candidate) {
      const match = shortlist.findIndex(other => Math.abs(other.w - candidate.w) < candidate.w * 0.10 &&
        Math.abs(other.x - candidate.x) < candidate.w * 0.06 && Math.abs(other.y - candidate.y) < candidate.w * 0.06);
      if (match >= 0 && shortlist[match].score >= candidate.score) return;
      if (match >= 0) shortlist.splice(match, 1);
      shortlist.push(candidate);
      shortlist.sort((a, b) => b.score - a.score);
      if (shortlist.length > 12) shortlist.pop();
    }

    function scan(w) {
      const sparse = markerKernel(sparseSamples, w, stride);
      const dense = markerKernel(denseSamples, w, stride);
      const hop = Math.max(2, Math.floor(w / 75));
      for (let y = 0; ; y = Math.min(y + hop, height - w)) {
        for (let x = 0; ; x = Math.min(x + hop, width - w)) {
          const start = y * stride + x;
          if (markerScore(table, start, sparse, false) > 0.43) {
            const score = markerScore(table, start, dense, true);
            if (score > 0.47 && (shortlist.length < 12 || score > shortlist.at(-1).score)) {
              retain({x, y, w, score});
            }
          }
          if (x === width - w) break;
        }
        if (y === height - w) break;
      }
    }
    for (let w = 176; w < limit; w = Math.ceil(w * 1.06)) scan(w);
    if (limit >= 176) scan(limit);

    return shortlist.map(candidate => {
      let best = candidate;
      for (let hop = Math.max(1, Math.round(candidate.w / 105)); hop >= 1; hop = Math.floor(hop / 2)) {
        const anchor = best;
        for (let dw = -2; dw <= 2; dw++) {
          const w = anchor.w + dw * hop;
          if (w < 172 || w > limit) continue;
          const dense = markerKernel(denseSamples, w, stride);
          for (let dy = -2; dy <= 2; dy++) {
            const y = anchor.y + dy * hop;
            if (y < 0 || y + w > height) continue;
            for (let dx = -2; dx <= 2; dx++) {
              const x = anchor.x + dx * hop;
              if (x < 0 || x + w > width) continue;
              const score = markerScore(table, y * stride + x, dense, true);
              if (score > best.score) best = {x, y, w, score};
            }
          }
        }
      }
      return best;
    });
  }

  // Bilinear evaluation of the integral image gives fractional box averages.
  function areaAt(table, stride, x, y) {
    const left = Math.floor(x);
    const top = Math.floor(y);
    const p = top * stride + left;
    const fx = x - left;
    const fy = y - top;
    const a = fx ? table[p] * (1 - fx) + table[p + 1] * fx : table[p];
    if (!fy) return a;
    const b = fx ? table[p + stride] * (1 - fx) + table[p + stride + 1] * fx : table[p + stride];
    return a * (1 - fy) + b * fy;
  }

  function chipReader({table, stride}, {x, y, w}) {
    const unit = w / grid;
    const side = unit * 0.78;
    return index => {
      const left = x + ((index % grid) + 0.11) * unit;
      const top = y + ((index >>> 7) + 0.11) * unit;
      const right = left + side;
      const bottom = top + side;
      const sum = areaAt(table, stride, right, bottom) - areaAt(table, stride, right, top) -
        areaAt(table, stride, left, bottom) + areaAt(table, stride, left, top);
      return sum / (side * side) - 127.5;
    };
  }

  function refine(integral, marker) {
    function pilotScore(box) {
      if (box.x < 0 || box.y < 0 || box.x + box.w > integral.width || box.y + box.w > integral.height) return -Infinity;
      const read = chipReader(integral, box);
      let sum = 0;
      for (let i = 0; i < pilotSlots.length; i++) {
        sum += Math.max(-50, Math.min(50, read(pilotSlots[i]))) * signs[dataSlots.length + i];
      }
      return sum / pilotSlots.length;
    }
    let best = marker;
    let score = pilotScore(best);
    for (const hop of [marker.w / 240, marker.w / 560, marker.w / 1200]) {
      const anchor = best;
      for (let dw = -3; dw <= 3; dw++) {
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const box = {x: anchor.x + dx * hop, y: anchor.y + dy * hop, w: anchor.w + dw * hop};
            const value = pilotScore(box);
            if (value > score) {
              best = box;
              score = value;
            }
          }
        }
      }
    }
    return {box: best, score};
  }

  function recover(rgba, width, height) {
    const integral = integralImage(rgba, width, height);
    const markers = locate(integral);
    const candidates = markers.map(marker => refine(integral, marker)).sort((a, b) => b.score - a.score);
    for (const {box, score} of candidates) {
      if (score < 2.0) continue;
      const read = chipReader(integral, box);
      const soft = new Float32Array(codedLength);
      for (let i = 0; i < dataSlots.length; i++) {
        soft[i % codedLength] += Math.max(-44, Math.min(44, read(dataSlots[i]))) * signs[i];
      }
      const packet = decodeBits(soft);
      const payload = packet.subarray(0, -4);
      if (new DataView(packet.buffer).getUint32(packetBytes - 4) === checksum(payload)) return {payload, box};
    }
    return {payload: null, located: candidates.some(candidate => candidate.score >= 2.0)};
  }

  root.ScreenshotCodec = {size, render, recover};
})(globalThis);
