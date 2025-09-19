import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs/internal/Observable';
import { IPictogramResponse } from './picto-types';
import { SettingsService } from '../settings/settings.service';

@Injectable({
  providedIn: 'root',
})
export class PictogramService {
  private http = inject(HttpClient);
  private settingsSerivce = inject(SettingsService);

  private apirUrl = 'https://api.arasaac.org/v1/pictograms';
  private staticAssetUrl = 'https://static.arasaac.org/pictograms';
  private apiResource = 'search';

  constructor() {
    const settings = this.settingsSerivce.getCachedSystemSettings();
    this.apirUrl = settings?.urls?.pictogramApiUrl || this.apirUrl;
    this.staticAssetUrl =
      settings?.urls?.pictogramStaticUrl || this.staticAssetUrl;
  }

  getPictos(seachTerm: string): Observable<IPictogramResponse[]> {
    const language =
      this.settingsSerivce.getCachedUserSettings()?.general?.language || 'en';
    const url = `${this.apirUrl}/${language}/${this.apiResource}/${seachTerm}`;
    return this.http.get<IPictogramResponse[]>(url);
  }

  getPictoImageUrl(id: number, size = 300, fileType = 'png') {
    return `${this.staticAssetUrl}/${id}/${id}_${size}.${fileType}`;
  }

  getPictoImage(id: number): Observable<Blob> {
    const url = this.getPictoImageUrl(id);
    return this.http.get(url, { responseType: 'blob' });
  }
}
