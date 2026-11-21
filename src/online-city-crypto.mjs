const magic = new TextEncoder().encode('SKYMAP01');
const headerSize = magic.length + 16 + 12;

async function mapKey(city, salt) {
  const name = new TextEncoder().encode(city.trim().normalize('NFC'));
  const material = await crypto.subtle.importKey('raw', name, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptOnlineCity(data, city) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = new Uint8Array(headerSize);
  header.set(magic);
  header.set(salt, magic.length);
  header.set(iv, magic.length + salt.length);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, await mapKey(city, salt), data);
  const output = new Uint8Array(header.length + encrypted.byteLength);
  output.set(header);
  output.set(new Uint8Array(encrypted), header.length);
  return output;
}

export async function decryptOnlineCity(data, city) {
  const bytes = new Uint8Array(data);
  if (bytes.length < headerSize + 16 || !magic.every((b, i) => bytes[i] === b)) throw new Error('Unknown map format');
  const salt = bytes.slice(magic.length, magic.length + 16);
  const iv = bytes.slice(magic.length + 16, headerSize);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: bytes.subarray(0, headerSize) },
    await mapKey(city, salt), bytes.subarray(headerSize));
}
