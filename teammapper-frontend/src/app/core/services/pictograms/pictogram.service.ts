import { Injectable, OnDestroy } from "@angular/core";
import { HttpClient } from '@angular/common/http';
import { Observable } from "rxjs/internal/Observable";
import { IPictogramResponse } from "./picto-types";

@Injectable({
  providedIn: 'root',
})
export class PictogramService implements OnDestroy {
  private apirUrl = "https://api.arasaac.org/v1/pictograms"
  private staticAssetUrl = "https://static.arasaac.org/pictograms"
  private apiResource = "bestsearch"
  //export const apiBaseUrl = process.env.REACT_APP_API || 'https://api.arasaac.org/api';
  //export const apiIdentifierBaseUrl = process.env.REACT_APP_API_IMAGES || 'https://static.arasaac.org/images';

  constructor(private http: HttpClient) {}

  ngOnDestroy() {
  }

  getPictos(seachTerm: string): Observable<IPictogramResponse[]> {
    const language = 'de'
    const url = `${this.apirUrl}/${language}/${this.apiResource}/${seachTerm}`
    return this.http.get<IPictogramResponse[]>(url)
  }

  getPictoImageUrl(id: number, size: number = 300, fileType: string = 'png') {
    return `${this.staticAssetUrl}/${id}/${id}_${size}.${fileType}`
  }
}