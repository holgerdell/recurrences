import { browser } from "$app/environment"

/**
 * Configuration for creating a localStorage-backed reactive state wrapper.
 */
export interface LocalStorageStateOptions<T> {
	key: string
	defaultValue: T
	storage?: Storage
	serialize?: (value: T) => string
	deserialize?: (raw: string) => unknown
	validate: (value: unknown) => value is T
	onExternalChange?: (value: T) => void
}

type ResolvedLocalStorageStateOptions<T> = LocalStorageStateOptions<T> &
	Required<Pick<LocalStorageStateOptions<T>, "serialize" | "deserialize">>

const defaultStorage = browser ? localStorage : undefined
const defaultSerialize = JSON.stringify
const defaultDeserialize = JSON.parse

/**
 * Minimal Svelte-friendly API for reading and mutating persistent state.
 */
export class LocalStorageState<T> {
	options: ResolvedLocalStorageStateOptions<T>

	private _value

	constructor(options: Readonly<LocalStorageStateOptions<T>>) {
		this.options = {
			...options,
			storage: options.storage ?? defaultStorage,
			serialize: options.serialize ?? defaultSerialize,
			deserialize: options.deserialize ?? defaultDeserialize
		}
		this._value = $state<T>(readFromStorage(this.options))

		// --- cross-tab synchronization ---
		$effect(() => {
			if (!browser || !this.options.storage) return

			const onStorage = (e: StorageEvent) => {
				if (e.key !== this.options.key) return
				const next = readFromStorage(this.options)
				this._value = next
				this.options.onExternalChange?.(next)
			}

			window.addEventListener("storage", onStorage)
			return () => window.removeEventListener("storage", onStorage)
		})
	}

	get value() {
		return this._value
	}

	set(next: T) {
		this._value = next
		writeToStorage(this.options, next)
	}

	reset() {
		this._value = this.options.defaultValue
		if (!browser || !this.options.storage) return
		try {
			this.options.storage.removeItem(this.options.key)
		} catch {
			/* silent */
		}
	}

	refresh() {
		this._value = readFromStorage(this.options)
	}
}

function readFromStorage<T>(options: ResolvedLocalStorageStateOptions<T>): T {
	const { key, defaultValue, storage, deserialize, validate } = options
	if (!browser || !storage) return defaultValue

	const raw = storage.getItem(key)
	if (raw === null) return defaultValue

	try {
		const parsed = deserialize(raw)
		if (validate(parsed)) {
			return parsed
		}
		console.warn(`⚠️ Invalid data in localStorage for key "${key}"`)
	} catch (err) {
		console.error(`❌ Failed to deserialize localStorage key "${key}"`, err)
	}

	return defaultValue
}

function writeToStorage<T>(options: ResolvedLocalStorageStateOptions<T>, value: T) {
	const { key, storage, serialize } = options
	if (!browser || !storage || !serialize) return
	try {
		storage.setItem(key, serialize(value))
	} catch {
		/* silent */
	}
}
