# Image Reverse Search

[![npm](https://img.shields.io/npm/v/image-reverse-search)](https://www.npmjs.com/package/image-reverse-search)
[![npm](https://img.shields.io/npm/dt/image-reverse-search)](https://www.npmjs.com/package/image-reverse-search)

A powerful and easy-to-use library for performing reverse image searches using Google Lens. This package allows you to scan images by URL, data, or file and returns the results in a structured format.

## Features

- Scan images by URL, Buffer, or File
- Supports multiple image formats
- Parses response to extract similar images results

## Installation

You can install the package via npm:

```sh
npm install image-reverse-search
```

## Usage

Here is a simple example of how to use the `image-reverse-search` package:

```javascript
import { inspect } from 'util';
const log = data => console.log(inspect(data, { depth: null, colors: true }));

import Irs from 'image-reverse-search';

const lens = new Irs();
lens.scanByURL(`https://en.wikipedia.org/static/images/icons/wikipedia.png`)
    .then(log)
    .catch(console.error);
```

### Methods

#### `scanByURL(url: string | URL, dimensions?: [number, number]): Promise<IrsResult[]>`

Scans an image by its URL.

#### `scanByData(data: Uint8Array, mime: typeof SUPPORTED_MIMES, originalDimensions: [number, number]): Promise<IrsResult[]>`

Scans an image by its data.

#### `scanByFile(path: string): Promise<IrsResult[]>`

Scans an image by its file path.

#### `scanByBuffer(buffer: Buffer): Promise<IrsResult[]>`

Scans an image by its buffer.

### Types

#### `IrsOptions`

```typescript
export type IrsOptions = {
  chromeVersion: string;
  majorChromeVersion: string;
  userAgent: string;
  endpoint: string;
  viewport: [number, number];
  headers: Record<string, string>;
  fetchOptions: RequestInit;
};
```

#### `IrsResult`

```typescript
export class IrsResult {
  title: string;
  link: string;
  imageUrl: string;
  source: string;
  faviconUrl: string;
}
```

#### `IrsError`

```typescript
export class IrsError extends Error {
  name: "IrsError";
  message: string;
  code: string;
  headers: Record<string, string>;
  body: string;
}
```

## License

This project is licensed under the MIT License.

## Credits

Developed by TejasLamba2006.
