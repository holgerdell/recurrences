<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	
	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="w-dvw h-dvh">
<div class="p-10 h-full mx-auto w-full max-w-xl bg-slate-100">
	{@render children()}
</div>
</div>
