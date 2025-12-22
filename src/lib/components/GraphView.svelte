<script lang="ts">
	import { SvelteMap, SvelteSet } from "svelte/reactivity"
	import type { Graph, GraphNode } from "$lib/coloring/graph-utils"

	// ============================================================
	// Props
	// ============================================================
	interface Props {
		graph: Readonly<Graph>
		scale?: number
	}

	const { graph, scale = 1 }: Props = $props()
	const roots = $derived(
		graph.nodes
			.values()
			.filter(n => n.role === "root")
			.map(n => n.id)
	)
	const separator = $derived(
		new SvelteSet(
			graph.nodes
				.values()
				.filter(n => n.role === "separator")
				.map(n => n.id)
		)
	)

	// ============================================================
	// Layout parameters
	// ============================================================
	const NODE_W = 80
	const NODE_H = 52
	const HALF_EDGE_LENGTH = 80

	const H_GAP = 100
	const V_GAP = 24

	// ============================================================
	// BFS distances
	// ============================================================
	const distances = $derived.by(() => {
		const seeds: string[] = []
		const seen = new SvelteSet<string>()

		for (const id of roots) {
			if (seen.has(id)) continue
			if (!graph.nodes.values().some(n => n.id === id)) continue
			seeds.push(id)
			seen.add(id)
		}

		const dist = new SvelteMap<string, number>()
		const queue: string[] = []

		for (const seed of seeds) {
			dist.set(seed, 0)
			queue.push(seed)
		}

		while (queue.length > 0) {
			const v = queue.shift()!
			const d = dist.get(v)!

			for (const u of graph.neighbors(v)) {
				if (!dist.has(u)) {
					dist.set(u, d + 1)
					queue.push(u)
				}
			}
		}

		// Unreached nodes go to the last layer
		const max = Math.max(...dist.values())
		for (const n of graph.nodes) {
			if (!dist.has(n.id)) {
				dist.set(n.id, max + 1)
			}
		}

		return dist
	})

	// ============================================================
	// Layer grouping
	// ============================================================
	const layers = $derived.by(() => {
		const map = new SvelteMap<number, GraphNode[]>()
		for (const n of graph.nodes) {
			const d = distances.get(n.id)!
			if (!map.has(d)) map.set(d, [])
			map.get(d)!.push(n)
		}
		return map
	})

	// ============================================================
	// Positioned nodes
	// ============================================================
	interface PositionedNode extends GraphNode {
		x: number
		y: number
	}

	const positionedNodes = $derived.by(() => {
		const positioned: PositionedNode[] = []
		const layerEntries = Array.from(layers.entries()).sort((a, b) => a[0] - b[0])
		const layerSizes = layerEntries.map(([, nodesInLayer]) => nodesInLayer.length)
		const maxLayerSize = layerSizes.length ? Math.max(...layerSizes) : 0
		const graphHeight = maxLayerSize ? maxLayerSize * NODE_H + (maxLayerSize - 1) * V_GAP : NODE_H

		for (const [layer, nodesInLayer] of layerEntries) {
			const count = nodesInLayer.length || 1
			const totalH = count * NODE_H + (count - 1) * V_GAP
			const startY = graphHeight / 2 - totalH / 2

			nodesInLayer.forEach((n, i) => {
				positioned.push({
					...n,
					x: layer * (NODE_W + H_GAP),
					y: startY + i * (NODE_H + V_GAP)
				})
			})
		}

		return positioned
	})

	function findNode(id: string) {
		return positionedNodes.find(n => n.id === id)
	}

	function cx(x: number) {
		return x + NODE_W / 2
	}

	function cy(y: number) {
		return y + NODE_H / 2
	}

	// ============================================================
	// Dimensions
	// ============================================================
	const width = $derived.by(() => {
		if (!positionedNodes.length) return NODE_W
		return Math.max(...positionedNodes.map(n => n.x + NODE_W / 2 + HALF_EDGE_LENGTH))
	})

	const height = $derived.by(() => {
		if (!positionedNodes.length) return NODE_H
		return Math.max(...positionedNodes.map(n => n.y + NODE_H))
	})
</script>

<div class="relative mx-auto w-fit">
	<svg width={width * scale} height={height * scale}>
		{#each graph.edges as e (e.from + "|" + e.to)}
			{@const a = findNode(e.from)}
			{@const b = findNode(e.to)}
			{#if a && b}
				<line
					x1={cx(a.x) * scale}
					y1={cy(a.y) * scale}
					x2={cx(b.x) * scale}
					y2={cy(b.y) * scale}
					stroke="#6b7280"
					stroke-width="2" />
			{/if}
		{/each}

		{#each positionedNodes as n ("separator-" + n.id)}
			{#if separator.has(n.id)}
				{@const startX = cx(n.x) * scale}
				{@const startY = cy(n.y) * scale}
				{@const offset = HALF_EDGE_LENGTH * scale}
				<line
					x1={startX}
					y1={startY}
					x2={startX + offset}
					y2={startY - offset / 4}
					stroke="#f97316"
					stroke-width="2"
					stroke-dasharray="4 3" />
				<line
					x1={startX}
					y1={startY}
					x2={startX + offset}
					y2={startY + offset / 4}
					stroke="#f97316"
					stroke-width="2"
					stroke-dasharray="4 3" />
			{/if}
		{/each}
	</svg>

	{#each positionedNodes as n (n.id)}
		{@const stateClass =
			n.role === "root"
				? "border-blue-600 bg-blue-50"
				: n.diff === "changed"
					? "border-amber-600 bg-amber-50"
					: "border-slate-700 bg-slate-50"}

		<div
			class={`absolute flex flex-col items-center justify-center rounded-xl border-2 font-mono text-[0.8rem] text-slate-800 ${stateClass}`}
			style={`left:${n.x * scale}px; top:${n.y * scale}px; width:${NODE_W * scale}px; height:${NODE_H * scale}px`}>
			<div class="font-semibold">{n.id}</div>

			<div class="flex gap-1 text-xs">
				{#each n.colors as c (c)}
					<span>{c}</span>
				{/each}

				{#if n.removedColors}
					{#each n.removedColors as c (c)}
						<span class="line-through opacity-40">{c}</span>
					{/each}
				{/if}
			</div>
		</div>
	{/each}
</div>
