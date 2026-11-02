<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { toast, type ToasterProps } from '../vendor/sonner-runtime/index.js';
	import { toastState } from '../vendor/sonner-runtime/toast-state.svelte.js';
	import { Toaster } from '../vendor/sonner/index.js';

	type Notification = {
		id: string;
		title: string;
		description?: string;
		kind?: 'default' | 'success' | 'info' | 'warning' | 'error';
		duration?: number;
	};

	type Active = {
		toastId: string;
		notification: Notification;
		finished: boolean;
	};

	let {
		notifications = [],
		position = 'bottom-right',
		closeButton = true,
		onDismiss,
	}: {
		notifications?: Notification[];
		position?: ToasterProps['position'];
		closeButton?: boolean;
		onDismiss?: (event: { id: string; reason: 'dismissed' | 'expired' }) => void;
	} = $props();

	const instanceId = $props.id();
	const toasterId = `viewstem-notifications-${instanceId}`;
	const active = new Map<string, Active>();
	let sequence = 0;

	function finish(entry: Active, reason: 'dismissed' | 'expired') {
		const { id } = entry.notification;
		if (active.get(id) !== entry || entry.finished) return;
		entry.finished = true;
		onDismiss?.({ id, reason });
	}

	function display(entry: Active) {
		const { title, description, duration, kind } = entry.notification;
		const showToast = kind && kind !== 'default' ? toast[kind] : toast;
		showToast(title, {
			id: entry.toastId,
			toasterId,
			description,
			duration,
			onDismiss: () => finish(entry, 'dismissed'),
			onAutoClose: () => finish(entry, 'expired'),
		});
	}

	$effect(() => {
		const desired = new Map<string, Notification>();
		for (const item of notifications) {
			const { id, title, description, kind, duration } = item;
			if (!id || desired.has(id)) continue;
			desired.set(id, { id, title, description, kind, duration });
		}

		// Sonner's singleton state must never become a dependency of this effect.
		untrack(() => {
			for (const [id, entry] of active) {
				if (desired.has(id)) continue;
				active.delete(id);
				if (!entry.finished) toast.dismiss(entry.toastId);
			}
			for (const [id, notification] of desired) {
				const entry = active.get(id);
				if (entry) {
					const old = entry.notification;
					if (entry.finished || (
						old.title === notification.title && old.description === notification.description &&
						old.kind === notification.kind && old.duration === notification.duration
					)) continue;
					entry.notification = notification;
					display(entry);
				} else {
					const next = { toastId: `${toasterId}-${sequence++}`, notification, finished: false };
					active.set(id, next);
					display(next);
				}
			}
		});
	});

	onDestroy(() => {
		active.clear();
		// Animated dismissal is processed by a mounted Toaster. During teardown
		// remove this instance's records and pending exit timers directly.
		untrack(() => {
			const owned = toastState.toasts.filter((item) => item.toasterId === toasterId);
			for (const item of owned) {
				toastState.cancelRemoval(item.id);
				toastState.removeHeight(item.id);
				toastState.remove(item.id);
			}
		});
	});
</script>

<Toaster id={toasterId} {position} {closeButton} data-viewstem-shadcn="" />
