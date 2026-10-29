interface NodeModule {
  id: string;
}

/**
 * True in the offline build, which keeps maps in the browser. The build
 * replaces the name with a literal; only main.ts reads it.
 */
declare const TEAMMAPPER_OFFLINE: boolean;
