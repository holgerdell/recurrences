<script lang="ts">
    const initial = "T(n) = 2 T(n-1)"
    const initial_p = parseRecurrence(initial)
    const initial_x = initial_p.ok && dominantRoot(initial_p.recurrence)
    const initial_log:[Recurrence, number][] = initial_p.ok && initial_x ? [[initial_p.recurrence, initial_x]] : []
  let S = $state({text:initial, log:initial_log})

type Term = {
  coef: number;
  func: string;       // e.g. "T"
  vars: string[];     // e.g. ["n", "k"]
  offsets: Record<string, number>; // e.g. { n: 1, k: 0 }
};

type Recurrence = {
  func: string;   // "T"
  vars: string[]; // ["n"] or ["n", "k"]
  terms: Term[];
};

type ParseResult =
  | { ok: true; recurrence: Recurrence }
  | { ok: false; error: string };


  function add(){
    const p = parseRecurrence(S.text)
    if (!p.ok) return
    const last = S.log.at(-1)
    if (last && JSON.stringify(last[0]) === JSON.stringify(p.recurrence)) return
    const x = dominantRoot(p.recurrence)
    if (x) S.log.push([p.recurrence, x])
  }

  function formatNumber(x:number){ 
    return x.toFixed(4).replace(/\.?0+$/, "")
}
  
export function parseRecurrence(expr: string): ParseResult {
  if (typeof expr !== "string" || expr.trim() === "") {
    return { ok: false, error: "Input must be a non-empty string" };
  }

  expr = expr.replace(/\s+/g, "");

  const parts = expr.split("=");
  if (parts.length !== 2) {
    return { ok: false, error: "Expression must contain exactly one '='" };
  }

  const [lhs, rhs] = parts;

  // Allow only letters and underscores for function and variable names
  const lhsMatch = /^([A-Za-z_]+)\(([^)]*)\)$/.exec(lhs);
  if (!lhsMatch) {
    return {
      ok: false,
      error: "Left-hand side must be like f(n) or R(n,k)",
    };
  }

  const func = lhsMatch[1];
  const vars = lhsMatch[2]
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (vars.length === 0) {
    return { ok: false, error: "No variables found in function definition" };
  }

  if (vars.some((v) => !/^[A-Za-z_]+$/.test(v))) {
    return {
      ok: false,
      error: "Variables must contain only letters or underscores",
    };
  }

  // Split RHS on '+', trimming and ignoring empty parts
  const summands = rhs.split("+").map((t) => t.trim()).filter(Boolean);
  const rawTerms: Term[] = [];

  for (const summand of summands) {
    const termRegex = /^(?:(-?\d+)\*?)?([A-Za-z_]+)\(([^)]*)\)$/;
    const m = termRegex.exec(summand);
    if (!m) {
      return { ok: false, error: `Invalid term: ${summand}` };
    }

    const coef = m[1] ? parseFloat(m[1]) : 1;
    const fnName = m[2];
    const argsRaw = m[3].split(",").map((a) => a.trim());

    if (fnName !== func) {
      return {
        ok: false,
        error: `All terms must use the same function name (${func})`,
      };
    }

    if (argsRaw.length !== vars.length) {
      return {
        ok: false,
        error: `Term ${summand} has ${argsRaw.length} argument(s), expected ${vars.length}`,
      };
    }

    const offsets: Record<string, number> = {};
    for (let i = 0; i < vars.length; i++) {
      const expectedVar = vars[i];
      const arg = argsRaw[i];
      const matchArg = new RegExp(`^${expectedVar}([+-]\\d+)?$`).exec(arg);

      if (!matchArg) {
        return {
          ok: false,
          error: `Invalid argument '${arg}' in term '${summand}'`,
        };
      }

      const offset = matchArg[1] ? parseInt(matchArg[1], 10) : 0;
      offsets[expectedVar] = -offset;
    }

    rawTerms.push({ coef, func, vars, offsets });
  }

  // Combine identical terms
  const combinedMap = new Map<string, number>();
  for (const term of rawTerms) {
    const key = vars.map((v) => term.offsets[v] ?? 0).join(",");
    combinedMap.set(key, (combinedMap.get(key) ?? 0) + term.coef);
  }

  // Convert back to Term[]
  const terms: Term[] = [];
  for (const [key, coef] of combinedMap) {
    if (Math.abs(coef) < 1e-12) continue;
    const offsets: Record<string, number> = {};
    const values = key.split(",").map((s) => Number(s));
    vars.forEach((v, i) => (offsets[v] = values[i]));
    terms.push({ coef, func, vars, offsets });
  }

  // ✅ Sort by offsets (lexicographically by variables)
  terms.sort((a, b) => {
    for (const v of vars) {
      const diff = (a.offsets[v] ?? 0) - (b.offsets[v] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });

  return { ok: true, recurrence: { func, vars, terms } };
}

// Converts the structured form back to a recurrence string
export function formatRecurrence(recurrence: Recurrence): string {
  const { func, vars, terms } = recurrence;

  const lhs = `${func}(${vars.join(",")})`;

  const parts = terms.map(({ coef, offsets }) => {
    let coefStr = "";

    if (coef !== 1) coefStr = coef.toString() + "*";

    const args = vars
      .map((v) => {
        const off = offsets[v] ?? 0;
        if (off === 0) return v;
        if (off > 0) return `${v}-${off}`;
        return `${v}+${-off}`;
      })
      .join(",");

    return `${coefStr}${func}(${args})`;
  });

  return `${lhs} = ${parts.join(" + ")}`;
}
/**
 * Compute the dominant real root x > 0 of the characteristic polynomial
 * associated with a single‑variable recurrence relation
 * T(n) = Σ coef * T(n - offset)
 */
export function dominantRoot(recurrence: Recurrence): number | null {
  const terms = recurrence.terms;
  if (recurrence.vars.length !== 1) return null;

  const n = recurrence.vars[0];
  if (terms.length === 0) return null;

  // single‑term shortcut: T(n) = c * T(n - k)
  if (terms.length === 1) {
    const { coef, offsets } = terms[0];
    const offset = offsets[n];
    // Degenerate case: T(n) = c * T(n)
    if (offset === 0) return null;
    // Normal first‑order recurrence
    if (offset === 1) return coef;
  }

  // Find largest offset (degree)
  const degree = Math.max(...terms.map((t) => t.offsets[n]));

  // Degenerate: all offsets are 0 → self‑referential nonsense
  if (degree === 0) return null;

  // Build polynomial coefficients: x^degree - Σ coef * x^(degree - offset)
  const coeffs = Array(degree + 1).fill(0);
  coeffs[0] = 1; // x^degree term
  for (const { coef, offsets } of terms) {
    const offset = offsets[n];
    if (offset <= degree) {
      coeffs[offset] -= coef;
    }
  }

  // If all coefficients effectively cancel out → degenerate equation
  const allZero = coeffs.every((c) => Math.abs(c) < 1e-14);
  if (allZero) return null;

  // Polynomial evaluation
  function f(x: number): number {
    let val = 0;
    for (let i = 0; i <= degree; i++) {
      val = val * x + coeffs[i];
    }
    return val;
  }

  // Search for a positive real root (dominant root)
  let lo = 0.0001;
  let hi = Math.max(2, ...terms.map((t) => Math.abs(t.coef))) * 2;
  let flo = f(lo);
  let fhi = f(hi);

  // Expand hi until sign change
  while (flo * fhi > 0 && hi < 1e6) {
    lo = hi;
    hi *= 2;
    fhi = f(hi);
  }

  if (flo * fhi > 0) {
    // No positive root found
    return null;
  }

  // Binary search for root
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = f(mid);
    if (Math.abs(fm) < 1e-14) return Number(mid.toFixed(12));
    if (flo * fm < 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }

  const root = 0.5 * (lo + hi);
  return Number(root.toFixed(12));
}

  let parsed= $derived(parseRecurrence(S.text))
  let x = $derived(parsed.ok ? dominantRoot(parsed.recurrence):undefined)
  let log=$state([])
</script>
<h1 class="font-bold text-2xl mb-12">Recurrence relation solver</h1>
<p>Write a recurrence relation:</p>
<div class="flex gap-4 items-center">
    <form onsubmit={add}>
    <!-- svelte-ignore a11y_autofocus -->
    <input autofocus type="text" bind:value={S.text} onsubmit={() => add()} class="m-2 p-1 ring-1 bg-green-100" />
    </form>
<div class="text-slate-400">
    {#if parsed.ok}
    {formatRecurrence(parsed.recurrence)}
    <span class="text-green-700 ml-8">
        {#if x}
    {formatNumber(x)}^{parsed.recurrence.vars[0]}
        {/if}
    </span>
{:else}
Error: {parsed.error}
{/if}
</div>
</div>
Press enter to add the recurrence relation to the list below.

<h1 class="font-bold text-lg mt-12 mb-4">Stored recurrences</h1>
{#each S.log as row}
<div><div class="text-green-700 w-20 text-right inline-block mr-4">{formatNumber(row[1])}^n</div>
{formatRecurrence(row[0])}</div>
{/each}