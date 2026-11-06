import type { Fn } from "@/lib/functions";
import { fnName } from "@/lib/functions";
import { FN_GROUPS } from "@/lib/function-seed";

// Checkbox list of functions grouped by area. Groups with something ticked start open.
export default function FnPicker({ fns, name, selected, scopes, lang, L, skip = [] }: { fns: Fn[]; name: string; selected: string[]; scopes: string[]; lang: string; L: (k: string) => string; skip?: string[] }) {
  const list = fns.filter((f) => f.kind === "function" && scopes.includes(f.scope));
  return (
    <div>
      {FN_GROUPS.filter((g) => !skip.includes(g)).map((g) => {
        const items = list.filter((f) => f.grp === g);
        if (!items.length) return null;
        const n = items.filter((f) => selected.includes(f.key)).length;
        return (
          <details key={g} open={n > 0} style={{ margin: "4px 0" }}>
            <summary><b>{L("fnGrp_" + g)}</b>{n > 0 ? ` (${n})` : ""}</summary>
            <div className="row" style={{ gap: 14, flexWrap: "wrap", margin: "6px 0 6px 14px" }}>
              {items.map((f) => <label key={f.key} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" name={name} value={f.key} defaultChecked={selected.includes(f.key)} style={{ width: "auto" }} />{fnName(f, lang)}</label>)}
            </div>
          </details>
        );
      })}
    </div>
  );
}
