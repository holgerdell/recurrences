import { browser } from "$app/environment"

export interface LocalStorageStateOptions<T> {
	key: string
	defaultValue: T

	validate?: (value: unknown) => value is T

	serialize?: (value: T) => string
	deserialize?: (raw: string) => unknown

	onInit?: (value: T) => void
	onExternalChange?: (value: T) => void

	storage?: Storage
}

export interface LocalStorageState<T> {
	value: T
	set(value: T): void
	reset(): void
	refresh(): void
}

export function useLocalStorageState<T>(
	options: LocalStorageStateOptions<T>
): LocalStorageState<T> {
	const {
		key,
		defaultValue,
		validate,
		serialize = JSON.stringify,
		deserialize = JSON.parse,
		onInit,
		onExternalChange,
		storage = browser ? localStorage : undefined
	} = options

	// --- internal helpers ---

	function read(): T {
		if (!browser || !storage) return defaultValue

		const raw = storage.getItem(key)
		if (raw == null) return defaultValue

		try {
			const parsed = deserialize(raw)
			if (!validate || validate(parsed)) {
				return parsed
			}
			console.warn(`⚠️ Invalid data in localStorage for key "${key}"`)
		} catch (err) {
			console.error(`❌ Failed to deserialize localStorage key "${key}"`, err)
		}

		return defaultValue
	}

	function write(value: T) {
		if (!browser || !storage) return
		try {
			storage.setItem(key, serialize(value))
		} catch {
			/* silent */
		}
	}

	function clear() {
		if (!browser || !storage) return
		try {
			storage.removeItem(key)
		} catch {
			/* silent */
		}
	}

	// --- state ---

	let value = $state<T>(read())

	// --- initialization hook ---
	if (browser) {
		onInit?.(value)
	}

	// --- persist on change ---
	$effect(() => {
		if (!browser) return
		write(value)
	})

	// --- cross-tab synchronization ---
	$effect(() => {
		if (!browser || !storage) return

		function onStorage(e: StorageEvent) {
			if (e.key !== key) return
			const next = read()
			value = next
			onExternalChange?.(next)
		}

		window.addEventListener("storage", onStorage)
		return () => window.removeEventListener("storage", onStorage)
	})

	// --- public API ---
	return {
		get value() {
			return value
		},

		set(next: T) {
			value = next
		},

		reset() {
			value = defaultValue
			clear()
		},

		refresh() {
			value = read()
		}
	}
}
