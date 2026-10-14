#!/usr/bin/env python3
# Regenerates apps/{vendor,host}-mobile/locales/index.ts from the files in
# locales/<lang>/. Run from the repo root after adding a namespace:
#   python3 scripts/gen-app-locales-index.py
import os
import re
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "apps"))
for app in ["vendor-mobile","host-mobile"]:
    d=f"{app}/locales"
    nss=sorted(f[:-3] for f in os.listdir(f"{d}/en") if f.endswith(".ts"))
    for l in ["es","ru"]:
        assert sorted(f[:-3] for f in os.listdir(f"{d}/{l}") if f.endswith(".ts"))==nss, (app,l)
    lines=["// Every namespace in locales/<lang>/<namespace>.ts. To add one, create",
           "// the same file under en/, es/ and ru/ and list it here (imports are",
           "// spelled out so Metro bundles them with no special config).",
           "type Tree = { [key: string]: string | string[] | Tree };",""]
    ident=lambda l,ns: l+"_"+re.sub(r"\W","_",ns)
    for l in ["en","es","ru"]:
        for ns in nss: lines.append(f'import {ident(l,ns)} from "./{l}/{ns}";')
    lines.append("")
    lines.append("export const RESOURCES: Record<\"en\" | \"es\" | \"ru\", Record<string, Tree>> = {")
    for l in ["en","es","ru"]:
        lines.append(f"  {l}: {{")
        for ns in nss: lines.append(f"    {ns}: {ident(l,ns)} as Tree,")
        lines.append("  },")
    lines.append("};")
    open(f"{d}/index.ts","w").write("\n".join(lines)+"\n")
    print(app,len(nss))
