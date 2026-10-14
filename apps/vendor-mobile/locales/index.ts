// Every file in locales/<lang>/<namespace>.ts, picked up automatically
// (Metro's require.context, which expo-router already relies on): add a
// namespace by adding the same file under en/, es/ and ru/.
type Tree = { [key: string]: string | string[] | Tree };
type Resources = Record<"en" | "es" | "ru", Record<string, Tree>>;

declare const require: {
  context(dir: string, deep: boolean, filter: RegExp): {
    keys(): string[];
    (id: string): { default: Tree };
  };
};

const ctx = require.context("./", true, /^\.\/(en|es|ru)\/[\w-]+\.ts$/);

export const RESOURCES: Resources = { en: {}, es: {}, ru: {} };
for (const id of ctx.keys()) {
  const [, lang, ns] = id.match(/^\.\/(en|es|ru)\/([\w-]+)\.ts$/)!;
  RESOURCES[lang as keyof Resources][ns] = ctx(id).default;
}
