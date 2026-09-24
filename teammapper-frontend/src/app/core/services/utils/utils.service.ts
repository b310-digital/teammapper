import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { isRasterImageFile } from '../mmp/node-images';

@Injectable({
  providedIn: 'root',
})
export class UtilsService {
  private translateService = inject(TranslateService);

  /**
   * Gets the nested property of object
   */
  public static get = (
    obj: Record<string, unknown> | object,
    path: string[]
  ): unknown =>
    path.reduce(
      (nestedObj: unknown, currentPath: string) =>
        nestedObj != null &&
        typeof nestedObj === 'object' &&
        currentPath in nestedObj
          ? (nestedObj as Record<string, unknown>)[currentPath]
          : null,
      obj
    );

  /**
   * Return the word with the first letter capitalized.
   */
  public static capitalizeWord(word: string): string {
    if (word === undefined || word === '') return '';
    return word.charAt(0).toUpperCase() + word.toLowerCase().slice(1);
  }

  /**
   * Return an observable of raster image files dropped onto the page. A drop
   * of markup, such as an image dragged from another web page, yields only a
   * remote URL, which the upload cannot take, so it emits nothing.
   */
  public static observableDroppedImages(): Observable<File> {
    return new Observable(subscriber => {
      window.document.ondragover = (event: DragEvent) => {
        event.preventDefault();
      };

      window.document.body.ondrop = (event: DragEvent) => {
        event.preventDefault();

        const droppedFile = event.dataTransfer?.files[0];
        if (droppedFile && isRasterImageFile(droppedFile)) {
          subscriber.next(droppedFile);
        }
      };
    });
  }

  /**
   * Download a file with a fake link click.
   */
  public static downloadFile(name: string, content: string) {
    const fakeLink = document.createElement('a');

    fakeLink.href = content;
    fakeLink.download = name;

    document.body.appendChild(fakeLink);

    fakeLink.click();

    document.body.removeChild(fakeLink);
  }

  /**
   * Return the HTML image element from an image URI.
   */
  public static imageFromUri(uri: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => {
        resolve(image);
      };
      image.onerror = reject;
      image.src = uri;
    });
  }

  /**
   * Return true if the string is a JSON Object.
   */
  public static isJSONString(JSONString: string) {
    try {
      JSON.parse(JSONString);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      return false;
    }
    return true;
  }

  /**
   * Return true if the two objects have the same structure (same keys).
   */
  public static isSameJSONStructure(json1: object, json2: object): boolean {
    function checkObjectStructure(
      object1: Record<string, unknown>,
      object2: Record<string, unknown>
    ): boolean {
      for (const key of Object.keys(object1)) {
        if (
          !Object.prototype.hasOwnProperty.call(object1, key) ||
          !Object.prototype.hasOwnProperty.call(object2, key)
        ) {
          return false;
        }

        if (typeof object1[key] === 'object') {
          if (
            !checkObjectStructure(
              object1[key] as Record<string, unknown>,
              object2[key] as Record<string, unknown>
            )
          ) {
            return false;
          }
        }
      }

      return true;
    }

    const first = json1 as Record<string, unknown>;
    const second = json2 as Record<string, unknown>;

    return (
      checkObjectStructure(first, second) && checkObjectStructure(second, first)
    );
  }

  /**
   * Return a translated string with given message and values.
   */
  public translate(
    message: string,
    values?: Record<string, unknown>
  ): Promise<string> {
    return firstValueFrom(this.translateService.get(message, values));
  }

  /**
   * Show a dialog window to confirm a choice.
   */
  public async confirmDialog(message: string): Promise<boolean> {
    message = await this.translate(message);

    return confirm(message);
  }
}
