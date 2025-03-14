export const LENS_ENDPOINT = "https://lens.google.com/v3/upload";
export const SUPPORTED_MIMES: [
  "image/x-icon",
  "image/bmp",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
  "image/heic"
];

export const MIME_TO_EXT: {
  "image/x-icon": "ico";
  "image/bmp": "bmp";
  "image/jpeg": "jpg";
  "image/png": "png";
  "image/tiff": "tiff";
  "image/webp": "webp";
  "image/heic": "heic";
};

export type IrsOptions = {
  chromeVersion: string;
  majorChromeVersion: string;
  userAgent: string;
  endpoint: string;
  viewport: [number, number];
  headers: Record<string, string>;
  fetchOptions: RequestInit;
};

export class IrsError extends Error {
  name: "IrsError";
  message: string;
  code: string;
  headers: Record<string, string>;
  body: string;
}

export type IrsResult = {
  title: string;
  link: string;
  imageUrl: string;
  source: string;
  faviconUrl: string;
};

export class IrsCore {
  cookies: NavigatorCookies;

  constructor(options?: Partial<IrsOptions>, _fetchFunction?: typeof fetch);
  updateOptions(options: Partial<IrsOptions>): void;

  scanByURL(
    url: string | URL,
    dimensions?: [number, number]
  ): Promise<IrsResult[]>;
  scanByData(
    data: Uint8Array,
    mime: typeof SUPPORTED_MIMES,
    originalDimensions: [number, number]
  ): Promise<IrsResult[]>;
}

export default class Irs extends IrsCore {
  constructor(options?: Partial<IrsOptions>, _fetchFunction?: typeof fetch);

  scanByFile(path: string): Promise<IrsResult[]>;
  scanByBuffer(buffer: Buffer): Promise<IrsResult[]>;
}
