// One language's strings, by namespace: locales/es/explore.json becomes
// bundle.explore. Each language module (en.ts, es.ts) builds one.
export type LanguageBundle = Record<string, Record<string, unknown>>;

export function toBundle(files: Record<string, { default: Record<string, unknown> }>): LanguageBundle {
  const bundle: LanguageBundle = {};
  for (const [path, file] of Object.entries(files)) {
    const namespace = path.match(/([^/]+)\.json$/)?.[1];
    if (namespace) bundle[namespace] = file.default;
  }
  return bundle;
}
