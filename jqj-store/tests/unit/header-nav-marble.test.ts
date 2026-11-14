import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const PLATE = "public/header/marble-dark-nav-plate-2x.png";
const MONOGRAM = "public/header/monogram-jq.png";

/** Locked to the Owner-approved implement pack. Do not swap in a generated stone or a different mark. */
const PLATE_SHA256 = "53162e2f7fd48b8264ef078ce9511e40d95007c92b1b9513a5c44cc606216641";
const MONOGRAM_SHA256 = "bdca2fae5f4e4c65a8f84900d57602fb08c12657118ff0b847a46e6fdfa81ffb";

function source(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

function sha256(relative: string): string {
  return createHash("sha256").update(readFileSync(path.join(root, relative))).digest("hex");
}

type DecodedPng = {
  width: number;
  height: number;
  colorType: number;
  channels: number;
  pixels: Buffer;
};

function decodePng(buf: Buffer): DecodedPng {
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("not a png");
  }

  let offset = 8;
  const idat: Buffer[] = [];
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
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

  return { width, height, colorType, channels, pixels };
}

function pixel(image: DecodedPng, x: number, y: number): number[] {
  const index = (y * image.width + x) * image.channels;
  return Array.from(image.pixels.subarray(index, index + image.channels));
}

describe("storefront header nav marble", () => {
  const header = source("components/layout/Header.tsx");
  const css = source("app/globals.css");
  const announcement = source("components/layout/AnnouncementBar.tsx");
  const layout = source("app/layout.tsx");
  const monogram = decodePng(readFileSync(path.join(root, MONOGRAM)));
  const plate = decodePng(readFileSync(path.join(root, PLATE)));

  it("ships the approved plate and monogram bytes", () => {
    expect(sha256(PLATE)).toBe(PLATE_SHA256);
    expect(sha256(MONOGRAM)).toBe(MONOGRAM_SHA256);
    expect(plate).toMatchObject({ width: 2880, height: 152, colorType: 2, channels: 3 });
    expect(monogram).toMatchObject({ width: 1401, height: 1401, colorType: 6, channels: 4 });
  });

  it("keeps the monogram ground and Q counter open", () => {
    const corner = pixel(monogram, 8, 8);
    const counter = pixel(monogram, 700, 700);
    const letter = pixel(monogram, 1000, 550);

    expect(corner[3]).toBe(0);
    expect(counter[3]).toBe(0);
    expect(letter[3]).toBe(255);
    expect(letter[0]).toBeGreaterThan(180);
  });

  it("uses a dark green photographic plate rather than a gold foil", () => {
    let red = 0;
    let green = 0;
    let count = 0;
    for (let y = 0; y < plate.height; y += 8) {
      for (let x = 0; x < plate.width; x += 16) {
        const [r, g] = pixel(plate, x, y);
        red += r;
        green += g;
        count += 1;
      }
    }
    expect(green / count).toBeGreaterThan(red / count);
    expect(red / count).toBeLessThan(20);
  });

  it("paints the full nav bar with the plate at native vein scale", () => {
    expect(header).toContain('className="store-nav-stone pointer-events-none absolute inset-x-0 top-0 h-[4.75rem]"');
    expect(header).toContain('className="container-site relative flex h-[4.75rem] items-center justify-between gap-4"');
    expect(css).toContain('url("/header/marble-dark-nav-plate-2x.png")');
    expect(css).toContain("background-repeat: repeat-x;");
    expect(css).toContain("background-size: 1440px 76px;");
    expect(css).toContain("background-position: top center;");
    expect(css).not.toContain("background-size: 1440px 152px;");
    const stoneRule = css.slice(css.indexOf(".store-nav-stone"), css.indexOf(".store-nav-stone") + 400);
    expect(stoneRule).not.toContain("linear-gradient");

    const headerBar = header.slice(header.indexOf("<header"), header.indexOf("store-nav-stone"));
    expect(headerBar).not.toContain("bg-black/");
    expect(headerBar).not.toContain("backdrop-blur");
    expect(header).toContain('className="absolute inset-0 bg-black/72"');
  });

  it("replaces only the storefront header mark and keeps it an open inlay", () => {
    expect(header).toContain('src="/header/monogram-jq.png"');
    expect(header).not.toContain("JQD-logo.png");
    expect(header).toContain("h-11 w-11 bg-transparent object-contain");
    expect(header).toContain("lg:h-14 lg:w-14");
    expect(header).not.toContain("rounded-full object-cover");
    expect(header).toContain("motion-reduce:group-hover:scale-100");
    expect(header).toContain("useReducedMotion");
    expect(layout).not.toContain("/JQD-logo.png");
    expect(layout).toContain('url: "/favicon.ico"');
    expect(layout).toContain('logo: absoluteUrl("/icon-512.png")');
  });

  it("leaves announcement copy, routes, and hairlines in place", () => {
    expect(announcement).toContain("bg-black/80");
    expect(announcement).toContain("border-b border-white/8");
    expect(announcement).not.toContain("marble");
    expect(announcement).not.toContain("monogram-jq");
    expect(announcement).toContain("Free worldwide shipping on orders over");
    expect(announcement).toContain("Handcrafted with premium natural gemstones");
    expect(announcement).toContain("Free resizing for new customers");

    expect(header).toContain("from-transparent via-white/30 to-transparent");
    expect(header).toContain("border-white/6");
    expect(header).toContain("border-white/10");

    for (const label of ["New", "Limited Edition", "Bracelets", "Necklaces", "Sign In"]) {
      expect(header).toContain(label);
    }
    expect(header).toContain('href: "/new"');
    expect(header).toContain('href: "/bracelets?tag=limited"');
    expect(header).toContain('href: "/bracelets"');
    expect(header).toContain('href: "/necklaces"');
    expect(header).toContain('aria-label="Open menu"');
    expect(header).toContain('aria-label="Cart"');
    expect(header).toContain('aria-label="JQD Group home"');
  });
});
