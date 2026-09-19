self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window" }).then((cs) => (cs[0] ? cs[0].focus() : clients.openWindow("/")))
  );
});
