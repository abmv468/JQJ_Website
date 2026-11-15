import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { paymentTestListingHidden } from "@/data/products";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Locked rasters from the WEB-023 pack. Do not recrop or rebuild these bytes. */
const LOCKED_SHA256: Record<string, string> = {
  "public/favicon.ico": "894e7f3cb42b38adcf8ab7c884def7d1885d47fbab690d4aa3657c349f6fb2ae",
  "public/apple-touch-icon.png": "292363bd2be44c336e22909fc908985915e3d24e6c10c62c93c0025161155ffe",
  "public/icon-16.png": "98164c8a25b0a648cfb878051d4a9adae63cb9f7ca847cd91b96fbba1a130e69",
  "public/icon-32.png": "4a097e97213a739cb35bf15ffcc806f461a3dfa0e33d7db068fd52d2016f48dd",
  "public/icon-48.png": "0da9bec6595fd21b50f4dadffa5222d903ff0efdf908998abbaa0f85a8645dc2",
  "public/icon-192.png": "b1048ac5cc6bee2ba633e08e02d724b8f7fe8bf09caccf9d3f4d2082a796fcb7",
  "public/icon-512.png": "6bf9b903a8c82ab65b3c94488d4483877815f84bd7d74e1ecf11b51f068e0f17",
  "public/icon-16-dark.png": "aaff3b4a6c1b5bc2512f0367ca0b1e5f011486bfbd56abf1a6cd6b4946c7430d",
  "public/icon-32-dark.png": "1791c80694792e67c2780c66f11f83cff0b63f3af01bf074f1bfde97f58b931a",
  "public/icon-48-dark.png": "c7ff2a828dd97ab0100f0376e529d22c13cc96c865e4e992e6926af589dec363",
  "public/icon-192-dark.png": "41f3bad74d870e513007de8457441f154b4a8fa941cfd1793e4faa87e5026fb8",
  "public/icon-512-dark.png": "1531dcf8337c560629c6d6ff2685d2a6df6393648bfb9af3ee5fa35813063ef3",
  "public/icon-180.png": "473a8576332ea2445079b8e3fe2d503d804e90a44c315f775691b4382d082a6f",
  "public/icon-180-dark.png": "4a0fce8dd41f52bf2bf6bc7ddad0f798859746626b08bd1657e7b2b8ad7e86be",
};

const DESCRIPTION =
  "Bracelets and necklaces inspired by Eastern cultural heritage, museum collaborations, and natural gemstone artistry.";

function source(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

function sha256(relative: string): string {
  return createHash("sha256").update(readFileSync(path.join(root, relative))).digest("hex");
}

type PngInfo = {
  width: number;
  height: number;
  colorType: number;
  hasTrns: boolean;
  pixels: Buffer;
  channels: number;
};

function decodePng(buf: Buffer): PngInfo {
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("not a png");
  }

  let offset = 8;
  const idat: Buffer[] = [];
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  let hasTrns = false;

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "tRNS") {
      hasTrns = true;
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (bitDepth !== 8 || channels === 0 || width === 0 || height === 0) {
    throw new Error(`unsupported png bit=${bitDepth} color=${colorType}`);
  }

  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let src = 0;
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[src];
    src += 1;
    const raw = inflated.subarray(src, src + stride);
    src += stride;
    const out = Buffer.alloc(stride);

    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? out[i - channels] : 0;
      const up = prev[i];
      const ul = i >= channels ? prev[i - channels] : 0;
      const value = raw[i];
      if (filter === 0) out[i] = value;
      else if (filter === 1) out[i] = (value + left) & 255;
      else if (filter === 2) out[i] = (value + up) & 255;
      else if (filter === 3) out[i] = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) {
        const paeth = left + up - ul;
        const pa = Math.abs(paeth - left);
        const pb = Math.abs(paeth - up);
        const pc = Math.abs(paeth - ul);
        const pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : ul;
        out[i] = (value + pred) & 255;
      } else {
        throw new Error(`bad png filter ${filter}`);
      }
    }

    out.copy(pixels, y * stride);
    prev = out;
  }

  return { width, height, colorType, hasTrns, pixels, channels };
}

function pathData(svg: string): string {
  const match = svg.match(/<path\b[^>]*\bd="([^"]+)"/);
  if (!match) throw new Error("svg path missing");
  return match[1];
}

describe("light/dark gem-and-wave favicon", () => {
  const layout = source("app/layout.tsx");
  const header = source("components/layout/Header.tsx");
  const light = source("public/favicon-light.svg");
  const dark = source("public/favicon-dark.svg");
  const apple = decodePng(readFileSync(path.join(root, "public/apple-touch-icon.png")));

  it("commits the locked raster fallbacks byte-for-byte", () => {
    for (const [relative, hash] of Object.entries(LOCKED_SHA256)) {
      expect(sha256(relative)).toBe(hash);
    }
    const ico = readFileSync(path.join(root, "public/favicon.ico"));
    expect(ico.subarray(0, 4).toString("hex")).toBe("00000100");
    expect(ico.readUInt16LE(4)).toBe(3);
  });

  it("ships two real vector SVGs with the same paths and opposite ink", () => {
    expect(light).toContain("<svg");
    expect(dark).toContain("<svg");
    expect(light).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(dark).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(light).toContain('viewBox="0 0 1024 1024"');
    expect(dark).toContain('viewBox="0 0 1024 1024"');
    expect(light).toContain("translate(246 205) scale(0.502269)");
    expect(dark).toContain("translate(246 205) scale(0.502269)");

    for (const svg of [light, dark]) {
      expect(svg).not.toMatch(/<image\b/i);
      expect(svg).not.toMatch(/<img\b/i);
      expect(svg).not.toContain("data:image");
      expect(svg).not.toContain(".png");
      expect(svg).not.toContain("href=");
      expect(svg.match(/<path\b/g)).toHaveLength(1);
    }

    expect(pathData(light)).toBe(pathData(dark));
    expect(pathData(light).length).toBeGreaterThan(1000);
    expect(light).toContain('fill="#000000"');
    expect(dark).toContain('fill="#ffffff"');
    expect(light.replace('fill="#000000"', "FILL")).toBe(dark.replace('fill="#ffffff"', "FILL"));
  });

  it("wires the SVG color-scheme switch, light raster fallbacks, and solid apple icon", () => {
    expect(layout).toContain('url: "/favicon-light.svg"');
    expect(layout).toContain('type: "image/svg+xml"');
    expect(layout).toContain('media: "(prefers-color-scheme: light)"');
    expect(layout).toContain('url: "/favicon-dark.svg"');
    expect(layout).toContain('media: "(prefers-color-scheme: dark)"');
    expect(layout).toContain('url: "/favicon.ico"');
    for (const size of [16, 32, 48, 192, 512]) {
      expect(layout).toContain(`url: "/icon-${size}.png"`);
      expect(layout).not.toContain(`url: "/icon-${size}-dark.png"`);
    }
    expect(layout).toContain('apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }');
    expect(layout).not.toContain("/JQD-logo.png");
    expect(layout).not.toContain("icon-180.png");
    expect(layout).toContain('logo: absoluteUrl("/icon-512.png")');
  });

  it("keeps titles, descriptions, site name, and social images", () => {
    expect(layout).toContain(
      "Jewellery Quintessential · 極氣 | Natural Stone Jewellery with Cultural Craft",
    );
    expect(layout).toContain('template: "%s — Jewellery Quintessential"');
    expect(layout).toContain('const HOUSE_NAME = "Jewellery Quintessential"');
    expect(layout).toContain("siteName: HOUSE_NAME");
    expect(layout.match(/name: HOUSE_NAME/g)).toHaveLength(2);
    expect(layout).not.toContain('name: "JQD Group"');
    expect(layout.match(/description: ROOT_DESCRIPTION/g)).toHaveLength(3);
    expect(layout.split(DESCRIPTION).length - 1).toBe(1);
    expect(layout).toContain('url: "/products/hero-image.jpg"');
    expect(layout).toContain('images: ["/products/hero-image.jpg"]');
  });

  it("leaves the header monogram and the previous logo file in place", () => {
    expect(existsSync(path.join(root, "public/JQD-logo.png"))).toBe(true);
    expect(header).toContain('src="/header/monogram-jq.png"');
    expect(paymentTestListingHidden).toBe(true);
  });

  it("uses an opaque 180 apple-touch icon on a solid ground", () => {
    expect(apple).toMatchObject({ width: 180, height: 180, colorType: 2, channels: 3, hasTrns: false });
    expect(apple.pixels.subarray(0, 3)).toEqual(Buffer.from([255, 255, 255]));
    const transparent180 = decodePng(readFileSync(path.join(root, "public/icon-180.png")));
    expect(transparent180.colorType).toBe(6);
    expect(sha256("public/icon-180.png")).not.toBe(sha256("public/apple-touch-icon.png"));
  });
});
