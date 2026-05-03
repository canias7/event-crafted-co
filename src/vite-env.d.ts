/// <reference types="vite/client" />
/// <reference types="vite-imagetools/client" />

// vite-imagetools `?as=picture` import shape — narrows the `unknown` you'd
// otherwise get and lets the <Picture> helper consume it without casts.
declare module "*?as=picture" {
  const value: {
    sources: Record<string, string>;
    img: { src: string; w: number; h: number };
  };
  export default value;
}
