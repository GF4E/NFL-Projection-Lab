self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  if (!["awaiting_you", "edge_threshold"].includes(payload.type)) return;
  event.waitUntil(self.registration.showNotification(payload.title || "Projection Lab", {
    body: payload.body || "A team card needs attention.",
    tag: payload.idempotencyKey,
    data: { url: payload.url || "/sunday" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const target = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (target) {
      await target.navigate(event.notification.data.url);
      return target.focus();
    }
    return clients.openWindow(event.notification.data.url);
  })());
});
