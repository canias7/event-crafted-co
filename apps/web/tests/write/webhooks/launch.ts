// Deno launcher for running a Supabase edge function as-is in a test.
//   deno run -A launch.ts <path/to/function/index.ts>
// The functions call std's serve()/Deno.serve() with the default port (8000).
// HARNESS_PORT moves every listener to a free port so functions can run side
// by side. Nothing else about the function changes.
const port = Number(Deno.env.get("HARNESS_PORT") || "0");
if (port) {
  const listen = Deno.listen.bind(Deno);
  // deno-lint-ignore no-explicit-any
  (Deno as any).listen = (opts: Deno.ListenOptions) => listen({ ...opts, port, hostname: "127.0.0.1" });
  const serve = Deno.serve.bind(Deno);
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (a: any, b?: any) => {
    if (typeof a === "function") return serve({ port, hostname: "127.0.0.1" }, a);
    return serve({ ...a, port, hostname: "127.0.0.1" }, b);
  };
}
const target = Deno.args[0];
await import(target.startsWith("file:") ? target : new URL(target, `file://${Deno.cwd()}/`).href);
