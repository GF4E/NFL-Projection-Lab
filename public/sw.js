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
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
