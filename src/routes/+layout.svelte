<script lang="ts">
	import { page } from "$app/state"
	import "./layout.css"
	import favicon from "$lib/assets/favicon.svg"

	let { children } = $props()

	type Link = { href: string; text: string; exact?: boolean }

	const links: Link[] = [
		{ href: "/", text: "1D-Recurrences", exact: true },
		{ href: "/multi", text: "2D-Recurrences", exact: true }
	]

	const isActive = (href: string, exact: boolean | undefined, pathname: string) =>
		exact ? pathname === href : pathname === href || pathname.startsWith(href + "/")
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="w-dvw h-dvh">
	<div class="mx-auto w-full max-w-2xl h-full bg-slate-100">
		<header class="flex flex-row flex-wrap gap-8 bg-white">
			{#each links as { href, text, exact }}
				<a
					{href}
					class="p-4 aria-current:bg-slate-100 not-aria-current:shadow aria-current:underline hover:bg-blue-200 bg-black/10"
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
