<script lang="ts">
	import { parseRecurrences, recurrencesToPolynomialSystem } from "$lib/recurrence-solver"
	import { type Root, formatAsymptotics, formatCharacteristicPolynomials } from "$lib/root-finding"

	interface Props {
		title: string
		recurrences?: string
		root?: Root | null | "divergent"
		description?: string
		error?: string
		emptyMessage?: string
		kind?: "example" | "current" | "stored"
		showDelete?: boolean
		onDelete?: () => void
		onSelect?: () => void
	}

	const {
		title,
		recurrences,
		root,
		description,
		error,
		emptyMessage,
		showDelete = false,
		onDelete,
		onSelect,
		kind = "current"
	}: Props = $props()

	const parsed = $derived(parseRecurrences(recurrences ?? ""))
</script>

<div
	class={`rounded-lg border p-5 shadow-sm ${
		kind === "example"
			? "border-blue-200 bg-blue-50"
			: kind === "stored"
				? "border-slate-200 bg-white"
				: "border-slate-300 bg-white"
	}`}
>
	<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
		<!-- Recurrence Equations -->
		<div class="flex-1">
			<div class="mb-2 flex flex-wrap items-center justify-start gap-2">
				<h4 class="font-medium text-slate-700">{title}</h4>

				{#if showDelete && onDelete}
					<button
						onclick={onDelete}
						class="rounded bg-red-500 px-2 py-1 text-xs text-white transition-colors hover:bg-red-600"
					>
						Delete
					</button>
				{/if}

				{#if onSelect && !error && kind !== "current"}
					<button
						onclick={onSelect}
						class={`rounded px-2 py-1 text-xs text-white transition-colors ${
							kind === "example"
								? "bg-blue-600 hover:bg-blue-700"
								: "bg-green-600 hover:bg-green-700"
						}`}
					>
						{kind === "example" ? "Load Example" : "Load"}
					</button>
				{/if}

				{#if description}
					<div class="text-xs text-slate-500 italic">{description}</div>
				{/if}
			</div>

			{#if error}
				<div class="font-medium text-red-600">{error}</div>
			{:else if emptyMessage}
				<div class="text-slate-400 italic">{emptyMessage}</div>
			{:else if recurrences}
				<div
					class="space-y-3 rounded bg-slate-50 p-2 font-mono text-sm text-slate-600 ring-1 ring-slate-200"
				>
					{#each recurrences.split("\n") as line (line)}
						<div>{line}</div>
					{/each}
				</div>

				{#if kind === "current" && parsed.ok}
					<div class="mt-3">
						<div class="mb-1 text-sm text-slate-500">Characteristic polynomial</div>
						<div
							class="space-y-2 rounded bg-slate-50 p-2 font-mono text-sm text-slate-600 ring-1 ring-slate-200"
						>
							{#each formatCharacteristicPolynomials(recurrencesToPolynomialSystem(parsed.recurrences)) as poly (poly)}
								<div>{poly}</div>
							{/each}
						</div>
					</div>
				{/if}
			{/if}
		</div>

		<!-- Asymptotics -->
		{#if root && recurrences && kind !== "example"}
			<div class="lg:text-right">
				<div class="mb-1 text-sm text-slate-500">Asymptotics</div>
				<div
					class="rounded border border-green-200 bg-green-50 px-3 py-2 font-mono text-lg font-semibold text-green-700"
				>
					{formatAsymptotics(root)}
				</div>
			</div>
		{/if}
	</div>
</div>
