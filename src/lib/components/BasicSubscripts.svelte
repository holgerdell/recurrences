<script lang="ts">
	interface Props {
		raw: string
		class?: string
	}
	const { raw, class: className }: Props = $props()

	const escapeHtml = (value: string) =>
		value
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;")

	const formatted = $derived(
		escapeHtml(raw)
			.replace(/\^{([^}]*)}/g, "<sup>$1</sup>")
			.replace(/_{([^}]*)}/g, "<sub>$1</sub>")
	)
	/* eslint svelte/no-at-html-tags: "off" */
</script>

<span class={className}>{@html formatted}</span>
