<script lang="ts">
	import { formatRecurrences, type Recurrence } from "$lib/recurrence-solver"
	import { type Root, formatAsymptotics } from "$lib/root-finding"

	interface Props {
		title: string
		recurrences?: Recurrence
		root?: Root | null
		error?: string
		emptyMessage?: string
		showDelete?: boolean
		onDelete?: () => void
	}

	const {
		title,
		recurrences,
		root,
		error,
		emptyMessage,
		showDelete = false,
		onDelete
	}: Props = $props()
</script>

<div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
	<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
		<!-- Recurrence Equations -->
		<div class="flex-1">
			<div class="mb-2 flex items-center justify-start gap-4">
				<h4 class="font-medium text-slate-700">{title}</h4>
				{#if showDelete && onDelete}
					<button
						onclick={onDelete}
						class="rounded bg-red-500 px-2 py-1 text-xs text-white transition-colors hover:bg-red-600"
					>
						Delete
					</button>
				{/if}
			</div>

			{#if error}
				<div class="font-medium text-red-600">{error}</div>
			{:else if emptyMessage}
				<div class="text-slate-400 italic">{emptyMessage}</div>
			{:else if recurrences}
				<div class="space-y-3 rounded bg-slate-50 p-2 font-mono text-sm text-slate-600 ring-1">
					{#each formatRecurrences(recurrences) as line (line)}
						<div>{line}</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Asymptotics -->
		{#if root && recurrences}
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
