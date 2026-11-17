import fs from 'fs';
import path from 'path';

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
function readJsonlWindow(filePath, limit = 100, options = {}) {
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

/**
 * Last `limit` non-empty lines, in file order.
 * When the active file was rotated, older lines are taken from `filePath + ".1"`.
 */
export function readJsonlTail(filePath, limit = 100, options = {}) {
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
  const primary = readJsonlWindow(filePath, cap, options);
  if (options.spanRotation === false || primary.truncated || primary.lines.length >= cap) return primary;
  const previous = `${filePath}.1`;
  if (!fs.existsSync(previous)) return primary;
  const older = readJsonlWindow(previous, cap - primary.lines.length, options);
  return {
    lines: [...older.lines, ...primary.lines].slice(-cap),
    bytesRead: primary.bytesRead + older.bytesRead,
    fileSize: primary.fileSize + older.fileSize,
    truncated: older.truncated || primary.truncated,
  };
}

export function parseJsonlObjects(text, limit = Infinity) {
  const lines = Array.isArray(text) ? text : String(text || '').trim().split('\n').filter(Boolean);
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : lines.length;
  const window = lines.slice(-cap);
  const parsed = [];
  for (const line of window) {
    try {
      const value = JSON.parse(line);
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      parsed.push(value);
    } catch {
      /* torn write or corrupt line */
    }
  }
  return parsed;
}

export const DEFAULT_ROTATE_BYTES = 8 * 1024 * 1024;

export function rotateJsonlIfNeeded(filePath, maxBytes = DEFAULT_ROTATE_BYTES) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    if (err && err.code === 'ENOENT') return { rotated: false, size: 0 };
    throw err;
  }
  if (!Number.isFinite(maxBytes) || maxBytes <= 0 || stat.size < maxBytes) {
    return { rotated: false, size: stat.size };
  }
  const previous = `${filePath}.1`;
  fs.rmSync(previous, { force: true });
  fs.renameSync(filePath, previous);
  return { rotated: true, size: stat.size, previous };
}

export function appendJsonlLine(filePath, line, { maxBytes = DEFAULT_ROTATE_BYTES } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const rotated = rotateJsonlIfNeeded(filePath, maxBytes);
  const text = String(line).endsWith('\n') ? String(line) : `${line}\n`;
  fs.appendFileSync(filePath, text);
  return rotated;
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
