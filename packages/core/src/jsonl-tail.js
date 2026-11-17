import fs from 'fs';

const DEFAULT_CHUNK = 64 * 1024;
const DEFAULT_MAX = 8 * 1024 * 1024;

let tailReads = 0;
let tailBytes = 0;

export function jsonlTailStats() {
  return { reads: tailReads, bytes: tailBytes };
}

export function resetJsonlTailStats() {
  tailReads = 0;
  tailBytes = 0;
}

/**
 * Last `limit` non-empty lines, in file order.
 * Matches `readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).slice(-limit)`
 * for logs that fit in `maxBytes`, but reads from the end so a growing JSONL file
 * does not have to be loaded whole.
 *
 * `truncated` is true when older bytes were left unread (the file is longer than
 * the returned window). A single line larger than `maxBytes` is not returned.
 */
export function readJsonlTail(filePath, limit = 100, options = {}) {
  const chunkSize = options.chunkSize > 0 ? options.chunkSize : DEFAULT_CHUNK;
  const maxBytes = options.maxBytes > 0 ? options.maxBytes : DEFAULT_MAX;
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
  const fd = fs.openSync(filePath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    tailReads += 1;
    if (size === 0 || cap === 0) {
      return { lines: [], bytesRead: 0, fileSize: size, truncated: false };
    }

    let pos = size;
    let bytesRead = 0;
    const parts = [];
    while (pos > 0 && bytesRead < maxBytes) {
      const n = Math.min(chunkSize, pos, maxBytes - bytesRead);
      pos -= n;
      const buf = Buffer.allocUnsafe(n);
      fs.readSync(fd, buf, 0, n, pos);
      bytesRead += n;
      tailBytes += n;
      parts.unshift(buf);

      const startedAtZero = pos === 0;
      const startsAtLine = startedAtZero || byteAt(fd, pos - 1) === 10;
      const text = Buffer.concat(parts).toString('utf8');
      const lines = linesFromBuffer(text, {
        dropPartial: !startsAtLine,
        trimStart: startedAtZero,
        limit: cap,
      });
      if (startedAtZero || bytesRead >= maxBytes || lines.length >= cap) {
        return {
          lines,
          bytesRead,
          fileSize: size,
          truncated: !startedAtZero,
        };
      }
    }

    return { lines: [], bytesRead, fileSize: size, truncated: pos > 0 };
  } finally {
    fs.closeSync(fd);
  }
}

function byteAt(fd, offset) {
  const probe = Buffer.alloc(1);
  fs.readSync(fd, probe, 0, 1, offset);
  return probe[0];
}

function linesFromBuffer(text, { dropPartial, trimStart, limit }) {
  let body = text;
  if (dropPartial) {
    const cut = body.indexOf('\n');
    if (cut === -1) return [];
    body = body.slice(cut + 1);
  }
  body = trimStart ? body.trim() : body.replace(/\s+$/, '');
  if (!body) return [];
  const lines = body.split('\n').filter(Boolean);
  if (lines.length <= limit) return lines;
  return lines.slice(-limit);
}
