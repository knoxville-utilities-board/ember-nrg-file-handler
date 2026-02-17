import { tracked } from '@glimmer/tracking';

import type {
  HttpMethod,
  RequestData,
  ResponseData,
  ResponseType,
  TransformedRequestData,
  FileTransferOptions,
} from './types';

export const GET = 'GET';
export const POST = 'POST';

export const TYPE_TEXT = '';
export const TYPE_ARRAY_BUFFER = 'arraybuffer';
export const TYPE_BLOB = 'blob';
export const TYPE_DOCUMENT = 'document';
export const TYPE_JSON = 'json';

export default class FileTransfer {
  @tracked
  _progress: number = 0.0;

  @tracked
  _loaded = 0;

  @tracked
  _total = 0;

  @tracked
  _error?: string;

  @tracked
  _result: ResponseData | null = null;

  @tracked
  _isProcessing = false;

  #baseUrl: string | URL;
  #method: HttpMethod;

  #headers: Record<string, string> = {};

  #request: XMLHttpRequest;

  #data?: RequestData;

  #dataURL: URL | null = null;

  /**
   *
   * @param url A URL string or a URL object.
   * @param options An object containing any custom settings
   * that you want to apply to the XMLHttpRequest.
   */
  constructor(url: string | URL, options?: FileTransferOptions) {
    this.#baseUrl = url;
    this.#method = options?.method ?? GET;
    this.#request = new XMLHttpRequest();

    this.#request.open(this.#method, url);

    this.#request.addEventListener('load', () => {
      if (this.#request.status >= 200 && this.#request.status < 300) {
        this._result = this.#request.response;
      } else {
        if (
          this.#request.responseType === '' ||
          this.#request.responseType === 'text'
        ) {
          this._error = this.#request.responseText;
        }

        this._error ??= this.#request.statusText;
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
   * @param key The name of the header.
   * @param value The value of the header.
   * @returns The FileTransfer instance.
   */
  withHeader(key: string, value: string) {
    this.#headers[key] = value;

    return this;
  }

  /**
   * Set the query parameters for the request. This method will append the query parameters to the URL. **Note:** Any existing query parameters will be overwritten.
   * @param params The query parameters to set. This can be any of the following:
     - A `URLSearchParams` object.
     - An object containing the query parameters.
     - `null` or `undefined` to remove any existing query parameters.
   * @returns The FileTransfer instance.
   */
  withQueryParams(params: URLSearchParams | Record<string, string> | null) {
    const url = new URL(this.#baseUrl);

    if (params instanceof URLSearchParams) {
      url.search = '?' + params.toString();
    } else if (typeof params === 'object' && params !== null) {
      for (const key in params) {
        url.searchParams.append(key, params[key] ?? '');
      }
    }
    this.#request.open(this.#method, url.toString());

    return this;
  }

  /**
   * Sets the data to be sent with the request.
   * @param data The data to send. This can be any of the following:
    - An object, or array, to send in the body of the request. This will be converted to JSON before being sent.
    - A `Blob`, `File`, `ArrayBuffer`, or `FormData` to send in the body of the request.
    - A `function` to be called immediately before the request is sent.
      This function should return one of the above.
      Promises are supported - if the promise rejects, an error will be thrown.
   * @returns The FileTransfer instance.
   */
  withData(data: RequestData) {
    this.#data = data;

    return this;
  }

  /**
   * Sets the type of response that is expected.
   *
   * **Note:** This must be called before `begin()`, and does not set the `Accept` header.
   * @param type The type of response that is expected. This can be any of the following:
    - `''` (empty string) - the response is expected to be text.
    - `'arraybuffer'` - the response is expected to be an ArrayBuffer.
    - `'blob'` - the response is expected to be a Blob.
    - `'document'` - the response is expected to be an HTML Document or XML XMLDocument, as appropriate based on the MIME type of the received data.
    - `'json'` - the response is expected to be a JSON-encoded value.
   * @returns The FileTransfer instance.
   */
  withResponseType(type: ResponseType) {
    this.#request.responseType = type;

    return this;
  }

  /**
   * Aborts the request.
   */
  abort() {
    this.#request?.abort();
  }

  /**
   * Determines if the request is uploading or downloading data.
   * @returns `true` if the request is uploading data, otherwise `false`.
   * @readonly
   */
  get isUpload() {
    return Boolean(this.#data);
  }

  /**
   * Determines if the upload or download has begun.
   *
   * @returns `true` if the upload or download has begun, otherwise `false`.
   * @readonly
   */
  get isProcessing() {
    return this._isProcessing;
  }

  /**
   * Determines if the request was successful.
   * @returns `true` if the request was successful, otherwise `false`.
   * @readonly
   */
  get isSuccessful() {
    return this.#request?.status >= 200 && this.#request?.status < 300;
  }

  /**
   * Gets the progress of the request as a number between 0 and 1.
   * @returns The progress of the request.
   * @readonly
   */
  get progress() {
    return this._progress;
  }

  /**
   * Gets the number of bytes that have been uploaded or downloaded.
   * @returns The number of bytes that have been uploaded or downloaded.
   * @readonly
   */
  get loaded() {
    return this._loaded;
  }

  /**
   * Gets the total number of bytes that will be uploaded or downloaded.
   * @returns The total number of bytes that will be uploaded or downloaded.
   * @readonly
   */
  get total() {
    return this._total;
  }

  /**
   * Gets the response of the request.
   * @returns The response of the request.
   * If the request has not completed, this will be `undefined`.
   * @readonly
   * @throws If the request was not successful, or if the request has not been initiated.
   */
  get response(): ResponseData | null | undefined {
    if (this._isProcessing) {
      return undefined;
    }
    if (!this.isSuccessful) {
      throw new Error(this._error);
    }
    return this._result;
  }

  /**
   * Generate a preview of the data that will be sent with the request.
   * The type of preview depends on the type of data:
    - If the data is a `Blob`, `File`, or `ArrayBuffer`, a URL will be generated. **Note:** This URL will be revoked when the request is sent.
      If you want to use this URL, you must clone it.
    - If the data is a `URLSearchParams` object, the query parameters will be appended to the base URL.
    - If the data is an object, it will be converted to JSON.
    - If the data is a function, it will be converted to a string.
    - If the data is a `FormData` object, it will be converted to an object and then to JSON.
    - Otherwise, the data will be returned as-is.
   */
  get preview(): string | URL | RequestData | null | undefined {
    if (this.#dataURL) {
      URL.revokeObjectURL(this.#dataURL.toString());
      this.#dataURL = null;
    }
    let data = this.#data;
    if (!this.isUpload) {
      if (data instanceof URLSearchParams) {
        return new URL(`${this.#baseUrl}?${data.toString()}`);
      }
      return null;
    }
    if (data instanceof ArrayBuffer) {
      data = new Blob([data]);
    }
    if (data instanceof Blob || data instanceof File) {
      this.#dataURL = new URL(URL.createObjectURL(data));
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
   * @returns A promise that resolves when the request is complete.
   */
  async begin(): Promise<ResponseData | null | void> {
    this._isProcessing = true;
    for (const key in this.#headers) {
      this.#request.setRequestHeader(key, this.#headers[key] ?? '');
    }
    const payload = await this.#transformData(this.#data);
    this.#request.send(payload);
    if (this.#dataURL) {
      URL.revokeObjectURL(this.#dataURL.toString());
      this.#dataURL = null;
    }

    return new Promise((resolve, reject) => {
      this.#request.addEventListener('load', () => resolve(this._result));
      this.#request.addEventListener(
        'loadend',
        () => (this._isProcessing = false)
      );
      this.#request.addEventListener('abort', () => resolve());
      this.#request.addEventListener('error', () => reject(this._error));
    });
  }

  #updateProgress(event: ProgressEvent) {
    if (event.lengthComputable) {
      this._progress = event.loaded / event.total;
    }
    this._loaded = event.loaded;
    this._total = event.total;
  }

  #onError() {
    this._error = this.#request.statusText;
  }

  async #transformData(
    data: RequestData | undefined
  ): Promise<TransformedRequestData> {
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

  #previewFormData(data: FormData) {
    const object: Record<string, FormDataEntryValue[]> = {};
    for (const key of data.keys()) {
      object[key] = data.getAll(key);
    }
    return JSON.stringify(object);
  }
}
