<script lang="ts">
	import { page } from "$app/state"
	import { resolve } from "$app/paths"

	import "./layout.css"
	import favicon from "$lib/assets/favicon.svg"

	let { children } = $props()

	type Link = { href: string; text: string; exact?: boolean }

	const links: Link[] = [
		{ href: "/", text: "Recurrence relation solver", exact: true }
		// { href: "/multi", text: "2D-Recurrences", exact: true }
	]

	const isActive = (href: string, exact: boolean | undefined, pathname: string) =>
		exact ? pathname === href : pathname === href || pathname.startsWith(href + "/")
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="h-dvh w-dvw">
	<div class="mx-auto min-h-full w-full max-w-2xl bg-slate-100">
		<header class="flex flex-row flex-wrap gap-8 bg-white">
			{#each links as { href, text, exact } (href)}
				<a
					href={resolve(href)}
					class="bg-black/10 p-4 not-aria-current:shadow hover:bg-blue-200! aria-current:bg-slate-100 aria-current:underline"
					aria-current={isActive(href, exact, page.url.pathname)}
				>
					{text}
				</a>
			{/each}
		</header>

		<main class="p-10">
			{@render children()}
		</main>
	</div>
</div>
