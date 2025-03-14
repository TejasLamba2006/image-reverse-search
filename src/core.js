import { imageDimensionsFromData } from 'image-dimensions';
import setCookie from 'set-cookie-parser';
import { LENS_ENDPOINT, MIME_TO_EXT, EXT_TO_MIME, SUPPORTED_MIMES } from './consts.js';
import { parseCookies, sleep } from './utils.js';
import * as cheerio from 'cheerio';
export class IrsError extends Error {
    constructor(message, code, headers, body) {
        super(message);
        this.name = 'IrsError';
        this.code = code;
        this.headers = headers;
        this.body = body;
    }
}

export class IrsResult {
    constructor(title, link, imageUrl, source, faviconUrl) {
        this.title = title;
        this.link = link;
        this.imageUrl = imageUrl;
        this.source = source;
        this.faviconUrl = faviconUrl;
    }
}

export default class IrsCore {
    #config = {};
    cookies = {};
    _fetch = globalThis.fetch && globalThis.fetch.bind(globalThis);

    constructor(config = {}, fetch) {
        if (typeof config !== 'object') {
            throw new TypeError('Lens constructor expects an object');
        }

        if (fetch) this._fetch = fetch;

        const chromeVersion = config?.chromeVersion ?? '131.0.6778.205';
        const majorChromeVersion = config?.chromeVersion?.split('.')[0] ?? chromeVersion.split('.')[0];

        this.#config = {
            chromeVersion,
            majorChromeVersion,
            sbisrc: `Google Chrome ${chromeVersion} (Official) Windows`,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            endpoint: LENS_ENDPOINT,
            viewport: [1920, 1080],
            headers: {},
            fetchOptions: {},
            ...config
        };

        // lowercase all headers
        for (const key in this.#config.headers) {
            const value = this.#config.headers[key];
            if (!value) {
                delete this.#config.headers[key];
                continue;
            }
            if (key.toLowerCase() !== key) {
                delete this.#config.headers[key];
                this.#config.headers[key.toLowerCase()] = value;
            }
        }

        this.#parseCookies();
    }

    updateOptions(options) {
        for (const key in options) {
            this.#config[key] = options[key];
        }

        this.#parseCookies();
    }

    async fetch(options = {}, originalDimensions = [0, 0], secondTry = false) {
        const url = new URL(options.endpoint ?? this.#config.endpoint)
        const params = url.searchParams

        params.append('ep', 'ccm'); // EntryPoint
        params.append('re', 'dcsp'); // RenderingEnvironment - DesktopChromeSurfaceProto
        params.append('s', '' + 4); // SurfaceProtoValue - Surface.CHROMIUM
        params.append('st', '' + Date.now()); // timestamp
        params.append('sideimagesearch', '1');
        params.append('vpw', this.#config.viewport[0]); // viewport width
        params.append('vph', this.#config.viewport[1]); // viewport height

        const headers = this.#generateHeaders();

        for (const key in this.#config.headers) {
            headers[key] = this.#config.headers[key];
        }

        this.#generateCookieHeader(headers);
        let response = await this._fetch(String(url), {
            headers,
            redirect: 'manual',
            ...options,
            ...this.#config.fetchOptions
        });

        let text = await response.text();
        this.#setCookies(response.headers.get('set-cookie'));

        // in some of the EU countries, Google requires cookie consent
        if (response.status === 302) {
            if (secondTry) {
                throw new IrsError('Lens returned a 302 status code twice', response.status, response.headers, text);
            }

            const consentHeaders = this.#generateHeaders();
            consentHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
            consentHeaders.Referer = 'https://consent.google.com/';
            consentHeaders.Origin = 'https://consent.google.com';

            this.#generateCookieHeader(consentHeaders);

            const location = response.headers.get('Location');

            if (!location) throw new Error('Location header not found');

            const redirectLink = new URL(location);
            const params = redirectLink.searchParams;
            params.append('x', '6');
            params.append('set_eom', 'true');
            params.append('bl', 'boq_identityfrontenduiserver_20240129.02_p0');
            params.append('app', '0');

            await sleep(500); // to not be suspicious
            const saveConsentRequest = await fetch('https://consent.google.com/save', {
                method: 'POST',
                headers: consentHeaders,
                body: params.toString(),
                redirect: 'manual'
            });

            if (saveConsentRequest.status === 303) {
                // consent was saved, save new cookies and retry the request
                this.#setCookies(saveConsentRequest.headers.get('set-cookie'));
                await sleep(500);
                return this.fetch({}, originalDimensions, true);
            }
        }

        if (response.status !== 200) {
            throw new IrsError('Lens returned a non-200 status code', response.status, response.headers, text);
        }

        try {
            const similarImages = this.#parseSimilarImages(text);
            return similarImages;
        } catch (e) {
            throw new IrsError(`Could not parse response: ${e.stack}`, response.status, response.headers, text);
        }
    }
    #parseSimilarImages(html) {
        const $ = cheerio.load(html);
        const similarImages = [];

        $('.G19kAf.ENn9pd').each((i, elem) => {
            const title = $(elem).find('.UAiK1e').text().trim();
            const link = $(elem).find('a').attr('href');
            const imageUrl = $(elem).find('img.wETe9b').attr('src');
            const source = $(elem).find('.fjbPGe').text().trim();
            const faviconUrl = $(elem).find('img.YRoOie').attr('src');

            similarImages.push(new IrsResult(title, link, imageUrl, source, faviconUrl));
        });
        return similarImages;
    }
    async scanByURL(url) {
        const imgData = await fetch(url).then(r => r.arrayBuffer());
        const ext = url.split('.').pop();
        let mime = EXT_TO_MIME[ext];
        if (!mime) mime = 'image/jpeg';

        return this.scanByData(imgData, mime);
    }

    async scanByData(uint8, mime, originalDimensions) {
        if (!SUPPORTED_MIMES.includes(mime)) {
            throw new Error('File type not supported');
        }

        let fileName = `image.${MIME_TO_EXT[mime]}`;

        let dimensions = imageDimensionsFromData(uint8);
        if (!dimensions) {
            throw new Error('Could not determine image dimensions');
        }

        let { width, height } = dimensions;
        // Google Lens does not accept images larger than 1000x1000
        if (width > 1000 || height > 1000) {
            throw new Error('Image dimensions are larger than 1000x1000');
        }
        if (!originalDimensions) originalDimensions = [width, height];

        const file = new File([uint8], fileName, { type: mime });
        const formdata = new FormData();

        formdata.append('encoded_image', file);
        formdata.append('original_width', '' + width);
        formdata.append('original_height', '' + height);
        formdata.append('processed_image_dimensions', `${width},${height}`);

        const options = {
            endpoint: LENS_ENDPOINT,
            method: 'POST',
            body: formdata,
        }

        return this.fetch(options, originalDimensions);
    }

    #generateHeaders() {
        return {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'max-age=0',
            'Origin': 'https://lens.google.com',
            'Referer': 'https://lens.google.com/',
            'Sec-Ch-Ua': `"Not A(Brand";v="99", "Google Chrome";v="${this.#config.majorChromeVersion}", "Chromium";v="${this.#config.majorChromeVersion}"`,
            'Sec-Ch-Ua-Arch': '"x86"',
            'Sec-Ch-Ua-Bitness': '"64"',
            'Sec-Ch-Ua-Full-Version': `"${this.#config.chromeVersion}"`,
            'Sec-Ch-Ua-Full-Version-List': `"Not A(Brand";v="99.0.0.0", "Google Chrome";v="${this.#config.majorChromeVersion}", "Chromium";v="${this.#config.majorChromeVersion}"`,
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Model': '""',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Ch-Ua-Platform-Version': '"15.0.0"',
            'Sec-Ch-Ua-Wow64': '?0',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': this.#config.userAgent,
            'X-Client-Data': 'CIW2yQEIorbJAQipncoBCIH+ygEIkqHLAQiKo8sBCPWYzQEIhaDNAQji0M4BCLPTzgEI19TOAQjy1c4BCJLYzgEIwNjOAQjM2M4BGM7VzgE='
            /*
                Decoded:
                message ClientVariations {
                    // Active Google-visible variation IDs on this client. These are reported for analysis, but do not directly affect any server-side behavior.
                    repeated int32 variation_id = [3300101, 3300130, 3313321, 3325697, 3330194, 3330442, 3361909, 3362821, 3385442, 3385779, 3385943, 3386098, 3386386, 3386432, 3386444];
                    // Active Google-visible variation IDs on this client that trigger server-side behavior. These are reported for analysis *and* directly affect server-side behavior.
                    repeated int32 trigger_variation_id = [3386062];
                }
            */
        };
    }

    #generateCookieHeader(header) {
        if (Object.keys(this.cookies).length > 0) {
            this.cookies = Object.fromEntries(Object.entries(this.cookies).filter(([name, cookie]) => cookie.expires > Date.now()));
            header.cookie = Object.entries(this.cookies)
                .map(([name, cookie]) => `${name}=${cookie.value}`).join('; ');
        }
    }

    #setCookies(combinedCookieHeader) {
        const splitCookieHeaders = setCookie.splitCookiesString(combinedCookieHeader);
        const cookies = setCookie.parse(splitCookieHeaders);

        if (cookies.length > 0) {
            for (const cookie of cookies) {
                this.cookies[cookie.name] = cookie;
                cookie.expires = cookie.expires.getTime();
            }
        }
    }

    #parseCookies() {
        if (this.#config?.headers?.cookie) {
            if (typeof this.#config?.headers?.cookie === 'string') {
                // parse cookies from string
                const cookies = parseCookies(this.#config.headers.cookie);
                for (const cookie in cookies) {
                    this.cookies[cookie] = {
                        name: cookie,
                        value: cookies[cookie],
                        expires: Infinity
                    };
                }
            } else {
                this.cookies = this.#config.headers.cookie;
            }
        }
    }
}
