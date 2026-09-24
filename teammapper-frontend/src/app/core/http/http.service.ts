import { Injectable } from '@angular/core';

/**
 * All the API urls used with the http service.
 */
export enum API_URL {
  ROOT = 'api',
}

@Injectable({
  providedIn: 'root',
})
export class HttpService {
  /**
   * Constructs a `GET` request that returns the response body as a JSON object.
   */
  public async get(apiUrl: API_URL, endpoint: string): Promise<Response> {
    return fetch(`${apiUrl}${endpoint}`);
  }

  public delete(
    apiUrl: API_URL,
    endpoint: string,
    body = ''
  ): Promise<Response> {
    return fetch(`${apiUrl}${endpoint}`, {
      method: 'DELETE',
      body,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Constructs a `POST` request that interprets the body as a JSON object and
   * returns the response body as a JSON object.
   */
  public async post(
    apiUrl: API_URL,
    endpoint: string,
    body = ''
  ): Promise<Response> {
    return fetch(`${apiUrl}${endpoint}`, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Constructs a multipart `POST` request. The browser sets the content type
   * with its boundary, so none is given here.
   */
  public postForm(
    apiUrl: API_URL,
    endpoint: string,
    body: FormData,
    headers: Record<string, string> = {}
  ): Promise<Response> {
    return fetch(`${apiUrl}${endpoint}`, { method: 'POST', body, headers });
  }
}
