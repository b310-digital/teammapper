import Log from './log';

/**
 * A list of general useful functions.
 */
export default class Utils {
  /**
   * Clone an object in depth.
   * @param {object} object
   * @returns object
   */
  static cloneObject<T>(object: T): T {
    if (object === null) {
      return null as T;
    } else if (typeof object === 'object') {
      return JSON.parse(JSON.stringify(object)) as T;
    } else {
      Log.error('Impossible to clone a non-object', 'type');
      return object;
    }
  }

  /**
   * Clear an object.
   * @param {object} object
   */
  static clearObject(object: Record<string, unknown>) {
    for (const property in object) {
      delete object[property];
    }
  }

  /**
   * Convert an Object to an array.
   * @param {object} object
   * @returns {Array}
   */
  static fromObjectToArray<T = unknown>(object: Record<string, T>): T[] {
    const array: T[] = [];

    for (const p in object) {
      array.push(object[p]);
    }

    return array;
  }

  /**
   * Merge two objects.
   * @param {object} object1
   * @param {object} object2
   * @param {boolean} restricted
   * @returns {object} result
   */
  static mergeObjects<T extends object, U extends object = object>(
    object1: T,
    object2?: U,
    restricted = false
  ): T & U {
    if (object2 === undefined && this.isPureObjectType(object1)) {
      return this.cloneObject(object1) as T & U;
    } else if (object1 === undefined && this.isPureObjectType(object2)) {
      return this.cloneObject(object2) as T & U;
    } else if (
      !this.isPureObjectType(object1) ||
      !this.isPureObjectType(object2)
    ) {
      Log.error('Only two pure objects can be merged', 'type');
    }

    const result = this.cloneObject(object1) as Record<string, unknown>;
    const source = object2 as Record<string, unknown>;

    for (const property in source) {
      const value = source[property];

      if (!restricted || result[property] !== undefined) {
        if (this.isPrimitiveType(value) || value === null) {
          result[property] = value;
        } else if (Array.isArray(value)) {
          result[property] = Utils.cloneObject(value);
        } else if (this.isPureObjectType(value)) {
          if (this.isPureObjectType(result[property])) {
            result[property] = Utils.mergeObjects(
              result[property] as object,
              value as object
            );
          } else {
            result[property] = Utils.cloneObject(value);
          }
        } else {
          Log.error(`Type "${typeof value}" not allowed here`, 'type');
        }
      }
    }

    return result as T & U;
  }

  /**
   * Return css rules of an element.
   * @param {Element} element
   * @return {string} css
   */
  static cssRules(element: Element) {
    let css = '';
    const sheets = document.styleSheets;

    for (const sheet of Array.from(sheets)) {
      let rules: CSSRuleList | null;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }

      if (rules) {
        for (const rule of Array.from(rules)) {
          const fontFace = rule.cssText.match(/^@font-face/);
          const styleRule = rule instanceof CSSStyleRule ? rule : null;

          // Fix: Safari does not accept double colon as selector, e.g. abc::placeholder
          const sanitizedSelector: string | undefined =
            styleRule?.selectorText?.replace(/::.*/, '');

          if (
            (sanitizedSelector && element.querySelector(sanitizedSelector)) ||
            fontFace
          ) {
            css += rule.cssText;
          }
        }
      }
    }

    return css;
  }

  /**
   * Return true if the value is a primitive type.
   * @param value
   * @returns {boolean}
   */
  static isPrimitiveType(
    value: unknown
  ): value is string | number | boolean | undefined {
    return (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'undefined'
    );
  }

  /**
   * Return true if the value is a pure object.
   * @param value
   * @returns {boolean}
   */
  static isPureObjectType(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && !Array.isArray(value) && value !== null;
  }

  /**
   * Remove all ranges of window.
   */
  static removeAllRanges() {
    window.getSelection()?.removeAllRanges();
  }

  /**
   * Focus an element putting the cursor in the end.
   * @param {HTMLElement} element
   */
  static focusWithCaretAtEnd(element: HTMLElement) {
    const range = document.createRange(),
      sel = window.getSelection();

    element.focus();
    range.selectNodeContents(element);
    range.collapse(false);
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  /**
   * Gets the nested property of object
   * @param obj
   * @param path
   */
  static get = (obj: unknown, path: readonly string[]): unknown =>
    path.reduce(
      (nestedObj: unknown, currentPath: string) =>
        nestedObj &&
        typeof nestedObj === 'object' &&
        currentPath in (nestedObj as Record<string, unknown>)
          ? (nestedObj as Record<string, unknown>)[currentPath]
          : null,
      obj
    );
}
