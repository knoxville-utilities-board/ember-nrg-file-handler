import { tracked } from '@glimmer/tracking';

export const GET = 'GET';
export const POST = 'POST';

export const TYPE_TEXT = '';
export const TYPE_ARRAY_BUFFER = 'arraybuffer';
export const TYPE_BLOB = 'blob';
export const TYPE_DOCUMENT = 'document';
export const TYPE_JSON = 'json';

export default class FileTransfer {
  @tracked
  #progress = 0.0;

  @tracked
  #loaded = 0;

  @tracked
  #total = 0;

  @tracked
  #error = null;

  @tracked
  #result = null;

  @tracked
  #isProcessing = false;

  #headers = {};

  #request;

  #data;

  #dataURL;

  /**
   *
   * @param {string|URL} url A URL string or a URL object.
   * @param {object} options An object containing any custom settings
   * that you want to apply to the XMLHttpRequest.
   */
  constructor(url, options) {
    this.baseUrl = url;
    this.method = options?.method || GET;
    this.#request = new XMLHttpRequest().open(this.method, url);

    this.#request.addEventListener('load', () => {
      if (this.#request.status >= 200 && this.#request.status < 300) {
        this.#result = this.#request.response;
      } else {
        this.#error = this.#request.responseText ?? this.#request.statusText;
      }
    });
    this.#request.upload.addEventListener('progress', this.#updateProgress);
    this.#request.upload.addEventListener('loadend', this.#updateProgress);
    this.#request.upload.addEventListener('error', this.#onError);
    this.#request.addEventListener('progress', this.#updateProgress);
    this.#request.addEventListener('loadend', this.#updateProgress);
    this.#request.addEventListener('error', this.#onError);
  }

  /**
   * Sets a header for the request.
   *
   * @param {string} key The name of the header.
   * @param {string} value The value of the header.
   * @returns {FileTransfer} The FileTransfer instance.
   */
  withHeader(key, value) {
    this.#headers[key] = value;

    return this;
  }

  /**
   * Set the query parameters for the request. This method will append the query parameters to the URL. **Note:** Any existing query parameters will be overwritten.
   * @param {URLSearchParams|object} params The query parameters to set. This can be any of the following:
     - A `URLSearchParams` object.
     - An object containing the query parameters.
     - `null` or `undefined` to remove any existing query parameters.
   * @returns {FileTransfer} The FileTransfer instance.
   */
  withQueryParams(params) {
    const url = new URL(this.baseUrl);

    if (params instanceof URLSearchParams) {
      url.search = params;
    } else if (typeof params === 'object' && params !== null) {
      for (const key in params) {
        url.searchParams.append(key, params[key]);
      }
    }
    this.#request.open(this.method, url.toString());

    return this;
  }

  /**
   * Sets the data to be sent with the request.
   * @param {any} data The data to send. This can be any of the following:
    - An object, or array, to send in the body of the request. This will be converted to JSON before being sent.
    - A `Blob`, `File`, `ArrayBuffer`, or `FormData` to send in the body of the request.
    - A `function` to be called immediately before the request is sent.
      This function should return one of the above.
      Promises are supported - if the promise rejects, an error will be thrown.
   * @returns {FileTransfer} The FileTransfer instance.
   */
  withData(data) {
    this.#data = data;

    return this;
  }

  /**
   * Sets the type of response that is expected.
   *
   * **Note:** This must be called before `begin()`, and does not set the `Accept` header.
   * @param {string} type The type of response that is expected. This can be any of the following:
    - `''` (empty string) - the response is expected to be text.
    - `'arraybuffer'` - the response is expected to be an ArrayBuffer.
    - `'blob'` - the response is expected to be a Blob.
    - `'document'` - the response is expected to be an HTML Document or XML XMLDocument, as appropriate based on the MIME type of the received data.
    - `'json'` - the response is expected to be a JSON-encoded value.
   * @returns {FileTransfer} The FileTransfer instance.
   */
  withResponseType(type) {
    this.#request.responseType = type;

    return this;
  }

  /**
   * Aborts the request.
   * @returns {void}
   */
  abort() {
    this.#request?.abort();
  }

  /**
   * Determines if the request is uploading or downloading data.
   * @returns {boolean} `true` if the request is uploading data, otherwise `false`.
   * @readonly
   */
  get isUpload() {
    return Boolean(this.#data);
  }

  /**
   * Determines if the upload or download has begun.
   *
   * @returns {boolean} `true` if the upload or download has begun, otherwise `false`.
   * @readonly
   */
  get isProcessing() {
    return this.#isProcessing;
  }

  /**
   * Determines if the request was successful.
   * @returns {boolean} `true` if the request was successful, otherwise `false`.
   * @readonly
   */
  get isSuccessful() {
    return this.#request?.status >= 200 && this.#request?.status < 300;
  }

  /**
   * Gets the progress of the request as a number between 0 and 1.
   * @returns {number} The progress of the request.
   * @readonly
   */
  get progress() {
    return this.#progress;
  }

  /**
   * Gets the number of bytes that have been uploaded or downloaded.
   * @returns {number} The number of bytes that have been uploaded or downloaded.
   * @readonly
   */
  get loaded() {
    return this.#loaded;
  }

  /**
   * Gets the total number of bytes that will be uploaded or downloaded.
   * @returns {number} The total number of bytes that will be uploaded or downloaded.
   * @readonly
   */
  get total() {
    return this.#total;
  }

  /**
   * Gets the response of the request.
   * @returns {ArrayBuffer|Blob|Document|Object|String} The response of the request.
   * If the request has not completed, this will be `undefined`.
   * @readonly
   * @throws If the request was not successful, or if the request has not been initiated.
   */
  get response() {
    if (this.#isProcessing) {
      return undefined;
    }
    if (!this.isSuccessful) {
      throw new Error(this.#error);
    }
    return this.#result;
  }

  /**
   * Generate a preview of the data that will be sent with the request.
   * The type of preview depends on the type of data:
    - If the data is a `Blob`, `File`, or `ArrayBuffer`, a URL will be generated. **Note:** This URL will be revoked when the request is sent.
      If you want to use this URL, you must clone it.
    - If the data is an object, it will be converted to JSON.
    - If the data is a function, it will be converted to a string.
    - If the data is a `FormData` object, it will be converted to an object and then to JSON.
    - Otherwise, the data will be returned as-is.
   */
  get preview() {
    if (this.#dataURL) {
      URL.revokeObjectURL(this.#dataURL);
      this.#dataURL = null;
    }
    const data = this.#data;
    if (!this.isUpload) {
      if (data instanceof URLSearchParams) {
        return `${this.url}?${data.toString()}`;
      }
      return null;
    }
    if (
      data instanceof Blob ||
      data instanceof File ||
      data instanceof ArrayBuffer
    ) {
      this.#dataURL = URL.createObjectURL(data);
      return this.#dataURL;
    }
    if (data instanceof FormData) {
      return this.#previewFormData(data);
    }
    if (typeof data === 'object') {
      return JSON.stringify(data);
    }
    if (typeof data === 'function') {
      return data.toString();
    }
    return data;
  }

  /**
   * Initiates the request. This method returns a promise that resolves when the request is complete:
    - If the request is successful, the promise will resolve with the response.
    - If the request is aborted, the promise will resolve with no value.
    - If the request fails, the promise will reject with an error.
   * @returns {Promise<unknown>}
   * @async
   */
  async begin() {
    this.#isProcessing = true;
    for (const key in this.#headers) {
      this.#request.setRequestHeader(key, this.#headers[key]);
    }
    const payload = await this.#transformData(this.#data);
    this.#request.send(payload);
    if (this.#dataURL) {
      URL.revokeObjectURL(this.#dataURL);
      this.#dataURL = null;
    }

    return new Promise((resolve, reject) => {
      this.#request.addEventListener('load', () => resolve(this.#result));
      this.#request.addEventListener(
        'loadend',
        () => (this.#isProcessing = false)
      );
      this.#request.addEventListener('abort', () => resolve());
      this.#request.addEventListener('error', () => reject(this.#error));
    });
  }

  #updateProgress(event) {
    if (event.lengthComputable) {
      this.#progress = event.loaded / event.total;
    }
    this.#loaded = event.loaded;
    this.#total = event.total;
  }

  #onError() {
    this.#error = this.#request.statusText;
  }

  async #transformData(data) {
    if (data === undefined) {
      return null;
    }
    if (
      data instanceof FormData ||
      data instanceof Blob ||
      data instanceof ArrayBuffer ||
      data instanceof File
    ) {
      return data;
    }
    if (typeof data === 'object') {
      if (data instanceof Promise) {
        return this.#transformData(() => data);
      }
      return JSON.stringify(data);
    }
    if (typeof data === 'function') {
      let result = data();
      if (result instanceof Promise) {
        result = await result.catch((error) => {
          throw new Error(
            'The function specified to generate the request data rejected',
            { cause: error }
          );
        });
        result = await result;
      }
      return this.#transformData(result);
    }
    return data;
  }

  #previewFormData(data) {
    const object = {};
    for (const key of data.keys()) {
      object[key] = data.getAll(key);
    }
    return JSON.stringify(object);
  }
}
