import { Injectable } from '@angular/core';

/**
 * All the API urls used with the http service.
 */
export enum API_URL {
  LOCAL_ASSETS = '/assets/data/',
  ROOT = 'api',
}

@Injectable({
  providedIn: 'root',
})
export class HttpService {
  /**
   * Constructs a `GET` request that returns the response body as a JSON object.
   */
  public async get(apiUrl: API_URL, endpoint: string): Promise<any> {
    return fetch(`${apiUrl}${endpoint}`);
  }

  public delete(apiUrl: API_URL, endpoint: string, body = ''): Promise<any> {
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
  ): Promise<any> {
    return fetch(`${apiUrl}${endpoint}`, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
