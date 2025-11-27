<script lang="ts">
    const initial = "T(n) = 2 T(n-1)"
    const initial_p = parse(initial)
    const initial_x = initial_p.ok && dominantRoot(initial_p.terms)
    const initial_log:[string , number][] = initial_p.ok && initial_x ? [[format(initial_p.terms), initial_x]] : []
  let S = $state({text:initial, log:initial_log})
type Term = { coef: number; offset: number };
type Recurrence=Term[]
type ParseResult =
  | { ok: true; terms: Recurrence }
  | { ok: false; error: string };

  function add(){
    const p = parse(S.text)
    if (!p.ok) return
    const last = S.log.at(-1)
    const out = format(p.terms)
    if (last && last[0] === out) return
    const x = dominantRoot(p.terms)
    if (x) S.log.push([out, x])
  }

  function formatNumber(x:number){ 
    return x.toFixed(4).replace(/\.?0+$/, "")
}
  
export function parse(expr: string): ParseResult {
  if (typeof expr !== "string" || expr.trim() === "") {
    return { ok: false, error: "Input must be a non-empty string" };
  }

  // Remove all whitespace characters
  expr = expr.replace(/\s+/g, "");

  // Split around '=', expect T(n)=... form
  const parts = expr.split("=");
  if (parts.length !== 2) {
    return { ok: false, error: "Expression must contain exactly one '='" };
  }

  const [lhs, rhs] = parts;
  if (!/^T\(n\)$/.test(lhs)) {
    return { ok: false, error: "Left-hand side must be 'T(n)'" };
  }

  // Match terms like "2*T(n-3)", "T(n-1)", or "3T(n-2)"
  const termPattern = /(?:(\d*)\*?)?T\(n-(\d+)\)/g;

  const terms: Recurrence = [];
  let m: RegExpExecArray | null;

  while ((m = termPattern.exec(rhs)) !== null) {
    const coef = m[1] ? parseInt(m[1], 10) : 1;
    const offset = parseInt(m[2], 10);
    terms.push({ coef, offset });
  }

  if (terms.length === 0) {
    return { ok: false, error: "No valid terms found on right-hand side" };
  }

  return { ok: true, terms };
}

// Converts the structured form back to a recurrence string
export function format(terms: Recurrence): string {
  // Build string for each term
  const parts = terms.map(({ coef, offset }) => {
    const coefStr = coef === 1 ? "" : `${coef}*`;
    return `${coefStr}T(n-${offset})`;
  });

  // Join with " + " and return full recurrence
  return `T(n) = ${parts.join(" + ")}`;
}

/**
 * Compute the dominant real root x > 0 of the characteristic polynomial
 * associated to the recurrence relation T(n) = Σ coef * T(n - offset)
 */
export function dominantRoot(terms: Recurrence): number | null {
  if (terms.length === 0) return null;

  // single-term shortcut: T(n) = c * T(n-k)
  if (terms.length === 1) {
    const { coef, offset } = terms[0];
    if (offset === 1) return coef; // T(n) = c*T(n-1) ⇒ x = c
  }

  // find degree (largest offset)
  const degree = Math.max(...terms.map(t => t.offset));

  // Build the polynomial coefficients for x^degree - Σ coef*x^(degree-offset)
  const coeffs = Array(degree + 1).fill(0);
  coeffs[0] = 1; // x^degree term
  for (const { coef, offset } of terms) {
    coeffs[offset] -= coef;
  }
  // coeffs[i] corresponds to x^(degree-i)

  // Define f(x)
  function f(x: number): number {
    let val = 0;
    for (let i = 0; i <= degree; i++) {
      val = val * x + coeffs[i];
    }
    return val;
  }

  // Search for positive root (dominant root)
  let lo = 0.0001;
  let hi = Math.max(2, ...terms.map(t => Math.abs(t.coef))) * 2;
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

  let parsed= $derived(parse(S.text))
  let log=$state([])
</script>
<h1 class="font-bold text-xl mb-12">Recurrence relation solver</h1>
<p>Write a recurrence relation:</p>
<div class="flex gap-4 items-center">
    <form onsubmit={add}>
    <!-- svelte-ignore a11y_autofocus -->
    <input autofocus type="text" bind:value={S.text} onsubmit={() => add()} class="m-2 p-1 ring-1 bg-green-100" />
    </form>
<div class="text-slate-400">
    {#if parsed.ok}
    {format(parsed.terms)}
    <span class="text-green-700 ml-8">
    {formatNumber(dominantRoot(parsed.terms) || 0)}^n
    </span>
{:else}
invalid syntax
{/if}
</div>
</div>
Press enter to add the recurrence relation to the list below.

<h1 class="font-bold text-lg mt-12 mb-4">Previous entries</h1>
{#each S.log as row}
<div><div class="text-green-700 w-20 text-right inline-block mr-4">{formatNumber(row[1])}^n</div>
{row[0]}</div>
{/each}