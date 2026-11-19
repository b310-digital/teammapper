import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs/internal/Observable';
import { Pictogram } from '@teammapper/shared';
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

  getPictos(seachTerm: string): Observable<Pictogram[]> {
    const language = this.settingsSerivce.getLanguage();
    const term = encodeURIComponent(seachTerm);
    const url = `${this.apirUrl}/${language}/${this.apiResource}/${term}`;
    return this.http.get<Pictogram[]>(url);
  }

  getPictoImageUrl(id: number) {
    return `${this.staticAssetUrl}/${id}/${id}_300.png`;
  }

  getPictoImage(id: number): Observable<Blob> {
    const url = this.getPictoImageUrl(id);
    return this.http.get(url, { responseType: 'blob' });
  }
}
